const test = require('node:test');
const assert = require('node:assert');
const { timelineOf, cycleOf, forecastOf, totalsOf } = require('../src/lib/cycle');
const { amountInWords, money } = require('../src/lib/format');

const params = { jours_travail: '28', jours_repos: '28' };
const month = (key, plan) => ({ [key]: { a: Array.from({ length: 31 }, (_, i) => plan[i] || '') } });

test('retour le 01 : 27 jours T prévus puis 28 R prévus', () => {
  const tl = timelineOf(month('2026-10', ['T']), 'a');
  const c = cycleOf(tl, params);
  assert.deepStrictEqual([c.status, c.run, c.remaining, c.next], ['T', 1, 27, '2026-10-29']);
  const fc = forecastOf(tl, params, '2026-12-31');
  assert.strictEqual(fc.get('2026-10-02'), 'T');
  assert.strictEqual(fc.get('2026-10-28'), 'T');
  assert.strictEqual(fc.get('2026-10-29'), 'R');
  assert.strictEqual(fc.get('2026-11-25'), 'R');
  assert.strictEqual(fc.get('2026-11-26'), 'T');
  assert.strictEqual(fc.has('2026-10-01'), false);
});

test('la série se compte à travers les mois', () => {
  const months = { ...month('2026-09', Array(30).fill('')), ...month('2026-10', ['T', 'T', 'T']) };
  for (let i = 25; i < 30; i += 1) months['2026-09'].a[i] = 'T'; // 26..30 sept = 5 jours
  const c = cycleOf(timelineOf(months, 'a'), params);
  assert.strictEqual(c.run, 8);
  assert.strictEqual(c.remaining, 20);
});

test('série dépassée : bascule immédiate ; absence : pas de prévision', () => {
  const plan = Array(31).fill('T'); // 31 jours T > 28
  const tl = timelineOf(month('2026-10', plan), 'a');
  assert.strictEqual(forecastOf(tl, params, '2026-11-05').get('2026-11-01'), 'R');
  const abs = timelineOf(month('2026-10', ['T', 'ABS']), 'a');
  assert.strictEqual(forecastOf(abs, params, '2026-11-30').size, 0);
});

test('totaux et reliquat cumulés', () => {
  const m = { ...month('2026-09', ['T', 'T', 'R']), ...month('2026-10', ['T', 'R', 'R', 'ABS']) };
  assert.deepStrictEqual(totalsOf(m, 'a'), { T: 3, R: 3, ABS: 1, reliquat: 0 });
  assert.strictEqual(totalsOf(m, 'a', '2026-09').reliquat, 1);
});

test('montant en lettres comme sur la facture', () => {
  assert.strictEqual(amountInWords(3224000), 'TROIS MILLIONS DEUX CENT VINGT-QUATRE MILLE DINARS ALGERIENS');
  assert.strictEqual(money(1147000), '1 147 000,00');
});

test('nombres en lettres', () => {
  const { words } = require('../src/lib/format');
  const cases = { 0: 'zéro', 21: 'vingt et un', 71: 'soixante et onze', 80: 'quatre-vingts', 81: 'quatre-vingt-un', 200: 'deux cents', 1000: 'mille', 2200: 'deux mille deux cents', 80000: 'quatre-vingt mille', 200000: 'deux cent mille', 1147000: 'un million cent quarante-sept mille', 3224000: 'trois millions deux cent vingt-quatre mille' };
  for (const [n, w] of Object.entries(cases)) assert.strictEqual(words(Number(n)), w, n);
});
