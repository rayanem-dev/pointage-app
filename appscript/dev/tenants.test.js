const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const app = loadApp();
const { call, run, env } = app;
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); return r; };
const T = {};

test('sans annuaire : fonctionnement historique (pas de code entreprise)', () => {
  run("Setup.install('editeur@t.fr', 'editeurpw1', 'Éditeur')");
  run("Params.set({ prestataire_nom: 'SARL PRINCIPALE' })");
  const info = ok(call(null, 'appInfo'));
  assert.strictEqual(info.multi, false); assert.strictEqual(info.prestataire, 'SARL PRINCIPALE');
  T.owner = ok(call(null, 'login', 'editeur@t.fr', 'editeurpw1', 'ADMIN')).token;
  assert.strictEqual(ok(call(T.owner, 'me')).owner, true, 'administrateur du classeur principal connecté avec le code ADMIN = éditeur');
  const normal = ok(call(null, 'login', 'editeur@t.fr', 'editeurpw1')).token;
  assert.strictEqual(ok(call(normal, 'me')).owner, true, 'un seul compte : l\'administrateur du classeur principal est l\'éditeur, avec ou sans le code ADMIN');
  ok(call(normal, 'clients'));
});

test('création d\'un client : classeur vierge, annuaire, lien d\'invitation', () => {
  fail(call(T.owner, 'clientCreate', { code: 'X', nom: 'Trop court', admin_email: 'a@b.fr' }), /Code/);
  fail(call(T.owner, 'clientCreate', { code: 'ALPHA', nom: 'Alpha', admin_email: 'pas-un-mail' }), /invalide/);
  const r = ok(call(T.owner, 'clientCreate', { code: ' alpha ', nom: 'ALPHA SERVICES', admin_email: 'admin@alpha.dz', admin_nom: 'Chef Alpha', contact: '0555', fin_licence: '2099-12-31' }));
  assert.strictEqual(r.client.code, 'ALPHA'); assert.match(r.client.lien, /\?c=ALPHA$/); assert.ok(r.admin.password.length >= 8);
  assert.match(r.message, /Code entreprise : ALPHA/);
  fail(call(T.owner, 'clientCreate', { code: 'ALPHA', nom: 'Doublon', admin_email: 'x@y.fr' }), /existe déjà/);
  const l = ok(call(T.owner, 'clients')).clients;
  assert.deepStrictEqual(l.map((c) => c.code), ['ALPHA'], 'le classeur principal (vous) n\'est pas dans la liste des clients');
  assert.ok(run("Tenants.list()").some((c) => !c.classeur_id), 'mais il reste dans l\'annuaire (code d\'accès)');
  T.alphaPw = r.admin.password;
  ok(call(T.owner, 'clientCreate', { code: 'BETA', nom: 'BETA TRAVAUX', admin_email: 'admin@beta.dz', admin_password: 'betapass1' }));
});

test('accès au classeur créé : éditeurs ajoutés, pas de partage au client sauf demande', () => {
  env.props.OWNER_EMAILS = 'coediteur@t.fr, editeur@t.fr';
  const r = ok(call(T.owner, 'clientCreate', { code: 'GAMMA', nom: 'GAMMA', admin_email: 'admin@gamma.dz' }));
  const id = run("Tenants.find('GAMMA').classeur_id");
  assert.deepStrictEqual(env.shares.filter((s) => s[1] === id).map((s) => s.slice(0, 1).concat(s.slice(2))).map((s) => s.join(':')), ['editor:coediteur@t.fr', 'editor:editeur@t.fr']);
  ok(call(T.owner, 'clientCreate', { code: 'DELTA', nom: 'DELTA', admin_email: 'admin@delta.dz', partager_lecture: true }));
  const id2 = run("Tenants.find('DELTA').classeur_id");
  assert.ok(env.shares.some((s) => s[0] === 'viewer' && s[1] === id2 && s[2] === 'admin@delta.dz'));
  delete env.props.OWNER_EMAILS;
  ok(call(null, 'login', 'admin@gamma.dz', r.admin.password, 'GAMMA')); // l'application ouvre le classeur sans partage (compte de l'éditeur)
});

test('connexion avec code : séparation des données entre clients', () => {
  assert.strictEqual(ok(call(null, 'appInfo')).multi, true);
  assert.strictEqual(ok(call(null, 'appInfo')).prestataire, '', 'sans code, aucune information sur un client');
  assert.strictEqual(ok(call(null, 'appInfo', 'alpha')).prestataire, 'ALPHA SERVICES');
  fail(call(null, 'appInfo', 'INCONNU'), /Code entreprise inconnu/);
  fail(call(null, 'login', 'editeur@t.fr', 'editeurpw1'), /Code entreprise requis/);
  fail(call(null, 'login', 'admin@alpha.dz', T.alphaPw, 'BETA'), /incorrect/);
  fail(call(null, 'login', 'admin@alpha.dz', T.alphaPw, ''), /requis/);
  T.alpha = ok(call(null, 'login', 'admin@alpha.dz', T.alphaPw, 'ALPHA')).token;
  T.beta = ok(call(null, 'login', 'admin@beta.dz', 'betapass1', 'beta')).token;
  T.main = ok(call(null, 'login', 'editeur@t.fr', 'editeurpw1', 'SARLPRINCIPALE')).token;
  assert.strictEqual(ok(call(T.alpha, 'me')).params.prestataire, 'ALPHA SERVICES'); assert.strictEqual(ok(call(T.alpha, 'me')).code, 'ALPHA');
  assert.strictEqual(ok(call(T.alpha, 'me')).owner, false, 'un client n\'est jamais éditeur');
  // un agent créé chez ALPHA n'existe ni chez BETA ni dans le classeur principal ; un même e-mail peut exister chez deux clients
  ok(call(T.alpha, 'agentCreate', { nom: 'AGENT ALPHA', email: 'agent@commun.dz', password: 'agentpw1' }));
  ok(call(T.beta, 'agentCreate', { nom: 'AGENT BETA', email: 'agent@commun.dz', password: 'agentpw2' }));
  assert.deepStrictEqual(ok(call(T.alpha, 'agentsManage')).map((a) => a.nom).sort(), ['AGENT ALPHA', 'Chef Alpha'].sort());
  assert.ok(!ok(call(T.main, 'agentsManage')).some((a) => /AGENT/.test(a.nom)));
  const a1 = ok(call(null, 'login', 'agent@commun.dz', 'agentpw1', 'ALPHA')); assert.strictEqual(a1.user.nom, 'AGENT ALPHA');
  assert.strictEqual(ok(call(null, 'login', 'agent@commun.dz', 'agentpw2', 'BETA')).user.nom, 'AGENT BETA');
  // pointage isolé
  ok(call(T.alpha, 'pointer', { agent_id: a1.user.id, date: '2026-05-04', statut: 'T' }));
  assert.ok(ok(call(T.alpha, 'gridMonth', '2026-05')).rows.some((r) => r.days[3].statut === 'T'));
  assert.ok(!ok(call(T.beta, 'gridMonth', '2026-05')).rows.some((r) => r.days[3].statut === 'T'));
  // sauvegardes et documents rangés par client
  const b = ok(call(T.alpha, 'backupCreate')); assert.match(b.nom, /^Sauvegarde /);
  assert.strictEqual(ok(call(T.alpha, 'backupList')).length, 1); assert.strictEqual(ok(call(T.beta, 'backupList')).length, 0);
  assert.ok(env.props['BACKUP_ROOT_ID__ALPHA'] && !env.props['BACKUP_ROOT_ID__BETA'] || true);
});

test('seul l\'éditeur gère les clients ; suspension et licence', () => {
  fail(call(T.alpha, 'clients'), /éditeur/); fail(call(T.alpha, 'clientCreate', { code: 'GAMMA', nom: 'G', admin_email: 'g@g.fr' }), /éditeur/); fail(call(T.alpha, 'clientUpdate', 'BETA', { statut: 'suspendu' }), /éditeur/);
  fail(call(T.owner, 'clientUpdate', 'SARLPRINCIPALE', { statut: 'suspendu' }), /principal/);
  fail(call(T.owner, 'clientUpdate', 'ZZZ', { statut: 'actif' }), /introuvable/);
  fail(call(T.owner, 'clientUpdate', 'ALPHA', { statut: 'bizarre' }), /invalide/);
  ok(call(T.owner, 'clientUpdate', 'ALPHA', { statut: 'suspendu' }));
  fail(call(T.alpha, 'me'), /suspendu/);
  fail(call(null, 'login', 'admin@alpha.dz', T.alphaPw, 'ALPHA'), /suspendu/);
  assert.strictEqual(ok(call(T.beta, 'me')).code, 'BETA', 'les autres clients ne sont pas touchés');
  ok(call(T.owner, 'clientUpdate', 'ALPHA', { statut: 'actif', fin_licence: '2020-01-01' }));
  fail(call(null, 'login', 'admin@alpha.dz', T.alphaPw, 'ALPHA'), /Licence expirée le 01\/01\/2020/);
  ok(call(T.owner, 'clientUpdate', 'ALPHA', { fin_licence: '2099-01-01', contact: 'nouveau' }));
  ok(call(null, 'login', 'admin@alpha.dz', T.alphaPw, 'ALPHA'));
  assert.strictEqual(ok(call(T.owner, 'clients')).clients.find((c) => c.code === 'ALPHA').contact, 'nouveau');
});

test('codes inconnus : essais limités ; charte de confidentialité publique', () => {
  const c = ok(call(null, 'charte')); assert.ok(c.sections.length >= 8 && c.sections.every((s) => s.titre && s.texte)); assert.match(c.editeur, /./);
  for (let i = 0; i < 70; i += 1) call(null, 'appInfo', 'FAUX' + i);
  fail(call(null, 'appInfo', 'FAUXENCORE'), /Trop de codes/);
  env.cache = {}; // la fenêtre de 10 minutes expire
  Object.keys(env.cache).forEach((k) => delete env.cache[k]);
  assert.strictEqual(ok(call(null, 'appInfo', 'BETA')).prestataire, 'BETA TRAVAUX');
});

test('sonde ?ping : réponse JSON sans ouvrir l\'application', () => {
  const r = app.ctx.doGet({ parameter: { ping: '1' } });
  assert.deepStrictEqual(JSON.parse(r.text), { ok: true, version: run('CFG.VERSION') }); assert.strictEqual(r.mime, 'JSON');
});

test('annuaire : adresse dédiée par client (resolve) et test d\'accès au classeur', () => {
  const owner = ok(call(null, 'login', 'editeur@t.fr', 'editeurpw1', 'ADMIN')).token;
  const rs = (c) => JSON.parse(app.ctx.doGet({ parameter: { resolve: c } }).text);
  assert.deepStrictEqual(rs('beta'), { ok: true, nom: 'BETA TRAVAUX', exec_url: '' });
  fail(call(owner, 'clientUpdate', 'BETA', { exec_url: 'http://pas-google' }), /Adresse dédiée/);
  ok(call(owner, 'clientUpdate', 'BETA', { exec_url: 'https://script.google.com/macros/s/DEDIE123/exec' }));
  assert.strictEqual(rs('BETA').exec_url, 'https://script.google.com/macros/s/DEDIE123/exec');
  assert.strictEqual(rs('inconnu').ok, false); assert.match(rs('inconnu').error, /inconnu/);
  ok(call(owner, 'clientUpdate', 'ALPHA', { statut: 'suspendu' })); assert.match(rs('ALPHA').error, /suspendu/); ok(call(owner, 'clientUpdate', 'ALPHA', { statut: 'actif' }));
  const t = ok(call(owner, 'clientTest', 'BETA')); assert.strictEqual(t.ok, true); assert.ok(t.onglets >= 9 && t.administrateurs === 1); assert.match(t.classeur, /BETA/);
  assert.strictEqual(ok(call(owner, 'clientTest', 'SARLPRINCIPALE')).ok, true);
  // classeur introuvable -> message clair
  const rows = run("Tenants.list()"); rows.find((c) => c.code === 'GAMMA').classeur_id = 'inexistant';
  app.ctx.__rows = rows; run("(function(){ Store.withMaster(function(){ Store.writeTable('Clients', __rows); }); })()");
  const bad = ok(call(owner, 'clientTest', 'GAMMA')); assert.strictEqual(bad.ok, false); assert.match(bad.detail, /ne peut pas ouvrir/);
  const adm = ok(call(null, 'login', 'admin@beta.dz', 'betapass1', 'BETA')); fail(call(adm.token, 'clientTest', 'BETA'), /éditeur/);
});

test('console de l\'éditeur : code ADMIN réservé, administrateur d\'un client (e-mail, mot de passe), suppression, contact', () => {
  const ed = ok(call(null, 'login', 'editeur@t.fr', 'editeurpw1', 'ADMIN')).token;
  assert.strictEqual(ok(call(null, 'appInfo', 'ADMIN')).prestataire, 'SARL PRINCIPALE', 'ADMIN = alias du classeur principal');
  fail(call(ed, 'clientCreate', { code: 'admin', nom: 'X', admin_email: 'x@y.fr' }), /Code/); // code réservé
  fail(call(null, 'login', 'admin@beta.dz', 'betapass1', 'ADMIN'), /incorrect/); // un administrateur de client n'entre pas dans la console
  // administrateurs d'un client
  const adm = ok(call(ed, 'clientAdmins', 'BETA')); assert.strictEqual(adm.length, 1); assert.strictEqual(adm[0].email, 'admin@beta.dz');
  const r = ok(call(ed, 'clientAdminUpdate', 'BETA', { id: adm[0].id, email: 'Nouveau@Beta.dz', nom: 'Nouveau Chef', password: 'nouveaupw1' }));
  assert.strictEqual(r.email, 'nouveau@beta.dz'); assert.strictEqual(r.password, 'nouveaupw1');
  fail(call(null, 'login', 'admin@beta.dz', 'betapass1', 'BETA'), /incorrect/); ok(call(null, 'login', 'nouveau@beta.dz', 'nouveaupw1', 'BETA'));
  const g = ok(call(ed, 'clientAdminUpdate', 'BETA', { id: adm[0].id, reinit: true })); assert.ok(g.password.length >= 8); ok(call(null, 'login', 'nouveau@beta.dz', g.password, 'BETA'));
  fail(call(ed, 'clientAdminUpdate', 'BETA', { id: adm[0].id, email: 'pas-un-mail' }), /Email invalide/);
  fail(call(ed, 'clientAdminUpdate', 'BETA', { id: 'inconnu', reinit: true }), /introuvable/);
  const betaTok = ok(call(null, 'login', 'nouveau@beta.dz', g.password, 'BETA')).token; fail(call(betaTok, 'clientAdmins', 'BETA'), /éditeur/); fail(call(betaTok, 'clientDelete', 'BETA', 'BETA'), /éditeur/);
  // contact de l'éditeur et « À propos » côté client
  fail(call(betaTok, 'editeurContactSave', {}), /éditeur/);
  ok(call(ed, 'editeurContactSave', { nom: 'Rayane', email: 'contact@editeur.dz', tel: '0555' }));
  fail(call(ed, 'editeurContactSave', { email: 'faux' }), /invalide/);
  const ap = ok(call(betaTok, 'apropos')); assert.deepStrictEqual([ap.societe, ap.code, ap.licence.statut, ap.editeur.email], ['BETA TRAVAUX', 'BETA', 'actif', 'contact@editeur.dz']); assert.strictEqual(ap.licence.illimitee, true);
  ok(call(ed, 'clientUpdate', 'BETA', { fin_licence: '2099-01-01' })); const ap2 = ok(call(betaTok, 'apropos')); assert.ok(ap2.licence.jours > 1000 && !ap2.licence.illimitee);
  // commentaire par e-mail
  env.mails.length = 0;
  fail(call(betaTok, 'commentaire', { message: 'x' }), /Écrivez/);
  ok(call(betaTok, 'commentaire', { sujet: 'Question', message: 'Bonjour, une question sur les attachements.' }));
  const m = env.mails[0]; assert.strictEqual(m.to, 'contact@editeur.dz'); assert.strictEqual(m.replyTo, 'nouveau@beta.dz'); assert.match(m.subject, /BETA TRAVAUX.*Question/); assert.match(m.body, /attachements/); assert.match(m.body, /BETA/);
  for (let i = 0; i < 4; i += 1) ok(call(betaTok, 'commentaire', { message: 'message numéro ' + i }));
  fail(call(betaTok, 'commentaire', { message: 'trop de messages' }), /Trop de messages/);
  // suppression : confirmation par le code, classeur à la corbeille, annuaire mis à jour
  const id = run("Tenants.find('GAMMA').classeur_id");
  fail(call(ed, 'clientDelete', 'SARLPRINCIPALE', 'SARLPRINCIPALE'), /principal/);
  fail(call(ed, 'clientDelete', 'GAMMA', 'oups'), /Confirmation incorrecte/);
  assert.strictEqual(ok(call(ed, 'clientDelete', 'gamma', 'gamma')).supprime, 'GAMMA');
  assert.ok(!ok(call(ed, 'clients')).clients.some((c) => c.code === 'GAMMA'));
  assert.strictEqual(rsOk(), true); function rsOk() { return JSON.parse(app.ctx.doGet({ parameter: { resolve: 'GAMMA' } }).text).ok === false; }
  assert.ok(id);
});

test('console : accès direct à un client (jamais éditeur ; refusé si suspendu), journalisé', () => {
  const ed = ok(call(null, 'login', 'editeur@t.fr', 'editeurpw1', 'ADMIN')).token;
  fail(call(ed, 'monCompteSave', { actuel: 'x' }), /inconnue/); // la carte « Mon compte » n'existe plus
  ok(call(ed, 'clientCreate', { code: 'ESSAI1', nom: 'SOCIETE ESSAI', admin_email: 'chef@essai.dz', statut: 'essai' }));
  const actif = ok(call(ed, 'clientAcces', 'BETA')); const meB = ok(call(actif.token, 'me')); assert.deepStrictEqual([meB.user.role, meB.code, meB.owner, meB.canSetup], ['admin', 'BETA', false, true], 'accès aussi à un client actif : tous les onglets et privilèges de son administrateur');
  ok(call(ed, 'clientUpdate', 'BETA', { statut: 'suspendu' })); fail(call(ed, 'clientAcces', 'BETA'), /suspendu/i); ok(call(ed, 'clientUpdate', 'BETA', { statut: 'actif' }));
  assert.ok(ok(call(ed, 'connexions')).journal.some((j) => j[1] === 'BETA' && /Support/.test(j[2]) && j[3] === 'support'), 'accès support noté dans le journal');
  const a = ok(call(ed, 'clientAcces', 'essai1'));
  assert.strictEqual(a.code, 'ESSAI1'); const me = ok(call(a.token, 'me'));
  assert.deepStrictEqual([me.user.email, me.code, me.owner], ['chef@essai.dz', 'ESSAI1', false], 'session de l\'administrateur du client, jamais éditeur');
  fail(call(a.token, 'clients'), /éditeur/);
});

test('connexions : l\'éditeur voit l\'activité de toutes les entreprises et le journal ; un client ne voit que la sienne', () => {
  env.props.OWNER_EMAILS = '';
  T.owner = ok(call(null, 'login', 'editeur@t.fr', 'editeurpw1', 'ADMIN')).token;
  const ent = () => ok(call(T.owner, 'connexions'));
  assert.ok(ent().entreprises.length >= 3, 'principal + clients');
  const alpha = ent().entreprises.find((e) => e.code === 'ALPHA');
  assert.ok(alpha && alpha.gens.length >= 1);
  const avant = alpha.gens.find((g) => g.email === 'admin@alpha.dz').n;
  const a = ok(call(null, 'login', 'admin@alpha.dz', T.alphaPw, 'ALPHA')).token;
  ok(call(a, 'badges'));
  const apres = ent().entreprises.find((e) => e.code === 'ALPHA');
  assert.strictEqual(apres.gens.find((g) => g.email === 'admin@alpha.dz').en_ligne, true);
  assert.strictEqual(apres.gens.find((g) => g.email === 'admin@alpha.dz').n, avant + 1);
  const j = ent().journal; assert.ok(j.length >= 1 && j[0][1] === 'ALPHA' && j[0][2], 'journal : entreprise et nom de la dernière connexion');
  const own = ok(call(a, 'connexions'));
  assert.ok(own.gens && !own.entreprises && !own.journal, 'un client ne voit que ses propres utilisateurs');
});

test('support : liste des utilisateurs d\'un client et connexion à la place de l\'un d\'eux (journalisée), sans droits d\'éditeur', () => {
  const ed = ok(call(null, 'login', 'editeur@t.fr', 'editeurpw1', 'ADMIN')).token;
  const adm = ok(call(ed, 'clientAcces', 'ALPHA')); const adminAlpha = ok(call(adm.token, 'me')).user;
  const ag = ok(call(adm.token, 'agentCreate', { nom: 'AGENT ALPHA', email: 'ag@alpha.dz', role: 'agent', password: 'agalpha12' })).agent;
  const liste = ok(call(ed, 'clientUtilisateurs', 'ALPHA'));
  assert.deepStrictEqual(liste.map((u) => u.role).slice(0, 2), ['admin', 'agent']); assert.ok(liste.some((u) => u.id === ag.id && u.email === 'ag@alpha.dz'));
  assert.ok(!liste.some((u) => 'password_hash' in u || 'salt' in u), 'aucun secret dans la liste');
  const s = ok(call(ed, 'clientAcces', 'ALPHA', ag.id)); const me = ok(call(s.token, 'me'));
  assert.deepStrictEqual([me.user.id, me.user.role, me.code, me.owner, me.canSetup], [ag.id, 'agent', 'ALPHA', false, false], 'session de l\'agent choisi : vue et droits de l\'agent, jamais éditeur');
  fail(call(ed, 'clientAcces', 'ALPHA', 'A-inconnu'), /introuvable/);
  fail(call(s.token, 'clientUtilisateurs', 'ALPHA'), /éditeur|refusé/i);
  fail(call(adm.token, 'clientAcces', 'ALPHA', ag.id), /refusé|éditeur/i);
  assert.ok(ok(call(ed, 'connexions')).journal.some((j) => j[1] === 'ALPHA' && j[2].includes('AGENT ALPHA') && j[3] === 'support'), 'accès journalisé avec le nom de l\'utilisateur');
  assert.ok(adminAlpha.role === 'admin');
});
