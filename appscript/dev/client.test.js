const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const app = loadApp();
const { call, run, env } = app;
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); };
const T = {};
const contrat = (extra) => Object.assign({ numero: 'C1', client: 'ENERGIE DU SUD', objet: 'Mise à disposition', date_contrat: '', ref_mois: '', ref_attachement: '', rep_prestataire: '', rep_client: 'M. Benali' }, extra || {});

test('contrat : début, durée, fin ; compte de consultation créé par défaut pour le contact client', () => {
  run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  T.admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  fail(call(T.admin, 'contratsSave', { contrats: [contrat({ date_debut: 'pas une date' })], fonctions: [] }), /début/);
  fail(call(T.admin, 'contratsSave', { contrats: [contrat({ duree_mois: '0' })], fonctions: [] }), /Durée/);
  fail(call(T.admin, 'contratsSave', { contrats: [contrat({ client_email: 'xx' })], fonctions: [] }), /e-mail/i);
  const r = ok(call(T.admin, 'contratsSave', { contrats: [contrat({ date_debut: '2026-01-31', duree_mois: '24', client_email: 'Benali@client.dz' })], fonctions: [] }));
  assert.strictEqual(r.comptes.length, 1); assert.strictEqual(r.comptes[0].email, 'benali@client.dz'); assert.strictEqual(r.comptes[0].contrat, 'C1'); assert.ok(r.comptes[0].password.length >= 8);
  const again = ok(call(T.admin, 'contratsSave', { contrats: [contrat({ date_debut: '2026-01-31', duree_mois: '24', client_email: 'benali@client.dz' })], fonctions: [] }));
  assert.strictEqual(again.comptes.length, 0, 'pas de doublon');
  T.cpw = r.comptes[0].password;
  T.client = ok(call(null, 'login', 'benali@client.dz', T.cpw)).token;
  const me = ok(call(T.client, 'me')).user; assert.strictEqual(me.role, 'client'); assert.strictEqual(me.contrat, 'C1'); assert.strictEqual(me.nom, 'M. Benali');
  const syn = ok(call(T.client, 'contratsSynthese'))[0];
  assert.strictEqual(syn.date_debut, '2026-01-31'); assert.strictEqual(syn.duree_mois, '24'); assert.strictEqual(syn.date_fin, '2028-01-30', 'début + 24 mois − 1 jour');
  assert.strictEqual(run("Contrats.dateFin('2026-01-31', 1)"), '2026-02-27', 'fin de mois : 31 janvier + 1 mois − 1 jour');
});

test('le contrat est visible de l\'agent (début, durée, fin) dans son accueil', () => {
  const a = ok(call(T.admin, 'agentCreate', { nom: 'AGENT C1', email: 'a1@t.fr', role: 'agent', password: 'agentpw12', contrat: 'C1' })).agent;
  T.agent = a;
  const ag = ok(call(null, 'login', 'a1@t.fr', 'agentpw12')).token;
  const ov = ok(call(ag, 'overview'));
  assert.strictEqual(ov.contrat.date_debut, '2026-01-31'); assert.strictEqual(ov.contrat.date_fin, '2028-01-30');
});

test('remarques du client sur le pointage : visibles du prestataire, notification, réponse', () => {
  ok(call(T.admin, 'pointer', { agent_id: T.agent.id, date: '2026-10-05', statut: 'T' }));
  fail(call(T.client, 'remarqueAdd', { agent_id: T.agent.id, date: 'nimporte', texte: 'x' }), /Date/);
  fail(call(T.client, 'remarqueAdd', { agent_id: T.agent.id, date: '2026-10-05', texte: '   ' }), /remarque/);
  fail(call(T.client, 'remarqueAdd', { agent_id: 'A-inconnu', date: '2026-10-05', texte: 'x' }), /introuvable/);
  env.mails.length = 0;
  const r = ok(call(T.client, 'remarqueAdd', { agent_id: T.agent.id, date: '2026-10-05', texte: 'Absent à mon poste ce jour-là ?' }));
  assert.strictEqual(r.statut, 'nouveau'); assert.strictEqual(r.agent_nom, 'AGENT C1');
  assert.ok(env.mails.some((m) => m.to === 'admin@t.fr' && /Remarque du client/.test(m.subject) && /Absent à mon poste/.test(m.body)), 'prestataire prévenu');
  // visible dans la grille du client et du prestataire
  assert.strictEqual(ok(call(T.client, 'gridMonth', '2026-10')).remarques.length, 1);
  const g = ok(call(T.admin, 'gridMonth', '2026-10')); assert.strictEqual(g.remarques[0].texte, 'Absent à mon poste ce jour-là ?');
  assert.strictEqual(ok(call(T.admin, 'gridPeriod', '2026-10', 3)).remarques.length, 1);
  assert.strictEqual(ok(call(T.admin, 'badges')).remarques, 1, 'pastille « nouveau » pour le prestataire');
  assert.strictEqual(ok(call(T.client, 'badges')).remarques, 0);
  // seul le prestataire traite ; le client voit la réponse
  fail(call(T.client, 'remarqueTraiter', r.id, {}), /(accès|réservé|autoris)/i);
  ok(call(T.admin, 'remarqueTraiter', r.id, { reponse: 'Il était en formation.' }));
  const vu = ok(call(T.client, 'gridMonth', '2026-10')).remarques[0];
  assert.strictEqual(vu.statut, 'vu'); assert.strictEqual(vu.reponse, 'Il était en formation.');
  assert.strictEqual(ok(call(T.admin, 'badges')).remarques, 0);
  // un agent ou un chef ne peut pas poster une remarque client
  const ag = ok(call(null, 'login', 'a1@t.fr', 'agentpw12')).token;
  fail(call(ag, 'remarqueAdd', { agent_id: T.agent.id, date: '2026-10-05', texte: 'x' }), /(accès|réservé|autoris)/i);
});

test('le client ne voit que les agents de son contrat', () => {
  ok(call(T.admin, 'agentCreate', { nom: 'AUTRE CONTRAT', email: 'o@t.fr', role: 'agent', password: 'autrepw12' }));
  const noms = ok(call(T.client, 'gridMonth', '2026-10')).rows.map((r) => r.nom);
  assert.ok(noms.includes('AGENT C1')); assert.ok(!noms.includes('AUTRE CONTRAT'));
});

test('contact client (Setup → Client) : 4 e-mails au maximum, un compte de consultation par adresse ; direction : 4 e-mails', () => {
  ok(call(T.admin, 'contratsSave', { contrats: [contrat({ date_debut: '2026-01-31', duree_mois: '24' })], fonctions: [] }));
  fail(call(T.admin, 'setupSave', { client_emails: 'a@c.dz, b@c.dz, c@c.dz, d@c.dz, e@c.dz' }), /4 adresses/);
  fail(call(T.admin, 'setupSave', { client_emails: 'pas-une-adresse' }), /invalide/);
  const r = ok(call(T.admin, 'setupSave', { client_emails: 'Un@c.dz; deux@c.dz  trois@c.dz, quatre@c.dz' }));
  assert.strictEqual(r.client_emails, 'un@c.dz, deux@c.dz, trois@c.dz, quatre@c.dz');
  const nouveaux = r.comptes.map((c) => c.email).sort();
  assert.deepStrictEqual(nouveaux, ['deux@c.dz', 'quatre@c.dz', 'trois@c.dz', 'un@c.dz']);
  assert.ok(r.comptes.every((c) => c.contrat === 'C1'), 'un seul contrat : compte rattaché à ce contrat');
  const tok = ok(call(null, 'login', 'deux@c.dz', r.comptes.find((c) => c.email === 'deux@c.dz').password)).token;
  assert.strictEqual(ok(call(tok, 'me')).user.role, 'client');
  assert.strictEqual(ok(call(T.admin, 'setupSave', { client_emails: 'un@c.dz' })).comptes.length, 0, 'pas de doublon');
  assert.strictEqual(ok(call(T.admin, 'setupGet')).values.client_emails, 'un@c.dz');
  fail(call(T.admin, 'setupSave', { direction_email: 'a@p.dz,b@p.dz,c@p.dz,d@p.dz,e@p.dz' }), /4 adresses/);
  assert.strictEqual(ok(call(T.admin, 'setupSave', { direction_email: 'A@p.dz; b@p.dz' })).direction_email, 'a@p.dz, b@p.dz');
});
