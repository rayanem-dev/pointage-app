/** Moteur de rotation (fonctions pures) : cycle T/R, prévisions, totaux, situation du jour. */
var Cycle = (function () {
  // months : { 'YYYY-MM': { [agentId]: ['T','R','ABS','',... 31 jours] } }
  function timelineOf(months, agentId) {
    var tl = new Map();
    Object.keys(months).sort().forEach(function (key) {
      var days = months[key][agentId];
      if (!days) return;
      days.forEach(function (st, i) { if (st) tl.set(key + '-' + (i < 9 ? '0' : '') + (i + 1), st); });
    });
    return tl;
  }
  function totalsOf(months, agentId, upToKey) {
    var t = { T: 0, R: 0, ABS: 0 };
    Object.keys(months).forEach(function (key) {
      if (upToKey && key > upToKey) return;
      (months[key][agentId] || []).forEach(function (st) { if (t[st] !== undefined) t[st] += 1; });
    });
    return { T: t.T, R: t.R, ABS: t.ABS, reliquat: t.T - t.R };
  }
  function cycleOf(tl, params) {
    var nT = Number(params.jours_travail);
    var nR = Number(params.jours_repos);
    var last = null;
    tl.forEach(function (v, d) { if (!last || d > last) last = d; });
    if (!last) return null;
    var status = tl.get(last);
    if (status !== 'T' && status !== 'R') return { last: last, status: status, run: 0, remaining: 0, next: null, nextStatus: null };
    var run = 1;
    while (tl.get(Dates.addDays(last, -run)) === status) run += 1;
    var total = status === 'T' ? nT : nR;
    var remaining = Math.max(0, total - run);
    return { last: last, status: status, run: run, total: total, remaining: remaining, next: Dates.addDays(last, remaining + 1), nextStatus: status === 'T' ? 'R' : 'T' };
  }
  // Prévisions : Map date -> 'T'|'R' pour les jours non pointés après le dernier pointage.
  function forecastOf(tl, params, toDate) {
    var out = new Map();
    var c = cycleOf(tl, params);
    if (!c || !c.next) return out;
    var nT = Number(params.jours_travail);
    var nR = Number(params.jours_repos);
    if (!(nT >= 1) || !(nR >= 1)) return out;
    var cursor = Dates.addDays(c.last, 1);
    var st = c.status;
    var left = c.remaining;
    var guard = Math.max(0, Dates.diffDays(cursor, toDate)) + 1;
    for (var i = 0; i < guard && cursor <= toDate; i += 1) {
      while (left === 0) { st = st === 'T' ? 'R' : 'T'; left = st === 'T' ? nT : nR; }
      if (!tl.has(cursor)) out.set(cursor, st);
      left -= 1;
      cursor = Dates.addDays(cursor, 1);
    }
    return out;
  }
  // Situation à une date : statut du jour (pointé ou prévu), jours restants (jour compris), date du changement.
  function dayInfo(tl, params, date) {
    var horizon = Number(params.jours_travail) + Number(params.jours_repos) + Number(params.jours_travail) + 5;
    var fc = forecastOf(tl, params, Dates.addDays(date, horizon));
    var st = tl.get(date) || fc.get(date) || '';
    if (!st) return null;
    if (st === 'ABS') return { status: st, prevu: false, remaining: 0, change: null, changeStatus: null };
    var d = Dates.addDays(date, 1);
    var n = 1;
    var s = '';
    for (; n < horizon; n += 1) {
      s = tl.get(d) || fc.get(d) || '';
      if (s !== st) break;
      d = Dates.addDays(d, 1);
    }
    return { status: st, prevu: !tl.has(date), remaining: n, change: s ? d : null, changeStatus: s || null };
  }
  return { timelineOf: timelineOf, totalsOf: totalsOf, cycleOf: cycleOf, forecastOf: forecastOf, dayInfo: dayInfo };
})();
