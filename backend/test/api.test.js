process.env.STORAGE = 'local';
process.env.DATA_FILE = ':memory:';
process.env.JWT_SECRET = 'test';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'adminpw1';
process.env.UPLOAD_DIR = require('os').tmpdir() + '/pointage-test-uploads';

const test = require('node:test');
const assert = require('node:assert');
const agentsSvc = require('../src/services/agents');
const { app } = require('../src/server');

let base; let server;
const tokens = {};
async function call(method, path, token, body) {
  const res = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
}

test.before(async () => {
  await agentsSvc.ensureAdmin();
  server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

test('login et rôles', async () => {
  assert.strictEqual((await call('POST', '/api/auth/login', null, { email: 'admin@test.local', password: 'faux' })).status, 401);
  const r = await call('POST', '/api/auth/login', null, { email: 'admin@test.local', password: 'adminpw1' });
  assert.strictEqual(r.status, 200); tokens.admin = r.body.token;
  assert.strictEqual((await call('GET', '/api/admin/agents')).status, 401);
});

test('configuration admin : contrat, fonctions, agents', async () => {
  const a = tokens.admin;
  const c = await call('PUT', '/api/admin/contrats', a, {
    contrats: [{ numero: 'C1', client: 'SONATRACH Division', objet: 'Objet', ref_mois: '2026-08', ref_attachement: 16 }],
    fonctions: [{ contrat: 'C1', designation: 'Ingénieur Génie civil', libelle: 'Ingénieur génie civil', positions: 2, delai: 540, prix_unitaire: 18500, qte_precedente_ref: 914 }],
  });
  assert.strictEqual(c.status, 200);
  const chef = await call('POST', '/api/admin/agents', a, { nom: 'CHEF UN', email: 'chef@test.local', role: 'chef', fonction: 'Ingénieur génie civil', contrat: 'C1', password: 'chefpw12' });
  assert.strictEqual(chef.status, 201);
  const ag = await call('POST', '/api/admin/agents', a, { nom: 'AGENT UN', email: 'ag1@test.local', fonction: 'Ingénieur génie civil', contrat: 'C1', chef_id: chef.body.agent.id, password: 'agentpw1' });
  const other = await call('POST', '/api/admin/agents', a, { nom: 'AUTRE', email: 'ag2@test.local', fonction: 'Ingénieur génie civil', contrat: 'C1', password: 'agentpw2' });
  assert.strictEqual((await call('POST', '/api/admin/agents', a, { nom: 'X', email: 'ag1@test.local' })).status, 409);
  tokens.chefId = chef.body.agent.id; tokens.agId = ag.body.agent.id; tokens.otherId = other.body.agent.id;
  for (const [k, email, pw] of [['chef', 'chef@test.local', 'chefpw12'], ['ag', 'ag1@test.local', 'agentpw1']]) tokens[k] = (await call('POST', '/api/auth/login', null, { email, password: pw })).body.token;
});

test('pointage : le chef pointe son groupe uniquement', async () => {
  const ok = await call('POST', '/api/pointage', tokens.chef, { agent_id: tokens.agId, date: '2026-08-01', date_fin: '2026-08-10', statut: 'T' });
  assert.strictEqual(ok.status, 200); assert.strictEqual(ok.body.jours, 10);
  assert.strictEqual((await call('POST', '/api/pointage', tokens.chef, { agent_id: tokens.otherId, date: '2026-08-01', statut: 'T' })).status, 403);
  assert.strictEqual((await call('POST', '/api/pointage', tokens.ag, { agent_id: tokens.agId, date: '2026-08-01', statut: 'R' })).status, 403);
  assert.strictEqual((await call('POST', '/api/pointage', tokens.chef, { agent_id: tokens.agId, date: '2026-08-11', statut: 'Z' })).status, 400);
  await call('POST', '/api/pointage', tokens.chef, { agent_id: tokens.agId, date: '2026-08-11', date_fin: '2026-08-12', statut: 'R' });
  const g = await call('GET', '/api/pointage/grid?month=2026-08', tokens.chef);
  const row = g.body.rows.find((r) => r.id === tokens.agId);
  assert.deepStrictEqual(row.mois, { T: 10, R: 2, ABS: 0, reliquat: 8 });
  assert.strictEqual(row.days[12].prevu, 'R'); // R déjà pointé 2 jours → 26 jours R prévus
  assert.strictEqual(row.days[0].statut, 'T');
  assert.strictEqual(g.body.rows.some((r) => r.id === tokens.otherId), false);
});

test('espace agent : accueil, demandes, documents', async () => {
  const ov = await call('GET', '/api/me/overview?month=2026-08', tokens.ag);
  assert.strictEqual(ov.body.cumul.T, 10); assert.strictEqual(ov.body.cycle.status, 'R');
  const d = await call('POST', '/api/demandes', tokens.ag, { type: 'conge', objet: 'Congé', message: 'svp', destinataire: 'chef' });
  assert.strictEqual(d.status, 201);
  assert.strictEqual((await call('GET', '/api/demandes', tokens.chef)).body.length, 1);
  assert.strictEqual((await call('PUT', `/api/demandes/${d.body.id}`, tokens.ag, { statut: 'acceptee' })).status, 403);
  assert.strictEqual((await call('PUT', `/api/demandes/${d.body.id}`, tokens.chef, { statut: 'acceptee', reponse: 'ok' })).body.statut, 'acceptee');
  const form = new FormData();
  form.append('agent_id', tokens.agId); form.append('type', 'fiche_paie'); form.append('titre', 'Paie août'); form.append('fichier', new Blob(['%PDF-test']), 'paie.pdf');
  const up = await fetch(`${base}/api/documents`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.chef}` }, body: form });
  assert.strictEqual(up.status, 201);
  const list = await call('GET', '/api/documents', tokens.ag);
  assert.strictEqual(list.body.length, 1);
  const file = await fetch(`${base}/api/documents/${list.body[0].id}/file`, { headers: { Authorization: `Bearer ${tokens.ag}` } });
  assert.strictEqual(await file.text(), '%PDF-test');
  assert.strictEqual((await call('GET', `/api/documents?agent_id=${tokens.otherId}`, tokens.ag)).status, 403);
});

test('exports : fiche, attachement N°16, facture', async () => {
  const a = tokens.admin;
  for (const f of ['xlsx', 'pdf']) {
    for (const url of [`/api/exports/fiche?month=2026-08&format=${f}&prevu=1`, `/api/exports/attachement?month=2026-08&contrat=C1&format=${f}`, `/api/exports/facture?month=2026-05&contrat=C1&format=${f}&facture_numero=235/PS/2026`]) {
      const r = await call('GET', url, a);
      assert.strictEqual(r.status, 200, url);
      assert.strictEqual(r.body.subarray(0, 2).toString(), f === 'pdf' ? '%P' : 'PK', url);
    }
  }
  const aug = (await call('GET', '/api/exports/preview/attachement?month=2026-08&contrat=C1', a)).body;
  assert.deepStrictEqual([aug.numero, aug.lines[0].mois, aug.lines[0].precedente, aug.lines[0].cumulee, aug.lines[0].contrat], [16, 62, 914, 976, 1080]);
  const may = (await call('GET', '/api/exports/preview/attachement?month=2026-05&contrat=C1', a)).body;
  assert.strictEqual(may.numero, 13); assert.strictEqual(may.totalHT, 1147000);
  assert.strictEqual((await call('GET', '/api/exports/attachement?month=2026-08&contrat=C1', tokens.chef)).status, 403);
});

test('paramètres : couleurs et rotation modifiables', async () => {
  const a = tokens.admin;
  assert.strictEqual((await call('PUT', '/api/admin/params', a, { jours_travail: '0' })).status, 400);
  assert.strictEqual((await call('PUT', '/api/admin/params', a, { couleur_T: 'vert' })).status, 400);
  await call('PUT', '/api/admin/params', a, { jours_travail: '14', jours_repos: '14', couleur_T_prevu: '#00ff00' });
  const p = (await call('GET', '/api/me/params', tokens.ag)).body;
  assert.deepStrictEqual([p.jours_travail, p.colors.T_prevu], [14, '#00ff00']);
});
