/** Pointage : un onglet "AAAA-MM" par mois (format fiche), plus un onglet "Global" de comptage. */
var Pointage = (function () {
  var M = CFG.MONTH;
  function colName(i) { var s = ''; for (var n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; }
  function cell(v) { var s = String(v == null ? '' : v).trim().toUpperCase(); return s === 'CR' ? 'R' : CFG.STATUTS.indexOf(s) >= 0 ? s : ''; }

  function parseMonthTab(rows, agents) {
    var h = -1;
    for (var i = 0; i < rows.length; i += 1) if (Format.norm(rows[i][0]) === 'nom et prenom') { h = i; break; }
    if (h < 0) h = M.HEADER_ROW;
    var byName = {}; var byId = {};
    agents.forEach(function (a) { byName[Format.norm(a.nom)] = a.id; byId[a.id] = true; });
    var entries = {};
    rows.slice(h + 1).forEach(function (r) {
      var id = byId[String(r[M.C_ID] || '')] ? r[M.C_ID] : byName[Format.norm(r[0])];
      if (!id) return;
      var days = [];
      for (var d = 0; d < 31; d += 1) days.push(cell(r[M.C_DAY0 + d]));
      entries[id] = days;
    });
    return entries;
  }
  function loadAllMonths() {
    var agents = Agents.list();
    var months = {};
    Store.listTabs().filter(Dates.isMonthKey).sort().forEach(function (t) { months[t] = parseMonthTab(Store.getRows(t), agents); });
    return { months: months, agents: agents };
  }

  function monthRows(key, entries, agents, months, params) {
    var p = Dates.parseKey(key);
    var nd = Dates.daysInMonth(p.y, p.m);
    var header = ['Nom Et Prenom', 'Fonction'];
    for (var i = 1; i <= 31; i += 1) header.push(i);
    header = header.concat(['OBS', 'T', 'CR', 'ABS', 'TOT T', 'TOT CR', 'Reliquat', 'ID']);
    var rows = [[], ['', '', '', '', '', '', '', 'FICHE DE POINTAGE'], ['Mois de : ' + Dates.monthLabel(key)], ['Rotation : ' + params.jours_travail + ' T / ' + params.jours_repos + ' R'], header];
    var list = agents.filter(function (a) { return a.role !== 'admin' && (a.actif === '1' || (entries[a.id] || []).some(Boolean)); });
    list.forEach(function (a, idx) {
      var days = (entries[a.id] || []).slice();
      while (days.length < 31) days.push('');
      var r = M.HEADER_ROW + 2 + idx;
      var rng = colName(M.C_DAY0) + r + ':' + colName(M.C_DAY0 + 30) + r;
      var tot = Cycle.totalsOf(months, a.id, key);
      var row = [];
      for (var c = 0; c < M.WIDTH; c += 1) row.push('');
      row[0] = a.nom; row[1] = a.fonction;
      days.forEach(function (s, d) { row[M.C_DAY0 + d] = d < nd ? s : ''; });
      row[34] = '=COUNTIF(' + rng + ',"T")'; row[35] = '=COUNTIF(' + rng + ',"R")'; row[36] = '=COUNTIF(' + rng + ',"ABS")';
      row[37] = tot.T; row[38] = tot.R; row[39] = tot.T - tot.R; row[M.C_ID] = a.id;
      rows.push(row);
    });
    return { rows: rows, count: list.length };
  }
  function decorate(sheet, params, count) {
    try {
      var first = M.HEADER_ROW + 2;
      var area = sheet.getRange(first, M.C_DAY0 + 1, Math.max(count, 1), 31);
      var mk = function (v, color) { return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(v).setBackground(color).setRanges([area]).build(); };
      sheet.setConditionalFormatRules([mk('T', params.couleur_T), mk('R', params.couleur_R), mk('ABS', params.couleur_ABS)]);
      sheet.getRange(M.HEADER_ROW + 1, 1, 1, M.WIDTH).setFontWeight('bold').setBackground('#e8edf3');
      sheet.getRange(2, 8).setFontWeight('bold').setFontSize(16);
      sheet.setFrozenRows(M.HEADER_ROW + 1); sheet.setFrozenColumns(2);
      sheet.setColumnWidths(M.C_DAY0 + 1, 31, 28);
      sheet.hideColumns(M.C_ID + 1);
    } catch (e) { Logger.log('Mise en forme non appliquée : ' + e.message); }
  }
  function writeMonths(months, agents, keys, params) {
    keys.forEach(function (key) {
      var built = monthRows(key, months[key], agents, months, params);
      var sheet = Store.setRows(key, built.rows);
      decorate(sheet, params, built.count);
    });
  }
  function writeGlobal(months, agents, params) {
    var rows = [['Nom', 'Fonction', 'Contrat', 'TOT T', 'TOT CR', 'TOT ABS', 'Reliquat', 'Statut actuel', 'Jours restants', 'Prochain changement', 'Mis à jour']];
    var now = Dates.today();
    agents.filter(function (x) { return x.role !== 'admin' && x.actif === '1'; }).forEach(function (a) {
      var t = Cycle.totalsOf(months, a.id);
      var info = Cycle.dayInfo(Cycle.timelineOf(months, a.id), params, now);
      rows.push([a.nom, a.fonction, a.contrat, t.T, t.R, t.ABS, t.reliquat, info ? info.status : '', info ? info.remaining : '', info && info.change ? Dates.frDate(info.change) : '', now]);
    });
    var sheet = Store.setRows('Global', rows, { text: true });
    try { sheet.setFrozenRows(1); sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold').setBackground('#e8edf3'); } catch (e) { /* ignore */ }
  }
  function emptyMonth(agents) {
    var o = {};
    agents.filter(function (a) { return a.role !== 'admin'; }).forEach(function (a) { o[a.id] = Array(31).fill(''); });
    return o;
  }

  // Pointe un agent sur une période [from, to] (statut '' = effacer).
  function setStatus(agentId, from, to, statut) {
    var end = to || from;
    if (!Dates.isDate(from) || !Dates.isDate(end) || end < from) throw httpErr_('Dates invalides');
    if (statut !== '' && CFG.STATUTS.indexOf(statut) < 0) throw httpErr_('Statut invalide (T, R ou ABS)');
    var span = Dates.diffDays(from, end);
    if (span > 92) throw httpErr_('Période trop longue (92 jours maximum)');
    var data = loadAllMonths(); var months = data.months; var agents = data.agents;
    if (!agents.some(function (a) { return a.id === agentId && a.role !== 'admin'; })) throw httpErr_('Agent introuvable');
    var touched = {};
    for (var d = from; d <= end; d = Dates.addDays(d, 1)) {
      var key = d.slice(0, 7);
      if (!months[key]) months[key] = emptyMonth(agents);
      if (!months[key][agentId]) months[key][agentId] = Array(31).fill('');
      months[key][agentId][Number(d.slice(8, 10)) - 1] = statut;
      touched[key] = true;
    }
    var params = Params.get();
    var firstKey = Object.keys(touched).sort()[0];
    // Les cumuls (TOT T / TOT CR / Reliquat) des mois suivants changent aussi.
    writeMonths(months, agents, Object.keys(months).sort().filter(function (k) { return k >= firstKey; }), params);
    writeGlobal(months, agents, params);
    return { jours: span + 1 };
  }

  function grid(key, visibleAgents, prevu) {
    if (!Dates.isMonthKey(key)) throw httpErr_('Mois invalide (AAAA-MM)');
    var withForecast = prevu !== false;
    var data = loadAllMonths(); var months = data.months; var params = Params.get();
    var p = Dates.parseKey(key); var nd = Dates.daysInMonth(p.y, p.m);
    var end = key + '-' + (nd < 10 ? '0' : '') + nd;
    var rows = visibleAgents.map(function (a) {
      var tl = Cycle.timelineOf(months, a.id);
      var fc = withForecast ? Cycle.forecastOf(tl, params, end) : new Map();
      var days = [];
      for (var i = 0; i < nd; i += 1) {
        var d = key + '-' + (i < 9 ? '0' : '') + (i + 1);
        days.push({ statut: tl.get(d) || '', prevu: tl.has(d) ? '' : fc.get(d) || '' });
      }
      var one = {}; one[key] = months[key] || {};
      return { id: a.id, nom: a.nom, fonction: a.fonction, affectation: a.affectation, contrat: a.contrat, chef_id: a.chef_id, days: days, mois: Cycle.totalsOf(one, a.id), cumul: Cycle.totalsOf(months, a.id, key) };
    });
    return { month: key, label: Dates.monthLabel(key), nd: nd, rows: rows };
  }

  // Page d'accueil de l'agent : totaux, cycle et situation du jour (travail / congé, jours restants).
  function overview(agent) {
    var data = loadAllMonths(); var months = data.months; var params = Params.get();
    var tl = Cycle.timelineOf(months, agent.id);
    var key = Dates.today().slice(0, 7);
    var one = {}; one[key] = months[key] || {};
    return { cumul: Cycle.totalsOf(months, agent.id), mois: Cycle.totalsOf(one, agent.id), month: key, cycle: Cycle.cycleOf(tl, params), aujourdhui: Cycle.dayInfo(tl, params, Dates.today()), today: Dates.today() };
  }
  return { setStatus: setStatus, grid: grid, overview: overview, loadAllMonths: loadAllMonths, writeGlobal: writeGlobal, parseMonthTab: parseMonthTab };
})();
