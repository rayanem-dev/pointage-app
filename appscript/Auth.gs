/** Authentification : e-mail + mot de passe (haché + sel), sessions dans le cache du script. */
var Auth = (function () {
  var ITER = 300;
  function hash(password, salt) {
    var d = salt + password;
    for (var i = 0; i < ITER; i += 1) d = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, d));
    return d;
  }
  // ----- Activité : dernière connexion (propriété du script, sans toucher au classeur) et présence en ligne (cache, expire seul) -----
  var ONLINE_SECONDS = 180; // « en ligne » = une requête de l'application dans les 3 dernières minutes (elle en envoie une par minute)
  function tkey(code) { return code || 'MAIN'; }
  // Journal des connexions de toutes les entreprises (éditeur) : les 60 dernières, [date, code, nom, profil]. Une propriété du script (limite de 9 Ko).
  function journalAdd(code, agent) {
    var props = PropertiesService.getScriptProperties(); var list = [];
    try { list = JSON.parse(props.getProperty('LOG_ALL') || '[]'); } catch (e) { list = []; }
    list.unshift([new Date().toISOString(), code || '', String(agent.nom || '').slice(0, 28), agent.role || '']);
    list = list.slice(0, 60); var s = JSON.stringify(list);
    while (s.length > 8500 && list.length > 5) { list.pop(); s = JSON.stringify(list); }
    props.setProperty('LOG_ALL', s);
  }
  function journalSupport(code, user) { try { journalAdd(code, { nom: 'Support : ' + (user && user.nom || 'éditeur'), role: 'support' }); } catch (e) { Logger.log('Accès support non journalisé : ' + e.message); } }
  function journal() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('LOG_ALL') || '[]'); } catch (e) { return []; } }
  function noteLogin(code, agent) {
    var agentId = agent.id;
    try {
      var props = PropertiesService.getScriptProperties(); var k = 'LC_' + tkey(code) + '_' + agentId; var v = {};
      try { v = JSON.parse(props.getProperty(k) || '{}'); } catch (e) { v = {}; }
      var now = new Date().toISOString();
      props.setProperty(k, JSON.stringify({ last: now, prev: v.last || '', n: (Number(v.n) || 0) + 1 }));
      touch(code, agentId, true); journalAdd(code, agent);
    } catch (e) { Logger.log('Connexion non notée : ' + e.message); }
  }
  function touch(code, agentId, force) {
    try {
      var cache = CacheService.getScriptCache(); var k = 'PRES_' + tkey(code); var m = {};
      try { m = JSON.parse(cache.get(k) || '{}'); } catch (e) { m = {}; }
      var now = Date.now();
      if (!force && m[agentId] && now - m[agentId] < 60000) return; // au plus une écriture par minute et par personne
      m[agentId] = now;
      Object.keys(m).forEach(function (id) { if (now - m[id] > 3600000) delete m[id]; });
      cache.put(k, JSON.stringify(m), 3600);
    } catch (e) { /* présence facultative */ }
  }
  // Pour l'administrateur : qui est en ligne, qui s'est déjà connecté (date de la dernière connexion, nombre de connexions).
  function activity() {
    var code = Store.tenantCode(); var props = PropertiesService.getScriptProperties(); var all = props.getProperties(); var m = {};
    try { m = JSON.parse(CacheService.getScriptCache().get('PRES_' + tkey(code)) || '{}'); } catch (e) { m = {}; }
    var now = Date.now();
    return Store.readTable('Agents').filter(function (a) { return a.actif === '1' && a.type !== 'vehicule'; }).map(function (a) {
      var v = {}; try { v = JSON.parse(all['LC_' + tkey(code) + '_' + a.id] || '{}'); } catch (e) { v = {}; }
      var seen = m[a.id] || 0;
      return { id: a.id, nom: a.nom, role: a.role, contrat: a.contrat, email: a.email, en_ligne: !!seen && now - seen < ONLINE_SECONDS * 1000,
        vu: seen ? new Date(seen).toISOString() : '', derniere: v.last || '', precedente: v.prev || '', n: Number(v.n) || 0 };
    }).sort(function (x, y) { return (y.en_ligne - x.en_ligne) || (x.derniere < y.derniere ? 1 : x.derniere > y.derniere ? -1 : String(x.nom).localeCompare(String(y.nom), 'fr')); });
  }
  function newSalt() { return Utilities.getUuid().replace(/-/g, ''); }
  function makeCredentials(password) {
    if (!password || String(password).length < 6) throw httpErr_('Mot de passe : 6 caractères minimum');
    var salt = newSalt();
    return { salt: salt, password_hash: hash(String(password), salt) };
  }
  function check(agent, password) { return !!agent && !!agent.salt && hash(String(password || ''), agent.salt) === agent.password_hash; }

  function login(email, password, code, remember) {
    email = String(email || '').trim().toLowerCase();
    if (!email) throw httpErr_('Email ou mot de passe incorrect');
    var tenant = Tenants.use(code); // classeur du client (ou classeur unique sans annuaire)
    var cache = CacheService.getScriptCache();
    var key = 'L_' + tenant.code + '_' + email;
    var tries = Number(cache.get(key) || 0);
    if (tries >= 8) throw httpErr_('Trop de tentatives, réessayez dans 15 minutes');
    var agent = Store.readTable('Agents').filter(function (a) { return a.email.toLowerCase() === email && a.actif === '1'; })[0];
    if (!check(agent, password)) { cache.put(key, String(tries + 1), 900); throw httpErr_('Email ou mot de passe incorrect'); }
    cache.remove(key);
    var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    cache.put('S_' + token, tenant.code + '|' + agent.id, CFG.SESSION_SECONDS);
    noteLogin(tenant.code, agent);
    var out = { token: token, user: Agents.publicAgent(agent) };
    if (remember) out.remember = issueRemember(tenant.code, agent.id);
    return out;
  }

  // ----- « Rester connecté » : jeton de reconnexion (30 jours), seule son empreinte est conservée côté serveur -----
  function rmKey(token) { return 'RM_' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token))).replace(/[^A-Za-z0-9]/g, '').slice(0, 40); }
  function issueRemember(code, agentId) {
    var props = PropertiesService.getScriptProperties(); var all = props.getProperties(); var now = Date.now(); var mine = [];
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('RM_') !== 0) return;
      var v; try { v = JSON.parse(all[k]); } catch (e) { v = null; }
      if (!v || v.e < now) { props.deleteProperty(k); return; } // purge des jetons expirés
      if (v.a === agentId && v.c === code) mine.push({ k: k, e: v.e });
    });
    mine.sort(function (x, y) { return x.e - y.e; }); while (mine.length >= 3) props.deleteProperty(mine.shift().k); // au plus 3 appareils par compte
    var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    props.setProperty(rmKey(token), JSON.stringify({ c: code, a: agentId, e: now + CFG.REMEMBER_DAYS * 86400000 }));
    return token;
  }
  // Reconnexion sans mot de passe avec le jeton mémorisé : vérifie le compte et la licence, renouvelle le jeton.
  function resume(rmToken) {
    var props = PropertiesService.getScriptProperties(); var key = rmKey(rmToken || 'x'); var raw = props.getProperty(key); var v = null;
    try { v = raw ? JSON.parse(raw) : null; } catch (e) { v = null; }
    if (!v || v.e < Date.now()) { if (raw) props.deleteProperty(key); throw httpErr_('Session expirée', 'SESSION'); }
    try { if (v.c) Tenants.use(v.c); else Store.setTenant('', ''); } catch (e) { throw httpErr_(e.message, 'SESSION'); }
    var agent = Agents.get(v.a);
    if (!agent || agent.actif !== '1') { props.deleteProperty(key); throw httpErr_('Session expirée', 'SESSION'); }
    props.deleteProperty(key);
    var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    CacheService.getScriptCache().put('S_' + token, v.c + '|' + agent.id, CFG.SESSION_SECONDS);
    noteLogin(v.c, agent);
    return { token: token, user: Agents.publicAgent(agent), remember: issueRemember(v.c, agent.id) };
  }
  function forget(rmToken) { if (rmToken) PropertiesService.getScriptProperties().deleteProperty(rmKey(rmToken)); return true; }
  // Tous les appareils mémorisés d'un compte sont oubliés (changement ou réinitialisation du mot de passe).
  function revokeAll(code, agentId) {
    var props = PropertiesService.getScriptProperties(); var all = props.getProperties();
    Object.keys(all).forEach(function (k) { if (k.indexOf('RM_') !== 0) return; var v; try { v = JSON.parse(all[k]); } catch (e) { v = null; } if (!v || (v.a === agentId && v.c === code)) props.deleteProperty(k); });
  }

  // ----- Mot de passe oublié : un code à 6 chiffres envoyé par e-mail (30 min, 5 essais) -----
  function forgotKey(code, email) { return 'P_' + code + '_' + email; }
  function forgot(email, code) {
    email = String(email || '').trim().toLowerCase();
    var tenant = Tenants.use(code); var cache = CacheService.getScriptCache();
    if (/^\S+@\S+\.\S+$/.test(email)) {
      var rl = 'F_' + tenant.code + '_' + email; var n = Number(cache.get(rl) || 0);
      if (n >= 3) throw httpErr_('Trop de demandes pour cette adresse, réessayez dans une heure');
      if (!Format.allow('F_ALL_' + tenant.code, 40, 3600)) throw httpErr_('Trop de demandes en ce moment, réessayez plus tard'); // plafond global : protège le quota d'e-mails
      cache.put(rl, String(n + 1), 3600);
      var agent = Store.readTable('Agents').filter(function (a) { return a.email.toLowerCase() === email && a.actif === '1' && a.type !== 'vehicule'; })[0];
      if (agent) {
        var secret = ('000000' + (parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000)).slice(-6);
        cache.put(forgotKey(tenant.code, email), JSON.stringify({ h: hash(secret, email), n: 0 }), 1800);
        try {
          MailApp.sendEmail({ to: email, subject: 'Votre code de réinitialisation Sijil', body: 'Bonjour ' + agent.nom + ',\n\nVotre code de réinitialisation du mot de passe Sijil : ' + secret + '\n\nIl est valable 30 minutes. Saisissez-le sur la page de connexion, avec votre nouveau mot de passe.\n\nSi vous n\'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.' });
        } catch (e) { Logger.log('Code non envoyé : ' + e.message); }
      }
    }
    return { envoye: true }; // même réponse que l'adresse existe ou non
  }
  function resetPassword(email, secret, newPassword, code) {
    email = String(email || '').trim().toLowerCase();
    var tenant = Tenants.use(code); var cache = CacheService.getScriptCache(); var key = forgotKey(tenant.code, email);
    var raw = cache.get(key); var st = null; try { st = raw ? JSON.parse(raw) : null; } catch (e) { st = null; }
    if (!st) throw httpErr_('Code invalide ou expiré');
    if (st.n >= 5) { cache.remove(key); throw httpErr_('Trop d\'essais : demandez un nouveau code'); }
    if (hash(String(secret || '').trim(), email) !== st.h) { st.n += 1; cache.put(key, JSON.stringify(st), 1800); throw httpErr_('Code invalide ou expiré'); }
    var cred = makeCredentials(newPassword); // vérifie les 6 caractères avant d'utiliser le code
    var all = Agents.list(); var agent = all.filter(function (a) { return a.email.toLowerCase() === email && a.actif === '1'; })[0];
    if (!agent) throw httpErr_('Code invalide ou expiré');
    agent.password_hash = cred.password_hash; agent.salt = cred.salt; Store.writeTable('Agents', all);
    cache.remove(key); cache.remove('L_' + tenant.code + '_' + email); revokeAll(tenant.code, agent.id);
    return { ok: true };
  }
  // Session ouverte sans mot de passe pour le support (éditeur → espace d'un client en essai) : même durée qu'une connexion normale.
  function openSession(code, agent) {
    var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    CacheService.getScriptCache().put('S_' + token, code + '|' + agent.id, CFG.SESSION_SECONDS);
    return { token: token, user: Agents.publicAgent(agent) };
  }
  function logout(token) { CacheService.getScriptCache().remove('S_' + token); }
  function userFromToken(token) {
    if (!token) throw httpErr_('Session expirée', 'SESSION');
    var v = CacheService.getScriptCache().get('S_' + token);
    var i = v ? v.indexOf('|') : -1; // « code|id » (anciennes sessions : id seul)
    var id = i < 0 ? v : v.slice(i + 1);
    var code = i < 0 ? '' : v.slice(0, i);
    if (v) { if (code) Tenants.use(code); else Store.setTenant('', ''); } // refuse un client suspendu ou à licence expirée (session ouverte avant l'annuaire : classeur principal)
    var agent = id && Agents.get(id);
    if (!agent || agent.actif !== '1') throw httpErr_('Session expirée', 'SESSION');
    touch(code, agent.id);
    return agent;
  }
  function canSetup(user) { return user.role === 'admin' || (user.role === 'chef' && user.acces_setup === '1'); }
  return { journalSupport: journalSupport, journal: journal, activity: activity, forgot: forgot, resetPassword: resetPassword, resume: resume, forget: forget, revokeAll: revokeAll, openSession: openSession, makeCredentials: makeCredentials, check: check, login: login, logout: logout, userFromToken: userFromToken, canSetup: canSetup };
})();
