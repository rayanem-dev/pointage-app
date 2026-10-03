const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const { run } = loadApp();
const P = '{ jours_travail: "28", jours_repos: "28" }';
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const range = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
// real : { 'AAAA-MM-JJ': 'T'|'R'|'ABS' } -> { date: statut prévu } jusqu'à `to`
const forecast = (real, to) => Object.fromEntries(JSON.parse(run(`JSON.stringify(Array.from(Cycle.forecastOf(new Map(Object.entries(${JSON.stringify(real)})), ${P}, '${to}').entries()))`)));
const cycle = (real) => JSON.parse(run(`JSON.stringify(Cycle.cycleOf(new Map(Object.entries(${JSON.stringify(real)})), ${P}))`));
const all = (f, from, to, st) => range(from, to).every((d) => f[d] === st);

test('après le premier pointage, les prévisions s\'enchaînent seules : +28 T, +28 R, +28 T…', () => {
  const f = forecast({ '2026-10-01': 'T' }, '2027-01-31');
  assert.ok(all(f, '2026-10-02', '2026-10-28', 'T') && all(f, '2026-10-29', '2026-11-25', 'R') && all(f, '2026-11-26', '2026-12-23', 'T') && all(f, '2026-12-24', '2027-01-20', 'R'));
  assert.strictEqual(f['2026-10-01'], undefined, 'le jour pointé n\'est pas une prévision');
});

test('un pointage réel n\'est jamais remplacé et devient le repère s\'il contredit la prévision', () => {
  const f = forecast({ '2026-10-01': 'T', '2026-10-20': 'R' }, '2026-12-31');
  assert.ok(all(f, '2026-10-02', '2026-10-19', 'T'), 'prévu T jusqu\'au pointage réel');
  assert.strictEqual(f['2026-10-20'], undefined, 'le jour réel n\'est pas remplacé');
  assert.ok(all(f, '2026-10-21', '2026-11-16', 'R') && all(f, '2026-11-17', '2026-12-14', 'T'), 'R depuis le 20 (27 jours de plus) puis T');
});

test('même pile à 28 jours (là où la prévision basculerait), le pointage réel devient le repère', () => {
  const f = forecast({ '2026-10-01': 'T', '2026-10-29': 'T' }, '2026-12-31');
  assert.ok(all(f, '2026-10-02', '2026-10-28', 'T') && all(f, '2026-10-30', '2026-11-25', 'T') && all(f, '2026-11-26', '2026-12-23', 'R'), 'T repart du 29 (28 jours), puis R');
});

test('un pointage réel conforme à la prévision ne relance pas le comptage', () => {
  const f = forecast({ '2026-10-01': 'T', '2026-10-10': 'T' }, '2026-12-31');
  assert.ok(all(f, '2026-10-11', '2026-10-28', 'T') && all(f, '2026-10-29', '2026-11-25', 'R'), 'bascule toujours le 29');
  const g = forecast({ '2026-10-01': 'T', '2026-11-26': 'T' }, '2026-12-31'); // réel conforme à la bascule R→T prévue
  assert.ok(all(g, '2026-10-29', '2026-11-25', 'R') && all(g, '2026-11-27', '2026-12-23', 'T') && all(g, '2026-12-24', '2026-12-31', 'R'));
});

test('les jours pointés entre deux repères sont comblés par la prévision', () => {
  const f = forecast({ '2026-10-01': 'T', '2027-02-01': 'R' }, '2027-02-10');
  assert.strictEqual(Object.keys(f).filter((d) => d > '2026-10-01' && d < '2027-02-01').length, range('2026-10-02', '2027-01-31').length, 'aucun trou');
  assert.ok(all(f, '2027-02-02', '2027-02-10', 'R'));
});

test('une absence fait avancer le calendrier sans arrêter les prévisions', () => {
  const f = forecast({ '2026-10-01': 'T', '2026-10-05': 'ABS' }, '2026-11-30');
  assert.strictEqual(f['2026-10-05'], undefined);
  assert.ok(all(f, '2026-10-06', '2026-10-28', 'T') && all(f, '2026-10-29', '2026-11-25', 'R'));
});

test('sans pointage T/R : aucune prévision (absence seule, ou rien)', () => {
  assert.deepStrictEqual(forecast({}, '2026-12-31'), {});
  assert.deepStrictEqual(forecast({ '2026-10-03': 'ABS' }, '2026-12-31'), {});
  assert.strictEqual(cycle({}), null); assert.strictEqual(cycle({ '2026-10-03': 'ABS' }), null);
});

test('cycle en cours : statut, jour de la série, jours restants, prochain changement', () => {
  assert.deepStrictEqual(cycle({ '2026-10-01': 'T', '2026-10-02': 'T', '2026-10-03': 'T', '2026-10-04': 'T', '2026-10-05': 'T' }), { last: '2026-10-05', status: 'T', run: 5, total: 28, remaining: 23, next: '2026-10-29', nextStatus: 'R' });
  const r = cycle({ '2026-10-01': 'T', '2026-10-20': 'R' });
  assert.deepStrictEqual([r.status, r.run, r.remaining, r.next], ['R', 1, 27, '2026-11-17'], 'le R du 20 est le nouveau repère');
});

test('situation du jour (travail / congé, jours restants) cohérente avec la nouvelle règle', () => {
  const info = (real, date) => JSON.parse(run(`JSON.stringify(Cycle.dayInfo(new Map(Object.entries(${JSON.stringify(real)})), ${P}, '${date}'))`));
  const a = info({ '2026-10-01': 'T', '2026-10-20': 'R' }, '2026-10-25');
  assert.deepStrictEqual([a.status, a.prevu, a.remaining, a.change, a.changeStatus], ['R', true, 23, '2026-11-17', 'T'], 'R prévu depuis le repère du 20 : il reste 23 jours (25 oct → 16 nov)');
  assert.strictEqual(info({ '2026-10-01': 'T', '2026-10-20': 'R' }, '2026-10-20').prevu, false, 'jour réel');
});
