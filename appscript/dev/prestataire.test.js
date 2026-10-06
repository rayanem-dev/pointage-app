const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const { call, run } = loadApp();
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); return r; };

test('personnel du prestataire : responsables pointage (droits sur tous les agents), staff en consultation ou avec droits, adresse retirée = compte désactivé', () => {
  run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  const admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  const chefA = ok(call(admin, 'agentCreate', { nom: 'CHEF A', email: 'ca@t.fr', role: 'chef', password: 'chefapw123' })).agent;
  ok(call(admin, 'agentCreate', { nom: 'AGENT A', email: 'aa@t.fr', role: 'agent', password: 'agentpw123', chef_id: chefA.id }));
  const agB = ok(call(admin, 'agentCreate', { nom: 'AGENT B', email: 'ab@t.fr', role: 'agent', password: 'agentpw123' })).agent;
  const ag = ok(call(null, 'login', 'aa@t.fr', 'agentpw123')).token;
  const dem = ok(call(ag, 'demandeCreate', { type: 'ats' }));

  const r = ok(call(admin, 'setupSave', { direction_email: 'resp.un@p.dz, resp.deux@p.dz', staff_emails: 'cons@p.dz|0, droit@p.dz|1' }));
  assert.deepStrictEqual(r.comptes.map((c) => c.email).sort(), ['cons@p.dz', 'droit@p.dz', 'resp.deux@p.dz', 'resp.un@p.dz']);
  assert.strictEqual(r.staff_emails, 'cons@p.dz|0, droit@p.dz|1');
  assert.strictEqual(r.comptes.find((c) => c.email === 'resp.un@p.dz').nom, 'Resp Un');
  const login = (e) => { const c = r.comptes.find((x) => x.email === e); return ok(call(null, 'login', e, c.password)).token; };

  // responsable pointage : tous les agents, demandes de tous, pas pointé lui-même
  const resp = login('resp.un@p.dz');
  assert.strictEqual(ok(call(resp, 'me')).user.role, 'chef');
  const grille = ok(call(resp, 'gridMonth', '2026-03')).rows.map((x) => x.nom).sort();
  assert.deepStrictEqual(grille, ['AGENT A', 'AGENT B', 'CHEF A']);
  assert.ok(ok(call(resp, 'demandesList')).toHandle.some((d) => d.id === dem.id), 'voit la demande d\'un agent d\'une autre équipe');
  ok(call(resp, 'pointer', { agent_id: agB.id, date: '2026-03-02', statut: 'T' }));
  // un responsable d'équipe ordinaire ne voit toujours que son équipe
  const chef = ok(call(null, 'login', 'ca@t.fr', 'chefapw123')).token;
  assert.deepStrictEqual(ok(call(chef, 'gridMonth', '2026-03')).rows.map((x) => x.nom).sort(), ['AGENT A', 'CHEF A']);

  // staff : consultation (client) ou droits (chef)
  const cons = login('cons@p.dz'); const droit = login('droit@p.dz');
  assert.strictEqual(ok(call(cons, 'me')).user.role, 'client');
  fail(call(cons, 'pointer', { agent_id: agB.id, date: '2026-03-03', statut: 'T' }));
  ok(call(cons, 'gridMonth', '2026-03'));
  assert.strictEqual(ok(call(droit, 'me')).user.role, 'chef');
  ok(call(droit, 'pointer', { agent_id: agB.id, date: '2026-03-03', statut: 'T' }));

  // la case change les droits ; une adresse retirée désactive le compte (jamais un compte ordinaire)
  ok(call(admin, 'setupSave', { staff_emails: 'cons@p.dz|1' }));
  assert.strictEqual(ok(call(cons, 'me')).user.role, 'chef', 'case cochée : droits de responsable');
  fail(call(null, 'login', 'droit@p.dz', r.comptes.find((c) => c.email === 'droit@p.dz').password), /./);
  ok(call(admin, 'setupSave', { direction_email: 'ca@t.fr' }));
  assert.strictEqual(ok(call(chef, 'me')).user.role, 'chef');
  assert.strictEqual(ok(call(chef, 'gridMonth', '2026-03')).rows.length, 2, 'compte ordinaire non modifié');
});

test('reprise des anciennes saisies : adresses du champ « nom » = responsables pointage, anciennes adresses = personnel (consultation)', () => {
  const app2 = loadApp(); const call2 = app2.call; const run2 = app2.run;
  run2("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  const admin = ok(call2(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  run2("Params.set({ direction_nom: 'r1@p.dz;r2@p.dz', direction_email: 'x@p.dz, y@p.dz' })");
  const v = ok(call2(admin, 'setupGet')).values;
  assert.strictEqual(v.direction_email, 'r1@p.dz, r2@p.dz');
  assert.strictEqual(v.staff_emails, 'x@p.dz|0, y@p.dz|0');
});
