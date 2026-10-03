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
  function other(s) { return s === 'T' ? 'R' : 'T'; }

  // Simulation jour par jour, à partir du premier pointage T/R de l'agent. Les prévisions sont des « ombres » :
  //  - sans pointage ensuite, elles s'enchaînent seules : +N jours T, +M jours R, +N jours T…
  //  - un pointage RÉEL n'est jamais remplacé ; s'il diffère de la prévision (même pile à la fin d'une série),
  //    il devient le nouveau repère et le comptage repart de lui ; s'il est conforme, la série continue.
  //  - une absence (ABS) fait avancer le calendrier sans changer le cycle.
  // Retourne { forecast: Map(date -> 'T'|'R') pour les jours non pointés, st/run : état au dernier jour pointé }.
  function simulate(tl, params, toDate) {
    var nT = Number(params.jours_travail); var nR = Number(params.jours_repos);
    var out = { forecast: new Map(), st: null, run: 0, last: null };
    if (!(nT >= 1) || !(nR >= 1)) return out;
    var first = null;
    tl.forEach(function (v, d) { if ((v === 'T' || v === 'R') && (!first || d < first)) first = d; });
    if (!first) return out;
    var total = function (s) { return s === 'T' ? nT : nR; };
    var st = null; var run = 0;
    for (var d = first; d <= toDate; d = Dates.addDays(d, 1)) {
      if (st && run >= total(st)) { st = other(st); run = 0; } // fin de série prévue : on bascule
      var real = tl.get(d);
      if (real === 'T' || real === 'R') {
        if (st === real) run += 1; else { st = real; run = 1; } // conforme : la série continue ; sinon le pointage réel devient le repère
      } else if (real) { // ABS
        if (st) run += 1;
      } else if (st) { out.forecast.set(d, st); run += 1; }
      if (real) { out.last = d; out.st = st; out.run = run; }
    }
    return out;
  }
  // Cycle en cours au dernier jour pointé : statut, jour de la série, jours restants, date et statut du changement.
  function cycleOf(tl, params) {
    var last = null;
    tl.forEach(function (v, d) { if (!last || d > last) last = d; });
    if (!last) return null;
    var s = simulate(tl, params, last);
    if (!s.st) return null;
    var total = s.st === 'T' ? Number(params.jours_travail) : Number(params.jours_repos);
    var remaining = Math.max(0, total - s.run);
    return { last: last, status: s.st, run: s.run, total: total, remaining: remaining, next: Dates.addDays(last, remaining + 1), nextStatus: other(s.st) };
  }
  // Prévisions : Map date -> 'T'|'R' pour les jours non pointés, jusqu'à toDate.
  function forecastOf(tl, params, toDate) { return simulate(tl, params, toDate).forecast; }

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
