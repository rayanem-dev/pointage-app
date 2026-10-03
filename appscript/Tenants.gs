/**
 * Plusieurs clients sur un même déploiement : chaque client a son classeur (vierge à la création) ; l'annuaire (onglet « Clients »
 * du classeur principal) donne pour un code entreprise le classeur, le statut et la fin de licence.
 * Sans annuaire, tout fonctionne comme avant (un seul classeur, pas de code).
 * Le classeur principal reste l'annuaire ; son administrateur est l'éditeur (OWNER_EMAILS dans les propriétés du script, sinon tout administrateur du classeur principal).
 */
var Tenants = (function () {
  var STATUTS = ['essai', 'actif', 'suspendu'];

  function normCode(c) { return String(c == null ? '' : c).toUpperCase().replace(/[^A-Z0-9_-]/g, ''); }
  function validCode(c) { return /^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(c) && c !== CFG.CODE_EDITEUR; }

  function hasRegistry() { return list().length > 0; }
  function list() { return Store.withMaster(function () { return Store.readTable('Clients'); }); }
  function save(rows) { Store.withMaster(function () { Store.writeTable('Clients', rows); }); }
  function find(code) { return list().filter(function (c) { return c.code === code; })[0]; }
  function multi() { return hasRegistry(); }

  // Limite les essais de codes inconnus (évite de deviner les codes des autres clients).
  function failedCode() {
    var cache = CacheService.getScriptCache(); var n = Number(cache.get('CODE_FAILS') || 0);
    if (n >= 60) throw httpErr_('Trop de codes incorrects, réessayez dans 10 minutes');
    cache.put('CODE_FAILS', String(n + 1), 600);
    throw httpErr_('Code entreprise inconnu');
  }
  function checkLicense(c) {
    if (c.statut === 'suspendu') throw httpErr_('Accès suspendu : contactez l\'éditeur ou votre administrateur', 'SUSPENDU');
    if (c.fin_licence && c.fin_licence < Dates.today()) throw httpErr_('Licence expirée le ' + c.fin_licence.split('-').reverse().join('/') + ' : contactez l\'éditeur', 'SUSPENDU');
  }
  // Positionne le client courant. Sans annuaire : classeur principal (comportement historique).
  function use(code) {
    code = normCode(code);
    Store.setTenant('', '');
    if (code === CFG.CODE_EDITEUR) return { code: code, nom: 'Administration', master: true }; // alias du classeur principal : un seul compte, celui de l'éditeur
    if (!hasRegistry()) return { code: '', nom: '', master: true };
    if (!code) throw httpErr_('Code entreprise requis');
    var c = find(code);
    if (!c) failedCode();
    checkLicense(c);
    Store.setTenant(c.code, c.classeur_id);
    return c;
  }

  function ownerEmails() {
    return String(PropertiesService.getScriptProperties().getProperty('OWNER_EMAILS') || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
  }
  // Éditeur : administrateur du classeur principal (restreint à OWNER_EMAILS s'il est renseigné).
  function isOwner(user) {
    if (!user || user.role !== 'admin' || Store.tenantId()) return false;
    var o = ownerEmails();
    return !o.length || o.indexOf(String(user.email).toLowerCase()) >= 0;
  }
  // Console de l'éditeur : administrateur du classeur principal connecté avec le code réservé ADMIN.
  function requireOwner(user) { if (!isOwner(user)) throw httpErr_('Réservé à l\'éditeur', 'FORBIDDEN'); }

  // Lien d'invitation : la page d'accueil et le code suffisent (l'annuaire donne le classeur, l'adresse du déploiement est dans la page d'accueil).
  function lien(code) { return CFG.APP_SHELL_URL + '?c=' + code; }
  function view(c) {
    return { code: c.code, nom: c.nom, statut: c.statut, fin_licence: c.fin_licence, contact: c.contact, exec_url: c.exec_url, note: c.note, cree_le: c.cree_le, principal: !c.classeur_id,
      vitrine: c.vitrine === '1', lien: lien(c.code), classeur: c.classeur_id ? 'https://docs.google.com/spreadsheets/d/' + c.classeur_id : '' };
  }
  function clients(user) {
    requireOwner(user);
    return { clients: list().filter(function (c) { return c.classeur_id; }).map(view), base: CFG.APP_SHELL_URL }; // le classeur principal, c'est vous : il n'est pas un client de la liste
  }

  // Le classeur principal devient le client « principal » dès qu'un deuxième client est créé.
  function ensureMasterRow(rows) {
    if (rows.some(function (c) { return !c.classeur_id; })) return rows;
    var p = Store.withMaster(function () { return Params.get(); });
    var code = normCode(p.prestataire_nom).slice(0, 14);
    if (!validCode(code) || rows.some(function (c) { return c.code === code; })) code = 'PRINCIPAL';
    rows.unshift({ code: code, nom: p.prestataire_nom || 'Classeur principal', classeur_id: '', statut: 'actif', fin_licence: '', contact: '', exec_url: '', cree_le: Dates.today(), note: 'Classeur principal (annuaire)' });
    return rows;
  }

  function create(user, o) {
    requireOwner(user); o = o || {};
    var code = normCode(o.code); var nom = String(o.nom || '').trim(); var email = String(o.admin_email || '').trim().toLowerCase();
    if (!validCode(code)) throw httpErr_('Code : 2 à 20 caractères (lettres, chiffres, - ou _)');
    if (!nom) throw httpErr_('Nom de la société obligatoire');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw httpErr_("E-mail de l'administrateur invalide");
    if (o.fin_licence && !/^\d{4}-\d{2}-\d{2}$/.test(o.fin_licence)) throw httpErr_('Fin de licence : AAAA-MM-JJ');
    var rows = ensureMasterRow(list());
    if (rows.some(function (c) { return c.code === code; })) throw httpErr_('Ce code existe déjà');
    var book = SpreadsheetApp.create('Sijil — ' + nom + ' (' + code + ')');
    var id = book.getId();
    try {
      var f = DriveApp.getFileById(id);
      var parents = DriveApp.getFileById(Store.masterSs().getId()).getParents();
      if (parents.hasNext() && f.moveTo) { var p = parents.next(); var it = p.getFoldersByName('Clients'); f.moveTo(it.hasNext() ? it.next() : p.createFolder('Clients')); }
    } catch (e) { Logger.log('Classeur client non rangé : ' + e.message); }
    // Accès au classeur créé : le script (compte de l'éditeur) l'ouvre sans partage ; les autres éditeurs (OWNER_EMAILS) y sont ajoutés. Pas de partage au client par défaut : le classeur contient les empreintes des mots de passe.
    try { ownerEmails().forEach(function (e) { book.addEditor(e); }); if (o.partager_lecture) book.addViewer(email); } catch (e) { Logger.log('Partage du classeur : ' + e.message); }
    var password = String(o.admin_password || '') || Utilities.getUuid().replace(/-/g, '').slice(0, 10);
    var keep = { code: Store.tenantCode(), id: Store.tenantId() };
    Store.setTenant(code, id);
    try {
      Setup.repairStructure();
      Agents.ensureAdmin(email, password, String(o.admin_nom || '').trim() || 'Gestionnaire ' + nom);
      Params.set({ prestataire_nom: nom });
      Setup.readme();
      Store.reset();
      try { var first = book.getSheets()[0]; if (first && book.getSheets().length > 1 && /^(Feuille 1|Sheet1)$/.test(first.getName())) book.deleteSheet(first); } catch (e) { /* ignore */ }
    } finally { Store.setTenant(keep.code, keep.id); }
    var row = { code: code, nom: nom, classeur_id: id, statut: o.statut === 'essai' ? 'essai' : 'actif', fin_licence: o.fin_licence || '', contact: String(o.contact || '').trim(), exec_url: '', cree_le: Dates.today(), note: '' };
    rows.push(row); save(rows);
    var url = lien(code);
    return { client: view(row), admin: { email: email, password: password },
      message: 'Bonjour,\nVotre espace Sijil « ' + nom + ' » est prêt.\nLien : ' + url + '\nCode entreprise : ' + code + '\nIdentifiant : ' + email + '\nMot de passe provisoire : ' + password + '\n(à changer à la première connexion)' };
  }

  // Annuaire interrogé par la page d'accueil : un client « dédié » a sa propre adresse /exec (colonne exec_url) ; sinon déploiement commun.
  // Entreprises affichées sur la page d'accueil (« Ils nous font confiance ») : celles dont la case « vitrine » est cochée, jamais le classeur principal.
  function vitrine() {
    return list().filter(function (c) { return c.vitrine === '1' && c.classeur_id && c.statut !== 'suspendu'; }).map(function (c) { return { code: c.code, nom: c.nom }; })
      .sort(function (a, b) { return a.nom < b.nom ? -1 : 1; });
  }
  function resolve(code) {
    code = normCode(code);
    if (!hasRegistry()) return { nom: '', exec_url: '' };
    if (!code) throw httpErr_('Code entreprise requis');
    var c = find(code);
    if (!c) failedCode();
    checkLicense(c);
    return { nom: c.nom, exec_url: c.exec_url || '' };
  }
  // Test d'accès : le script ouvre-t-il bien le classeur de ce client ?
  function test(user, code) {
    requireOwner(user);
    var c = find(normCode(code));
    if (!c) throw httpErr_('Client introuvable');
    var keep = { code: Store.tenantCode(), id: Store.tenantId() };
    try {
      Store.setTenant(c.code, c.classeur_id);
      var book = Store.ss();
      return { ok: true, classeur: book.getName(), onglets: book.getSheets().length, agents: Store.readTable('Agents').filter(function (a) { return a.role !== 'admin' && a.role !== 'client'; }).length, administrateurs: Store.readTable('Agents').filter(function (a) { return a.role === 'admin'; }).length, adresse: c.exec_url ? 'dédiée' : 'déploiement commun' };
    } catch (e) {
      return { ok: false, detail: 'Le script ne peut pas ouvrir ce classeur : ' + e.message };
    } finally { Store.setTenant(keep.code, keep.id); }
  }
  function update(user, code, patch) {
    requireOwner(user); patch = patch || {};
    var rows = list(); var c = rows.filter(function (x) { return x.code === normCode(code); })[0];
    if (!c) throw httpErr_('Client introuvable');
    if (patch.statut !== undefined) {
      if (STATUTS.indexOf(patch.statut) < 0) throw httpErr_('Statut invalide');
      if (!c.classeur_id && patch.statut === 'suspendu') throw httpErr_('Le classeur principal (annuaire, éditeur) ne peut pas être suspendu');
      c.statut = patch.statut;
    }
    if (patch.fin_licence !== undefined) {
      if (patch.fin_licence && !/^\d{4}-\d{2}-\d{2}$/.test(patch.fin_licence)) throw httpErr_('Fin de licence : AAAA-MM-JJ');
      c.fin_licence = patch.fin_licence;
    }
    if (patch.exec_url && !/^https:\/\/script\.google\.com\/(a\/macros\/[\w.-]+|macros)\/s\/[\w-]+\/exec$/.test(String(patch.exec_url).trim())) throw httpErr_('Adresse dédiée : https://script.google.com/macros/s/…/exec');
    if (patch.vitrine !== undefined) c.vitrine = patch.vitrine === true || patch.vitrine === '1' || patch.vitrine === 1 ? '1' : '0';
    ['nom', 'contact', 'note', 'exec_url'].forEach(function (k) { if (patch[k] !== undefined) c[k] = String(patch[k]).trim(); });
    save(rows);
    return view(c);
  }

  // Exécute fn dans le classeur d'un client puis revient au contexte courant.
  function inClient(c, fn) {
    var keep = { code: Store.tenantCode(), id: Store.tenantId() };
    try { Store.setTenant(c.code, c.classeur_id); return fn(); } finally { Store.setTenant(keep.code, keep.id); }
  }
  function mustFind(code) { var c = find(normCode(code)); if (!c) throw httpErr_('Client introuvable'); return c; }
  function admins(user, code) {
    requireOwner(user);
    return inClient(mustFind(code), function () { return Store.readTable('Agents').filter(function (a) { return a.role === 'admin'; }).map(function (a) { return { id: a.id, nom: a.nom, email: a.email, actif: a.actif }; }); });
  }
  // Modifie l'e-mail / le nom / le mot de passe d'un administrateur du client. Mot de passe vide + reinit : un mot de passe provisoire est généré.
  function adminUpdate(user, code, o) {
    requireOwner(user); o = o || {};
    return inClient(mustFind(code), function () {
      var a = Store.readTable('Agents').filter(function (x) { return x.role === 'admin' && x.id === o.id; })[0];
      if (!a) throw httpErr_('Administrateur introuvable');
      var pseudo = { role: 'admin', id: '' };
      var data = {};
      if (o.email !== undefined && String(o.email).trim().toLowerCase() !== a.email) data.email = o.email;
      if (o.nom !== undefined && String(o.nom).trim() && String(o.nom).trim() !== a.nom) data.nom = o.nom;
      if (Object.keys(data).length) Agents.update(pseudo, a.id, data);
      var password = '';
      if (o.reinit || String(o.password || '')) {
        password = String(o.password || '') || Utilities.getUuid().replace(/-/g, '').slice(0, 10);
        Agents.setPassword(pseudo, a.id, password);
      }
      var b = Agents.get(a.id);
      return { id: b.id, nom: b.nom, email: b.email, password: password };
    });
  }
  // Suppression : l'annuaire perd la ligne et le classeur du client part à la corbeille Drive (récupérable 30 jours). Le classeur principal ne se supprime pas.
  function remove(user, code, confirm) {
    requireOwner(user);
    var c = mustFind(code);
    if (!c.classeur_id) throw httpErr_('Le classeur principal (annuaire, éditeur) ne peut pas être supprimé');
    if (normCode(confirm) !== c.code) throw httpErr_('Confirmation incorrecte : tapez le code du client (' + c.code + ')');
    try { DriveApp.getFileById(c.classeur_id).setTrashed(true); } catch (e) { Logger.log('Classeur non mis à la corbeille : ' + e.message); }
    save(list().filter(function (x) { return x.code !== c.code; }));
    return { supprime: c.code };
  }
  // Accès direct à l'espace d'un client EN ESSAI (démonstration, support) : session de son administrateur, sans mot de passe.
  function access(user, code) {
    requireOwner(user);
    var c = mustFind(code);
    if (c.statut !== 'essai') throw httpErr_("L'accès direct est réservé aux clients en essai (statut « Essai »)");
    checkLicense(c);
    var admin = inClient(c, function () { return Store.readTable('Agents').filter(function (a) { return a.role === 'admin' && a.actif === '1'; })[0]; });
    if (!admin) throw httpErr_('Aucun administrateur actif dans ce classeur');
    return Object.assign({ code: c.code, societe: c.nom }, Auth.openSession(c.code, admin));
  }
  // Contact de l'éditeur, montré aux clients (onglet « À propos ») : propriétés du script.
  function contact() {
    var p = PropertiesService.getScriptProperties();
    return { nom: p.getProperty('EDITEUR_NOM') || CFG.EDITEUR, email: p.getProperty('EDITEUR_EMAIL') || '', tel: p.getProperty('EDITEUR_TEL') || '' };
  }
  function setContact(user, o) {
    requireOwner(user); o = o || {};
    var email = String(o.email || '').trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw httpErr_('E-mail invalide');
    var p = PropertiesService.getScriptProperties();
    p.setProperty('EDITEUR_NOM', String(o.nom || '').trim()); p.setProperty('EDITEUR_EMAIL', email); p.setProperty('EDITEUR_TEL', String(o.tel || '').trim());
    return contact();
  }
  // « À propos » pour les utilisateurs d'un client : licence et contact de l'éditeur.
  function apropos(user) {
    var code = Store.tenantCode(); var c = code ? find(code) : null; var lic = { statut: 'actif', fin: '', jours: null, illimitee: true };
    if (c) {
      lic = { statut: c.statut, fin: c.fin_licence, jours: null, illimitee: !c.fin_licence };
      if (c.fin_licence) lic.jours = Math.round((new Date(c.fin_licence + 'T00:00:00Z') - new Date(Dates.today() + 'T00:00:00Z')) / 86400000);
    }
    return { societe: c ? c.nom : Params.get().prestataire_nom, code: code, licence: lic, editeur: contact(), version: CFG.VERSION, copyright: CFG.COPYRIGHT };
  }
  // Commentaire d'un utilisateur envoyé par e-mail à l'éditeur (réponse directe possible : l'e-mail de l'utilisateur est en « reply-to »).
  function commentaire(user, o) {
    o = o || {};
    var sujet = String(o.sujet || '').trim().slice(0, 120); var message = String(o.message || '').trim().slice(0, 4000);
    if (message.length < 5) throw httpErr_('Écrivez votre commentaire');
    var cache = CacheService.getScriptCache(); var key = 'CMT_' + Store.tenantCode() + '_' + user.id; var n = Number(cache.get(key) || 0);
    if (n >= 5) throw httpErr_('Trop de messages : réessayez dans une heure');
    var to = contact().email || ownerEmails()[0] || '';
    if (!to) throw httpErr_("L'éditeur n'a pas encore indiqué son adresse e-mail : contactez-le directement");
    var c = Store.tenantCode() ? find(Store.tenantCode()) : null;
    MailApp.sendEmail({ to: to, replyTo: user.email, subject: '[Sijil] ' + (c ? c.nom : 'Client') + ' — ' + (sujet || 'Commentaire'),
      body: message + '\n\n— ' + user.nom + ' <' + user.email + '>\nSociété : ' + (c ? c.nom + ' (' + c.code + ')' : Params.get().prestataire_nom) + '\nVersion : ' + CFG.VERSION });
    cache.put(key, String(n + 1), 3600);
    return { envoye: true };
  }
  // Envoi du message de bienvenue (lien, code, mot de passe provisoire) par e-mail, depuis le compte de l'éditeur.
  function envoyerMessage(user, to, message, nom) {
    requireOwner(user);
    to = String(to || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(to)) throw httpErr_('Adresse e-mail invalide');
    message = String(message || '').trim();
    if (message.length < 10 || message.length > 3000) throw httpErr_('Message vide ou trop long');
    var reply = contact().email;
    MailApp.sendEmail({ to: to, replyTo: reply || undefined, subject: 'Votre espace Sijil' + (nom ? ' — ' + String(nom).slice(0, 80) : ''), body: message });
    return { envoye: true, to: to };
  }
  // Code entreprise de l'espace courant (celui du client, ou celui du classeur principal s'il est dans l'annuaire) ; vide sans annuaire.
  function codeActuel() {
    var c = Store.tenantCode();
    if (c && c !== CFG.CODE_EDITEUR) return c;
    var m = list().filter(function (r) { return !r.classeur_id; })[0];
    return m ? m.code : '';
  }
  return { codeActuel: codeActuel, lien: lien, envoyerMessage: envoyerMessage, vitrine: vitrine, access: access, admins: admins, adminUpdate: adminUpdate, remove: remove, contact: contact, setContact: setContact, apropos: apropos, commentaire: commentaire, normCode: normCode, multi: multi, use: use, isOwner: isOwner, requireOwner: requireOwner, clients: clients, create: create, update: update, resolve: resolve, test: test, find: find, list: list };
})();
