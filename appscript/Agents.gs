/** Agents : le chef de groupe ET l'admin peuvent créer des agents ; seul l'admin gère rôles, groupes et accès au Setup. */
var Agents = (function () {
  function list() { return Store.readTable('Agents'); }
  function get(id) { return list().filter(function (a) { return a.id === id; })[0]; }
  function publicAgent(a) {
    var o = {};
    Object.keys(a).forEach(function (k) { if (k !== 'password_hash' && k !== 'salt') o[k] = a[k]; });
    return o;
  }
  function activeAdmins(all) { return all.filter(function (x) { return x.role === 'admin' && x.actif === '1'; }).length; }
  function validEmail(e) { return /^\S+@\S+\.\S+$/.test(e); }
  function randomPassword() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }

  // Agents visibles : admin = tous, chef = son groupe + lui-même, agent = lui-même.
  // Personnel pointé : ni administrateurs ni comptes client (consultation).
  function isPerson(a) { return a.role !== 'admin' && a.role !== 'client'; }
  function alpha(arr) { return arr.sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom), 'fr', { sensitivity: 'base' }); }); }
  function visibleTo(user) { return alpha(visibleRaw(user)); }
  function visibleRaw(user) {
    var all = list().filter(function (a) { return a.actif === '1' && isPerson(a); });
    if (user.role === 'admin') return all;
    if (user.role === 'client') return user.contrat ? all.filter(function (a) { return a.contrat === user.contrat; }) : all; // le client suit le pointage (de son contrat)
    if (user.role === 'chef') return all.filter(function (a) { return a.chef_id === user.id || a.id === user.id; });
    return all.filter(function (a) { return a.id === user.id; });
  }
  // Agents que l'utilisateur peut gérer (créer/modifier) : admin = tous, chef = les agents de son groupe.
  // Rotation propre à l'agent « T/R » (ex. 14/14) ; vide = rotation par défaut du Setup.
  function normRotation(v) {
    var t = String(v == null ? '' : v).replace(/\s/g, '');
    if (!t) return '';
    var m = /^(\d{1,3})\/(\d{1,3})$/.exec(t);
    if (!m || Number(m[1]) < 1 || Number(m[2]) < 1) throw httpErr_('Rotation invalide : écrire jours de travail/jours de repos, par exemple 14/14');
    return Number(m[1]) + '/' + Number(m[2]);
  }
  function rotationParams(a, params) {
    var t = a && a.rotation ? /^(\d+)\/(\d+)$/.exec(a.rotation) : null;
    if (!t) return params;
    var o = {}; Object.keys(params).forEach(function (k) { o[k] = params[k]; });
    o.jours_travail = t[1]; o.jours_repos = t[2];
    return o;
  }
  function manageable(user, a) { return user.role === 'admin' || (user.role === 'chef' && a.chef_id === user.id && a.role === 'agent'); }

  function create(user, data) {
    var nom = String(data.nom || '').trim();
    var type = data.type === 'vehicule' ? 'vehicule' : 'personne';
    var isVh = type === 'vehicule'; // véhicule mis à disposition : pointé comme un agent, sans compte de connexion
    var email = isVh ? '' : String(data.email || '').trim().toLowerCase();
    if (!nom) throw httpErr_(isVh ? 'Immatriculation / identifiant du véhicule obligatoire' : 'Nom obligatoire');
    if (!isVh && !validEmail(email)) throw httpErr_('Email invalide');
    var isAdmin = user.role === 'admin';
    var role = isVh ? 'agent' : (isAdmin ? (data.role || 'agent') : 'agent');
    if (role === 'client' && !isAdmin) throw httpErr_('Réservé à l\'administrateur', 'FORBIDDEN');
    if (CFG.ROLES.indexOf(role) < 0) throw httpErr_('Rôle invalide');
    var all = list();
    if (email && all.some(function (a) { return a.email.toLowerCase() === email; })) throw httpErr_('Email déjà utilisé');
    var password = isVh ? '' : (data.password || randomPassword());
    var cred = isVh ? { password_hash: '', salt: '' } : Auth.makeCredentials(password);
    var fonction = Contrats.checkAffectation({ contrat: String(data.contrat || '').trim(), fonction: String(data.fonction || '').trim(), role: role, type: type }, '');
    var agent = {
      id: newId_('A'), nom: nom, fonction: fonction, affectation: String(data.affectation || '').trim(),
      contrat: String(data.contrat || '').trim(), email: email, role: role,
      chef_id: isAdmin ? String(data.chef_id || '') : user.id, actif: '1',
      acces_setup: isAdmin && role === 'chef' && data.acces_setup ? '1' : '0', acces_exports: isAdmin && role === 'chef' && data.acces_exports ? '1' : '0',
      password_hash: cred.password_hash, salt: cred.salt, date_entree: String(data.date_entree || ''), type: type, rotation: isVh ? '' : normRotation(data.rotation)
    };
    Store.writeTable('Agents', all.concat([agent]));
    return { agent: publicAgent(agent), password: password };
  }

  function update(user, id, data) {
    var all = list();
    var a = applyUpdate(user, all, id, data);
    Store.writeTable('Agents', all);
    return publicAgent(a);
  }
  // Modification groupée : mêmes champs pour plusieurs agents (affectation, rotation, contrat, chef, statut) ; tout ou rien.
  function updateMany(user, ids, data) {
    ids = (ids || []).filter(function (x, i, arr) { return arr.indexOf(x) === i; });
    if (!ids.length) throw httpErr_('Aucun agent sélectionné');
    var allowed = {};
    ['affectation', 'rotation', 'contrat', 'fonction', 'chef_id', 'actif'].forEach(function (k) { if (data && data[k] !== undefined && data[k] !== null) allowed[k] = data[k]; });
    if (!Object.keys(allowed).length) throw httpErr_('Rien à modifier : renseignez au moins un champ');
    var all = list();
    ids.forEach(function (id) { applyUpdate(user, all, id, allowed); });
    Store.writeTable('Agents', all);
    return { modifies: ids.length };
  }
  function applyUpdate(user, all, id, data) {
    var a = all.filter(function (x) { return x.id === id; })[0];
    if (!a) throw httpErr_('Agent introuvable');
    if (!manageable(user, a)) throw httpErr_("Vous ne pouvez pas modifier cet agent", 'FORBIDDEN');
    var isAdmin = user.role === 'admin';
    var before = { contrat: a.contrat, fonction: a.fonction, actif: a.actif };
    ['nom', 'fonction', 'affectation', 'contrat', 'date_entree'].forEach(function (k) { if (data[k] !== undefined) a[k] = String(data[k]).trim(); });
    if (data.email !== undefined && a.type !== 'vehicule') {
      var email = String(data.email).trim().toLowerCase();
      if (!validEmail(email)) throw httpErr_('Email invalide');
      if (all.some(function (x) { return x.id !== id && x.email.toLowerCase() === email; })) throw httpErr_('Email déjà utilisé');
      a.email = email;
    }
    if (data.rotation !== undefined && a.type !== 'vehicule') a.rotation = normRotation(data.rotation);
    if (data.actif !== undefined) {
      var actif = data.actif === true || data.actif === '1' || data.actif === 1 ? '1' : '0';
      if (actif === '0' && a.role === 'admin' && activeAdmins(all) < 2) throw httpErr_('Il faut au moins un administrateur');
      a.actif = actif;
    }
    if (isAdmin) {
      if (data.chef_id !== undefined) a.chef_id = String(data.chef_id);
      if (data.role !== undefined && a.type !== 'vehicule') {
        if (CFG.ROLES.indexOf(data.role) < 0) throw httpErr_('Rôle invalide');
        if (a.role === 'admin' && data.role !== 'admin' && activeAdmins(all) < 2) throw httpErr_('Il faut au moins un administrateur');
        a.role = data.role;
      }
      if (data.acces_setup !== undefined) a.acces_setup = data.acces_setup === true || data.acces_setup === '1' || data.acces_setup === 1 ? '1' : '0';
      if (data.acces_exports !== undefined) a.acces_exports = data.acces_exports === true || data.acces_exports === '1' || data.acces_exports === 1 ? '1' : '0';
      if (a.role !== 'chef') { a.acces_setup = '0'; a.acces_exports = '0'; }
    }
    // Contrat / fonction / réactivation modifiés : la fonction doit être prévue au contrat et l'effectif respecté.
    if (a.role !== 'admin' && a.actif === '1' && (a.contrat !== before.contrat || a.fonction !== before.fonction || before.actif !== '1')) a.fonction = Contrats.checkAffectation(a, a.id, all);
    return a;
  }

  function setPassword(user, id, password) {
    var all = list();
    var a = all.filter(function (x) { return x.id === id; })[0];
    if (!a) throw httpErr_('Agent introuvable');
    if (id !== user.id && !manageable(user, a)) throw httpErr_('Accès refusé', 'FORBIDDEN');
    var cred = Auth.makeCredentials(password);
    a.password_hash = cred.password_hash; a.salt = cred.salt;
    Store.writeTable('Agents', all);
    Auth.revokeAll(Store.tenantCode(), id); // les appareils « restés connectés » doivent se reconnecter
  }
  // Envoi par e-mail des accès d'un agent (lien, code entreprise, identifiant, mot de passe provisoire).
  // Le mot de passe n'est pas récupérable : sauf s'il vient d'être créé (et reste valide), un nouveau mot de passe provisoire est généré.
  function sendAccess(user, id, password) {
    var a = list().filter(function (x) { return x.id === id; })[0];
    if (!a) throw httpErr_('Agent introuvable');
    if (!manageable(user, a)) throw httpErr_('Accès refusé', 'FORBIDDEN');
    if (a.type === 'vehicule' || !/^\S+@\S+\.\S+$/.test(a.email || '')) throw httpErr_('Cet agent n\'a pas d\'adresse e-mail');
    if (a.actif !== '1') throw httpErr_('Compte désactivé : réactivez-le avant d\'envoyer les accès');
    var pw = String(password || '');
    var reuse = pw && Auth.check(a, pw);
    if (!reuse) { pw = randomPassword(); setPassword(user, id, pw); }
    var code = Tenants.codeActuel(); var societe = Params.get().prestataire_nom || 'Sijil';
    var body = 'Bonjour ' + a.nom + ',\n\nVotre accès à Sijil (' + societe + ') :\nLien : ' + (code ? Tenants.lien(code) : CFG.APP_SHELL_URL) + (code ? '\nCode entreprise : ' + code : '') + '\nIdentifiant : ' + a.email + '\nMot de passe provisoire : ' + pw + '\n(à changer à la première connexion)\n\nCordialement,\n' + user.nom;
    MailApp.sendEmail({ to: a.email, replyTo: user.email || undefined, subject: 'Votre accès Sijil — ' + societe, body: body });
    return { envoye: true, to: a.email, nouveau: !reuse, password: reuse ? '' : pw };
  }
  function changeOwnPassword(user, current, next) {
    if (!Auth.check(user, current)) throw httpErr_('Mot de passe actuel incorrect');
    setPassword(user, user.id, next);
  }
  // Création du premier administrateur (installation).
  function ensureAdmin(email, password, nom) {
    var all = list();
    if (all.some(function (a) { return a.role === 'admin'; })) return null;
    email = String(email || '').trim().toLowerCase();
    if (!validEmail(email)) throw httpErr_("E-mail de l'administrateur invalide");
    var cred = Auth.makeCredentials(password);
    var admin = { id: newId_('A'), nom: nom || 'Administrateur', fonction: '', affectation: '', contrat: '', email: email, role: 'admin', chef_id: '', actif: '1', acces_setup: '1', password_hash: cred.password_hash, salt: cred.salt, date_entree: '' };
    Store.writeTable('Agents', all.concat([admin]));
    return publicAgent(admin);
  }
  return { alpha: alpha, sendAccess: sendAccess, list: list, get: get, publicAgent: publicAgent, visibleTo: visibleTo, manageable: manageable, create: create, update: update, isPerson: isPerson, updateMany: updateMany, rotationParams: rotationParams, normRotation: normRotation, setPassword: setPassword, changeOwnPassword: changeOwnPassword, ensureAdmin: ensureAdmin };
})();
