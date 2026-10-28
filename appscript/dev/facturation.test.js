const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };

test('module Facturation : actif par défaut, désactivable par l\'administrateur seul, refusé par le serveur quand il est désactivé', () => {
  const app = loadApp(); const call = app.call;
  app.run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  const admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  assert.strictEqual(ok(call(admin, 'me')).params.facturation, true, 'actif par défaut');
  const refus = (r) => { assert.strictEqual(r.ok, false); assert.match(r.error, /Facturation est désactivé/); };

  ok(call(admin, 'setupSave', { facturation: '0' }));
  assert.strictEqual(ok(call(admin, 'me')).params.facturation, false);
  refus(call(admin, 'exportFacture', { month: '2026-10', contrat: 'X', format: 'pdf', facture_numero: '1' }));
  refus(call(admin, 'factureCopie', { month: '2026-10', contrat: 'X', format: 'pdf' }));
  refus(call(admin, 'attachementFacturer', { month: '2026-10', contrat: 'X', facture_numero: '1' }));

  ok(call(admin, 'setupSave', { facturation: '1' }));
  assert.strictEqual(ok(call(admin, 'me')).params.facturation, true);
});

test('module Facturation : un responsable avec accès au Setup ne peut pas le modifier', () => {
  const app = loadApp(); const call = app.call;
  app.run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  const admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  ok(call(admin, 'agentCreate', { nom: 'CHEF S', email: 'cs@t.fr', role: 'chef', password: 'chefpw1234' }));
  const chef = ok(call(null, 'login', 'cs@t.fr', 'chefpw1234')).token;
  const r = call(chef, 'setupSave', { facturation: '0' });
  if (r.ok) assert.strictEqual(ok(call(admin, 'me')).params.facturation, true, 'ignoré pour un non-administrateur');
  else assert.match(r.error, /Setup/);
});

test('accès du responsable d\'équipe à l\'attachement : réglage global du Setup (individuel / tous / aucun)', () => {
  const app = loadApp(); const call = app.call;
  app.run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  const admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  ok(call(admin, 'agentCreate', { nom: 'CHEF X', email: 'cx@t.fr', role: 'chef', password: 'chefpw1234' }));
  const chef = ok(call(null, 'login', 'cx@t.fr', 'chefpw1234')).token;
  const refuse = () => { const r = call(chef, 'attachementPreview', '2026-10', 'X'); assert.strictEqual(r.ok, false); assert.match(r.error, /exports non accordé/); };
  const passe = () => { const r = call(chef, 'attachementPreview', '2026-10', 'X'); if (!r.ok) assert.doesNotMatch(r.error, /exports non accordé/); };
  assert.strictEqual(ok(call(admin, 'me')).params.chef_exports, 'individuel');
  refuse();                                           // individuel : la case de sa fiche n'est pas cochée
  ok(call(admin, 'setupSave', { chef_exports: 'tous' })); passe();
  ok(call(admin, 'setupSave', { chef_exports: 'aucun' })); refuse();
  assert.strictEqual(call(admin, 'setupSave', { chef_exports: 'n_importe_quoi' }).ok, false);
  ok(call(admin, 'setupSave', { chef_exports: 'individuel' })); refuse();
});
