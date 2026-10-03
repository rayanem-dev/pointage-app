const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const app = loadApp();
const { call, run } = app;
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); };

test('vue étalée 3 mois, 6 mois, 1 an : un caractère par jour, totaux, jours fériés', () => {
  run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  const tk = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  const a = ok(call(tk, 'agentCreate', { nom: 'AGENT UN', email: 'un@t.fr', role: 'agent', password: 'unpass123' })).agent;
  ok(call(tk, 'pointer', { agent_id: a.id, date: '2026-08-01', date_fin: '2026-08-10', statut: 'T' }));
  ok(call(tk, 'pointer', { agent_id: a.id, date: '2026-08-11', date_fin: '2026-08-15', statut: 'R' }));
  ok(call(tk, 'pointer', { agent_id: a.id, date: '2026-10-02', statut: 'ABS' }));
  ok(call(tk, 'pointer', { agent_id: a.id, date: '2026-03-05', date_fin: '2026-03-06', statut: 'T' }));

  const p3 = ok(call(tk, 'gridPeriod', '2026-08', 3, '', true));
  assert.strictEqual(JSON.stringify(p3.months.map((m) => m.key)), JSON.stringify(['2026-08', '2026-09', '2026-10']));
  assert.strictEqual(p3.from, '2026-08-01'); assert.strictEqual(p3.to, '2026-10-31');
  const r3 = p3.rows.find((r) => r.id === a.id);
  assert.strictEqual(r3.d.length, 31 + 30 + 31, 'un caractère par jour');
  assert.strictEqual(r3.d.slice(0, 15), 'TTTTTTTTTTRRRRR', 'jours pointés');
  assert.ok(/^[tr.]+$/.test(r3.d.slice(15, 31)) || r3.d.slice(15, 31).includes('t'), 'jours prévus en minuscules');
  assert.strictEqual(r3.d.charAt(31 + 30 + 1), 'A', 'absence du 2 octobre');
  assert.strictEqual(JSON.stringify(r3.total), JSON.stringify({ T: 10, R: 5, ABS: 1 }));
  assert.strictEqual(r3.cumul.reliquat, 12 - 5, 'solde cumulé depuis le début (mars compris)');
  assert.ok(p3.feries.some((f) => f.date === '2026-11-01') === false, 'le 1er novembre est hors période');
  assert.strictEqual(p3.today, run('Dates.today()'));

  const sans = ok(call(tk, 'gridPeriod', '2026-08', 3, '', false)).rows.find((r) => r.id === a.id);
  assert.ok(!/[tr]/.test(sans.d), 'sans prévisions : aucun jour prévu');
  const p12 = ok(call(tk, 'gridPeriod', '2026-03', 12));
  assert.strictEqual(p12.months.length, 12); assert.strictEqual(p12.to, '2027-02-28');
  assert.strictEqual(p12.rows.find((r) => r.id === a.id).d.length, 365);
  const f = new Map(p12.feries.map((x) => [x.date, x.nom]));
  assert.strictEqual(f.get('2026-07-05'), "Fête de l'indépendance"); assert.strictEqual(f.get('2026-11-01'), 'Anniversaire de la Révolution'); assert.strictEqual(f.get('2027-01-12'), 'Yennayer (Nouvel an amazigh)');
  assert.ok(p12.feries.some((x) => x.type === 'religieuse' && x.nom.startsWith('Aïd el-Adha') && x.date >= '2026-05-26' && x.date <= '2026-05-29'), 'Aïd el-Adha 2026 vers le 27 mai');
  const m1 = ok(call(tk, 'gridMonth', '2026-07'));
  assert.ok(m1.feries.some((x) => x.date === '2026-07-05'), 'les fêtes sont aussi dans la vue Mois');
});

test('jours fériés : ajouts et retraits du Setup', () => {
  const tk = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  ok(call(tk, 'setupSave', { feries_perso: '2026-07-04 Pont du 5 juillet\n- 2026-07-05' }));
  const r = ok(call(tk, 'gridMonth', '2026-07')).feries;
  assert.ok(r.some((x) => x.date === '2026-07-04' && x.type === 'perso' && x.nom === 'Pont du 5 juillet'));
  assert.ok(!r.some((x) => x.date === '2026-07-05'), 'retiré');
});

test('vue étalée : période invalide ; l\'agent consulte son pointage sans pouvoir le modifier', () => {
  const tk = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  fail(call(tk, 'gridPeriod', '2026-10', 4), /Période invalide/);
  const ag = ok(call(null, 'login', 'un@t.fr', 'unpass123')).token;
  const mine = ok(call(ag, 'gridPeriod', '2026-10', 3));
  assert.strictEqual(mine.rows.length, 1, 'l\'agent ne voit que son propre pointage');
  assert.strictEqual(mine.rows[0].nom, 'AGENT UN');
  fail(call(ag, 'pointer', { agent_id: mine.rows[0].id, date: '2026-10-05', statut: 'T' }), /(accès|réservé|autoris|refus)/i);
});

test('solde prévu le jour du départ en congé', () => {
  const tk = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  const b = ok(call(tk, 'agentCreate', { nom: 'AGENT DEUX', email: 'deux@t.fr', role: 'agent', password: 'deuxpass12', rotation: '10/5' })).agent;
  const today = run('Dates.today()');
  const start = run(`Dates.addDays('${today}', -3)`);
  ok(call(tk, 'pointer', { agent_id: b.id, date: start, date_fin: run(`Dates.addDays('${today}', -1)`), statut: 'T' })); // 3 jours T pointés, rotation 10 T / 5 R
  const ag = ok(call(null, 'login', 'deux@t.fr', 'deuxpass12')).token;
  const ov = ok(call(ag, 'overview'));
  assert.strictEqual(ov.aujourdhui.status, 'T');
  // 10 jours T au total avant le congé : solde au dernier jour de travail = 10 − 0
  assert.strictEqual(ov.soldeChange, 10);
});

test('compléter les jours non pointés : dernier statut recopié, jamais de remplacement', () => {
  const tk = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  const today = run('Dates.today()'); const j = (n) => run(`Dates.addDays('${today}', ${n})`);
  const mk = (nom, email) => ok(call(tk, 'agentCreate', { nom, email, role: 'agent', password: 'passw0rd12' })).agent;
  const t = mk('AGENT T', 't@t.fr'); const r = mk('AGENT R', 'r@t.fr'); const ab = mk('AGENT ABS', 'ab@t.fr'); const vide = mk('SANS POINTAGE', 'v@t.fr'); const aj = mk('A JOUR', 'aj@t.fr');
  ok(call(tk, 'pointer', { agent_id: t.id, date: j(-12), date_fin: j(-7), statut: 'T' }));
  ok(call(tk, 'pointer', { agent_id: r.id, date: j(-12), date_fin: j(-7), statut: 'R' }));
  ok(call(tk, 'pointer', { agent_id: ab.id, date: j(-7), statut: 'ABS' }));
  ok(call(tk, 'pointer', { agent_id: aj.id, date: j(-3), date_fin: j(0), statut: 'T' }));
  const ids = [t.id, r.id, ab.id, vide.id, aj.id];
  const ap = ok(call(tk, 'pointerCompleter', { agent_ids: ids, to: j(0), apercu: true }));
  assert.strictEqual(ap.applique, false); assert.strictEqual(ap.agents.length, 3); assert.strictEqual(ap.total, 7 * 3);
  assert.deepStrictEqual(ap.ignores.map((x) => x.raison).sort().join(','), 'aucun pointage,à jour');
  assert.strictEqual(run(`Pointage.grid('${today.slice(0, 7)}', [Agents.get('${t.id}')], false).rows[0].days[${Number(today.slice(8, 10)) - 1}].statut`), '', 'aperçu : rien d\'écrit');
  const res = ok(call(tk, 'pointerCompleter', { agent_ids: ids, to: j(0) }));
  assert.strictEqual(res.applique, true); assert.strictEqual(res.total, 21);
  const statutAu = (id, d) => run(`(function(){ var m = Pointage.loadAllMonths().months; return Cycle.timelineOf(m, '${id}').get('${d}') || ''; })()`);
  [-6, -3, 0].forEach((n) => { assert.strictEqual(statutAu(t.id, j(n)), 'T'); assert.strictEqual(statutAu(r.id, j(n)), 'R'); assert.strictEqual(statutAu(ab.id, j(n)), 'ABS', 'ABS recopié tel quel'); });
  assert.strictEqual(statutAu(vide.id, j(0)), '');
  // idempotent : plus rien à copier
  const again = ok(call(tk, 'pointerCompleter', { agent_ids: ids, to: j(0), apercu: true })); assert.strictEqual(again.total, 0);
  // jamais de remplacement : un jour déjà pointé au milieu de la période est conservé
  ok(call(tk, 'pointer', { agent_id: t.id, date: j(-2), statut: 'R' }));
  ok(call(tk, 'pointerCompleter', { agent_ids: [t.id], from: j(-6), to: j(0) }));
  assert.strictEqual(statutAu(t.id, j(-2)), 'R');
  fail(call(tk, 'pointerCompleter', { agent_ids: [], to: j(0) }), /Aucun agent/);
  fail(call(tk, 'pointerCompleter', { tous: true, to: 'bof' }), /Dates invalides/);
});

test('compléter avec la rotation prévue (option) et droits du responsable d’équipe', () => {
  const tk = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  const today = run('Dates.today()'); const j = (n) => run(`Dates.addDays('${today}', ${n})`);
  const a = ok(call(tk, 'agentCreate', { nom: 'ROT AGENT', email: 'rot@t.fr', role: 'agent', password: 'passw0rd12', rotation: '3/3' })).agent;
  ok(call(tk, 'pointer', { agent_id: a.id, date: j(-12), date_fin: j(-10), statut: 'T' }));
  const res = ok(call(tk, 'pointerCompleter', { agent_ids: [a.id], to: j(-5), mode: 'rotation' }));
  assert.strictEqual(res.total, 5);
  const seq = [-9, -8, -7, -6, -5].map((n) => run(`(function(){ return Cycle.timelineOf(Pointage.loadAllMonths().months, '${a.id}').get('${j(n)}'); })()`)).join('');
  assert.strictEqual(seq, 'RRRTT', 'après 3 T : 3 R puis T');
  const ag = ok(call(null, 'login', 'rot@t.fr', 'passw0rd12')).token;
  fail(call(ag, 'pointerCompleter', { tous: true, to: j(0) }), /(accès|réservé|autoris)/i);
});
