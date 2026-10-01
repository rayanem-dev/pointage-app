// Moteur de rotation (fonctions pures) : cycle T/R, prévisions, totaux.
const { addDays, diffDays } = require('./dates');

// months : { 'YYYY-MM': { [agentId]: ['T','R','ABS','',... 31 jours] } }
function timelineOf(months, agentId) {
  const tl = new Map();
  for (const key of Object.keys(months).sort()) {
    const days = months[key][agentId];
    if (!days) continue;
    days.forEach((st, i) => { if (st) tl.set(`${key}-${String(i + 1).padStart(2, '0')}`, st); });
  }
  return tl;
}

function totalsOf(months, agentId, upToKey) {
  const t = { T: 0, R: 0, ABS: 0 };
  for (const key of Object.keys(months)) {
    if (upToKey && key > upToKey) continue;
    for (const st of months[key][agentId] || []) if (t[st] !== undefined) t[st] += 1;
  }
  return { ...t, reliquat: t.T - t.R };
}

// Dernier jour pointé, statut en cours, durée de la série, jours restants avant la bascule.
function cycleOf(tl, params) {
  const nT = Number(params.jours_travail); const nR = Number(params.jours_repos);
  let last = null;
  for (const d of tl.keys()) if (!last || d > last) last = d;
  if (!last) return null;
  const status = tl.get(last);
  if (status !== 'T' && status !== 'R') return { last, status, run: 0, remaining: 0, next: null, nextStatus: null };
  let run = 1;
  while (tl.get(addDays(last, -run)) === status) run += 1;
  const total = status === 'T' ? nT : nR;
  const remaining = Math.max(0, total - run);
  return { last, status, run, total, remaining, next: addDays(last, remaining + 1), nextStatus: status === 'T' ? 'R' : 'T' };
}

// Prévisions : renvoie Map date -> 'T'|'R' (jours non pointés après le dernier pointage).
function forecastOf(tl, params, toDate) {
  const out = new Map();
  const c = cycleOf(tl, params);
  if (!c || !c.next) return out;
  const nT = Number(params.jours_travail); const nR = Number(params.jours_repos);
  if (!(nT >= 1) || !(nR >= 1)) return out;
  let cursor = addDays(c.last, 1);
  let st = c.status; let left = c.remaining;
  const guard = Math.max(0, diffDays(cursor, toDate)) + 1;
  for (let i = 0; i < guard && cursor <= toDate; i += 1) {
    while (left === 0) { st = st === 'T' ? 'R' : 'T'; left = st === 'T' ? nT : nR; }
    if (!tl.has(cursor)) out.set(cursor, st);
    left -= 1; cursor = addDays(cursor, 1);
  }
  return out;
}

module.exports = { timelineOf, totalsOf, cycleOf, forecastOf };
