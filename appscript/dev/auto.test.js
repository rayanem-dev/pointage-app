const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const app = loadApp();
const { call, run, env } = app;
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); return r; };
const T = {};
const aujourdhui = () => run('Dates.today()');
const hier = () => run('Dates.addDays(Dates.today(), -1)');
const statutDu = (tok, id, date) => { const g = ok(call(tok, 'gridMonth', date.slice(0, 7))); const row = g.rows.find((r) => r.id === id); return row.days[Number(date.slice(8, 10)) - 1].statut; };

test('pointage automatique : mise en place et réglage (heure par défaut 06:30, tâche planifiée créée une seule fois)', () => {
  run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  T.admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  T.a = ok(call(T.admin, 'agentCreate', { nom: 'AUTO UN', email: 'a1@t.fr', role: 'agent', password: 'autopw1234' })).agent.id;
  T.b = ok(call(T.admin, 'agentCreate', { nom: 'AUTO DEUX', email: 'a2@t.fr', role: 'agent', password: 'autopw1234' })).agent.id;
  T.c = ok(call(T.admin, 'agentCreate', { nom: 'AUTO TROIS', email: 'a3@t.fr', role: 'agent', password: 'autopw1234' })).agent.id;
  const g0 = ok(call(T.admin, 'autoPointageGet'));
  assert.deepStrictEqual([g0.on, g0.heure, g0.declencheur], [false, '06:30', false]);
  fail(call(T.admin, 'autoPointageSet', { on: true, heure: '25:99' }), /Heure invalide/);
  const s = ok(call(T.admin, 'autoPointageSet', { on: true }));
  assert.deepStrictEqual([s.on, s.heure, s.declencheur], [true, '06:30', true]);
  ok(call(T.admin, 'autoPointageSet', { on: true, heure: '07:15' }));
  assert.deepStrictEqual(env.triggers, ['autoPointageTick'], 'une seule tâche planifiée, jamais en double');
  assert.strictEqual(ok(call(T.admin, 'autoPointageGet')).heure, '07:15');
  ok(call(T.admin, 'autoPointageSet', { on: true, heure: '06:30' }));
});

test('à l\'heure choisie : le pointage de la veille est recopié (absence comprise), un jour déjà pointé n\'est pas remplacé', () => {
  const h = hier(); const j = aujourdhui();
  ok(call(T.admin, 'pointer', { agent_id: T.a, date: h, statut: 'T' }));
  ok(call(T.admin, 'pointer', { agent_id: T.b, date: h, statut: 'ABS' }));
  ok(call(T.admin, 'pointer', { agent_id: T.c, date: h, statut: 'T' }));
  ok(call(T.admin, 'pointer', { agent_id: T.c, date: j, statut: 'R' })); // corrigé à la main : c'est lui qui a raison
  assert.strictEqual(JSON.stringify(run("Auto.run('06:00')")), '[]', 'avant l\'heure : rien');
  const faits = run("Auto.run('06:45')");
  assert.strictEqual(faits.length, 1); assert.strictEqual(faits[0].total, 2, 'deux agents complétés (le 3e était déjà pointé)');
  assert.strictEqual(statutDu(T.admin, T.a, j), 'T');
  assert.strictEqual(statutDu(T.admin, T.b, j), 'ABS', 'l\'absence est recopiée aussi');
  assert.strictEqual(statutDu(T.admin, T.c, j), 'R', 'la correction manuelle est conservée');
  assert.strictEqual(JSON.stringify(run("Auto.run('09:00')")), '[]', 'une seule exécution par jour');
  const g = ok(call(T.admin, 'autoPointageGet')); assert.strictEqual(g.derniere, j); assert.strictEqual(g.total, 2);
});

test('rattrapage : une exécution manquée est comblée à la suivante ; correction manuelle jamais écrasée ; réglage désactivé = rien', () => {
  const j = aujourdhui(); const avantHier = run('Dates.addDays(Dates.today(), -2)');
  // simule un lendemain : la dernière exécution date d'hier
  const cle = Object.keys(env.props).find((k) => k.startsWith('AUTO_MAIN_')); const s = JSON.parse(env.props[cle]); s.last = hier(); env.props[cle] = JSON.stringify(s);
  ok(call(T.admin, 'pointer', { agent_id: T.a, date: j, statut: 'ABS' })); // correction à la main aujourd'hui
  run("Auto.run('06:31')");
  assert.strictEqual(statutDu(T.admin, T.a, j), 'ABS', 'jamais écrasé');
  s.last = hier(); s.on = false; env.props[cle] = JSON.stringify(s);
  assert.strictEqual(JSON.stringify(run("Auto.run('23:00')")), '[]', 'désactivé : rien');
  assert.ok(avantHier < j);
});

test('responsable d\'équipe : l\'automatique ne couvre que son équipe ; l\'agent ne peut pas l\'activer ; autorisation Google refusée : message clair', () => {
  const chef = ok(call(T.admin, 'agentCreate', { nom: 'CHEF AUTO', email: 'chef@t.fr', role: 'chef', password: 'chefauto123' })).agent;
  const sien = ok(call(T.admin, 'agentCreate', { nom: 'SON AGENT', email: 'sien@t.fr', role: 'agent', password: 'sienauto123', chef_id: chef.id })).agent.id;
  const autre = ok(call(T.admin, 'agentCreate', { nom: 'AUTRE AGENT', email: 'autre@t.fr', role: 'agent', password: 'autreauto12' })).agent.id;
  const h = hier(); const j = aujourdhui();
  ok(call(T.admin, 'pointer', { agent_id: sien, date: h, statut: 'T' })); ok(call(T.admin, 'pointer', { agent_id: autre, date: h, statut: 'T' }));
  // on retire le réglage de l'administrateur pour isoler celui du responsable
  Object.keys(env.props).filter((k) => k.startsWith('AUTO_MAIN_') && !k.endsWith(chef.id)).forEach((k) => { const v = JSON.parse(env.props[k]); v.on = false; env.props[k] = JSON.stringify(v); });
  const tc = ok(call(null, 'login', 'chef@t.fr', 'chefauto123')).token;
  ok(call(tc, 'autoPointageSet', { on: true, heure: '06:30' }));
  run("Auto.run('07:00')");
  assert.strictEqual(statutDu(T.admin, sien, j), 'T', 'son équipe est complétée');
  assert.strictEqual(statutDu(T.admin, autre, j), '', 'pas les agents des autres équipes');
  const ag = ok(call(null, 'login', 'sien@t.fr', 'sienauto123')).token;
  fail(call(ag, 'autoPointageSet', { on: true }), /refusé/);
  env.triggers.length = 0; env.triggerRefuse = true;
  const r = ok(call(T.admin, 'autoPointageSet', { on: true }));
  assert.strictEqual(r.declencheur, false); assert.match(r.avertissement, /autoPointageAutoriser/);
  env.triggerRefuse = false;
});
