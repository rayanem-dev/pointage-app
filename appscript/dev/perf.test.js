const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const app = loadApp();
const { call, run, env } = app;
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const T = {};

test('mise en place : un client et son administrateur', () => {
  run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  T.owner = ok(call(null, 'login', 'admin@t.fr', 'adminpw12', 'ADMIN')).token;
  ok(call(T.owner, 'clientCreate', { code: 'ALPHA', nom: 'Alpha', admin_email: 'a@alpha.dz', admin_password: 'alphapass1' }));
  T.alpha = ok(call(null, 'login', 'a@alpha.dz', 'alphapass1', 'ALPHA')).token;
});

test('un classeur n\'est ouvert qu\'une fois par appel, et plus du tout quand le cache est chaud', () => {
  run('Store.flushLocal()'); ok(call(T.alpha, 'agentsVisible')); // réchauffe le cache
  run('Store.flushLocal()'); env.opens = 0;
  ok(call(T.alpha, 'agentsVisible'));
  assert.strictEqual(env.opens, 0, 'cache chaud : aucune ouverture de classeur');
  run('Store.flushLocal()'); env.opens = 0;
  ok(call(T.alpha, 'gridMonth', '2026-10'));
  assert.ok(env.opens <= 2, 'au plus une ouverture par classeur : ' + env.opens);
});

test('le cache partagé reste cohérent : une écriture est vue par l\'exécution suivante', () => {
  ok(call(T.alpha, 'agentCreate', { nom: 'NOUVEL AGENT', email: 'n@alpha.dz', role: 'agent', password: 'nouveau123' }));
  run('Store.flushLocal()'); // autre exécution : seul le cache partagé reste
  const noms = ok(call(T.alpha, 'agentsVisible')).map((a) => a.nom);
  assert.ok(noms.includes('NOUVEL AGENT'));
  // un autre client n'est pas touché par l'écriture
  assert.ok(!ok(call(T.owner, 'agentsVisible')).some((a) => a.nom === 'NOUVEL AGENT'));
});

test('modification à la main du classeur : visible après remise à zéro du cache', () => {
  const id = run("Tenants.find('ALPHA').classeur_id");
  const sheet = env.books[id].getSheetByName('Agents');
  const rows = sheet.getDataRange().getValues();
  const i = rows[0].indexOf('nom'); const r = rows.findIndex((x) => x[i] === 'NOUVEL AGENT');
  sheet.getRange(r + 1, i + 1).setValue('RENOMMÉ À LA MAIN');
  run('Store.flushLocal()');
  assert.ok(ok(call(T.alpha, 'agentsVisible')).some((a) => a.nom === 'NOUVEL AGENT'), 'en cache : pas encore vu (au plus 2 minutes)');
  run("Store.setTenant('ALPHA', Tenants.find('ALPHA').classeur_id); Store.reset(); Store.setTenant('', '')");
  assert.ok(ok(call(T.alpha, 'agentsVisible')).some((a) => a.nom === 'RENOMMÉ À LA MAIN'));
});

test('éviction du numéro de version par Google : une ancienne lecture en cache ne ressuscite pas', () => {
  const evince = () => { Object.keys(env.cache).filter((k) => k.startsWith('V_')).forEach((k) => delete env.cache[k]); run('Store.flushLocal()'); };
  evince(); const avant = ok(call(T.alpha, 'agentsVisible')); // lectures mises en cache sans numéro de version
  const cible = avant[0];
  ok(call(T.alpha, 'agentUpdate', cible.id, { nom: 'RENOMME APRES' })); // écriture : le numéro de version change
  evince(); // Google évince de nouveau le numéro : avant correction, l'ancien numéro « 0 » rendait la lecture d'avant l'écriture valide
  assert.ok(ok(call(T.alpha, 'agentsVisible')).some((a) => a.id === cible.id && a.nom === 'RENOMME APRES'), 'la lecture reflète l\'écriture');
});
test('« Actualiser les données » : réservé à l\'administrateur, relit le classeur', () => {
  assert.strictEqual(ok(call(T.alpha, 'cacheVider')).ok, true);
  const ag = ok(call(T.alpha, 'agentCreate', { nom: 'SIMPLE AGENT', email: 'simple@alpha.dz', role: 'agent', password: 'simple12345' })).agent;
  const tk = ok(call(null, 'login', 'simple@alpha.dz', 'simple12345', 'ALPHA')).token;
  assert.strictEqual(call(tk, 'cacheVider').ok, false, 'un agent ne peut pas vider le cache');
  assert.ok(ag.id);
});
