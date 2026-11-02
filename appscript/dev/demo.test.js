const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); return r; };

const app = loadApp(); const { call, run, env } = app; const T = {};

test('démonstration : sans entreprise créée, « demo » ne marche pas', () => {
  run("Setup.install('editeur@t.fr', 'editeurpw1', 'Éditeur')");
  T.owner = ok(call(null, 'login', 'editeur@t.fr', 'editeurpw1', 'ADMIN')).token;
  ok(call(T.owner, 'clientCreate', { code: 'ALPHA', nom: 'Alpha', admin_email: 'admin@alpha.dz', admin_password: 'alphapass1' })); // active le mode multi-entreprises
  fail(call(null, 'login', 'demo', 'demo'), /incorrect|Code entreprise/);
  assert.strictEqual(ok(call(null, 'appInfo')).demo, false);
});

test('démonstration : création par l\'éditeur seul, comptes demo / demo, données fictives complètes', () => {
  const alpha = ok(call(null, 'login', 'admin@alpha.dz', 'alphapass1', 'ALPHA')).token;
  fail(call(alpha, 'demoReset'), /éditeur/);
  const r = ok(call(T.owner, 'demoReset'));
  assert.strictEqual(r.motdepasse, 'demo'); assert.ok(r.agents >= 16);
  assert.strictEqual(ok(call(null, 'appInfo')).demo, true, 'la page de connexion peut proposer la démonstration');
  const adm = ok(call(null, 'login', 'demo', 'demo')); // sans code entreprise
  T.adm = adm.token; assert.strictEqual(adm.user.role, 'admin');
  const me = ok(call(T.adm, 'me')); assert.strictEqual(me.demo.profil, 'demo'); assert.strictEqual(me.demo.profils.length, 4);
  assert.match(me.params.prestataire, /démo/);
  const ag = ok(call(T.adm, 'agentsVisible')); assert.strictEqual(ag.filter((a) => a.type === 'vehicule').length, 5); assert.ok(ag.filter((a) => a.type !== 'vehicule').length >= 12);
  const d = ok(call(T.adm, 'demandesList'));
  assert.ok(d.toHandle.some((x) => x.statut === 'envoyee'), 'des demandes sont chez la direction');
  assert.ok(d.toHandle.some((x) => x.cloturee), 'une demande est clôturée');
  assert.ok(d.toHandle.some((x) => x.statut === 'refusee'), 'une demande est refusée');
  assert.ok(d.toHandle.some((x) => x.type_label === 'Certificat de travail'), 'type personnalisé');
  const grid = ok(call(T.adm, 'gridMonth', run('Dates.today()').slice(0, 7)));
  assert.ok(grid.rows.length >= 16 && grid.rows.some((x) => x.type === 'vehicule'));
  const syn = ok(call(T.adm, 'contratsSynthese')); assert.ok(syn.length === 1 && syn[0].lignes.length === 7);
});

test('démonstration : un identifiant par profil, bascule sans mot de passe, tous mots de passe « demo »', () => {
  ['demo-chef', 'demo-agent', 'demo-client'].forEach((id) => assert.strictEqual(ok(call(null, 'login', id, 'demo')).user.role, { 'demo-chef': 'chef', 'demo-agent': 'agent', 'demo-client': 'client' }[id]));
  fail(call(null, 'login', 'demo', 'mauvais'), /incorrect/);
  for (let i = 0; i < 12; i += 1) call(null, 'login', 'demo', 'faux'); // pas de blocage : le mot de passe est public
  assert.strictEqual(ok(call(null, 'login', 'demo', 'demo')).user.role, 'admin');
  const sw = ok(call(T.adm, 'demoSwitch', 'demo-agent')); assert.strictEqual(sw.user.role, 'agent');
  assert.strictEqual(ok(call(sw.token, 'me')).demo.profil, 'demo-agent');
  fail(call(T.adm, 'demoSwitch', 'n-importe-qui'), /inconnu/);
  const demandes = ok(call(sw.token, 'demandesList')).mine; assert.ok(demandes.length >= 2 && demandes.every((x) => x.etapes.length >= 3));
  const cl = ok(call(null, 'login', 'demo-client', 'demo')).token; assert.ok(ok(call(cl, 'contratsSynthese')).length === 1);
  const ch = ok(call(null, 'login', 'demo-chef', 'demo')).token; assert.ok(ok(call(ch, 'demandesList')).toHandle.length >= 4);
  fail(call(call(null, 'login', 'editeur@t.fr', 'editeurpw1', 'ADMIN') && T.owner, 'demoSwitch', 'demo'), /démonstration/);
});

test('démonstration : aucun e-mail réel, mot de passe et vidage verrouillés, dépôts limités', () => {
  const avant = (env.mails || []).length;
  ok(call(T.adm, 'agentCreate', { nom: 'NOUVEAU TEST', email: 'vrai.personne@gmail.com', role: 'agent', contrat: 'I/24/DEMO-SRV/2025', fonction: 'Soudeur', password: 'unmotdepasse1' }));
  ok(call(T.adm, 'agentEnvoyerAcces', ok(call(T.adm, 'agentsVisible')).find((a) => a.email === 'vrai.personne@gmail.com').id, 'unmotdepasse1'));
  assert.strictEqual((env.mails || []).length, avant, 'aucun e-mail envoyé depuis la démonstration');
  // témoin : dans une vraie entreprise, le même envoi part bien
  const alpha = ok(call(null, 'login', 'admin@alpha.dz', 'alphapass1', 'ALPHA')).token;
  const nouveau = ok(call(alpha, 'agentCreate', { nom: 'AGENT ALPHA', email: 'agent@alpha.dz', role: 'agent', password: 'agentpw123' })).agent;
  ok(call(alpha, 'agentEnvoyerAcces', nouveau.id, 'agentpw123'));
  assert.ok(env.mails.length > avant, 'témoin : un e-mail part bien depuis une vraie entreprise');
  fail(call(T.adm, 'passwordOwn', 'demo', 'nouveau123'), /démonstration/);
  fail(call(T.adm, 'vider', 'tout', 'VIDER'), /démonstration/);
  fail(call(T.adm, 'agentPassword', ok(call(T.adm, 'agentsVisible'))[0].id, 'nouveau123'), /démonstration/);
  const gros = Buffer.alloc(3 * 1024 * 1024, 65).toString('base64');
  fail(call(T.adm, 'depotAdd', { nom: 'gros.pdf', mime: 'application/pdf', base64: gros }), /2 Mo/);
});

test('démonstration : remise à zéro quotidienne (tâche planifiée) et à la demande', () => {
  ok(call(T.adm, 'agentCreate', { nom: 'A SUPPRIMER', email: 'x@demo.sijil', role: 'agent', contrat: 'I/24/DEMO-SRV/2025', fonction: 'Soudeur', password: 'unmotdepasse1' }));
  run("PropertiesService.getScriptProperties().setProperty('DEMO_LAST', '2000-01-01')");
  run("Demo.tick()"); // l'heure d'Alger peut être avant 3 h : on force avec reset
  ok(call(T.owner, 'demoReset'));
  const tk = ok(call(null, 'login', 'demo', 'demo')).token;
  assert.ok(!ok(call(tk, 'agentsVisible')).some((a) => a.nom === 'A SUPPRIMER'), 'la remise à zéro efface les ajouts des visiteurs');
  assert.strictEqual(run("Demo.status().derniere"), run('Dates.today()'));
  const st = ok(call(T.owner, 'demoStatus')); assert.strictEqual(st.existe, true); assert.strictEqual(st.motdepasse, 'demo');
});
