/** Pointage : un onglet "AAAA-MM" par mois (format fiche), plus un onglet "Global" de comptage. */
var Pointage = (function () {
  // CFG est lu à l'appel (Apps Script charge les fichiers dans un ordre quelconque)
  var M = { get C_DAY0() { return CFG.MONTH.C_DAY0; }, get C_ID() { return CFG.MONTH.C_ID; }, get HEADER_ROW() { return CFG.MONTH.HEADER_ROW; }, get WIDTH() { return CFG.MONTH.WIDTH; } };
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
    var formulas = [];
    var list = agents.filter(function (a) { return Agents.isPerson(a) && (a.actif === '1' || (entries[a.id] || []).some(Boolean)); });
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
      ['T', 'R', 'ABS'].forEach(function (k, j) { row[34 + j] = days.slice(0, nd).filter(function (x) { return x === k; }).length; });
      formulas.push(['=COUNTIF(' + rng + ',"T")', '=COUNTIF(' + rng + ',"R")', '=COUNTIF(' + rng + ',"ABS")']);
      row[37] = tot.T; row[38] = tot.R; row[39] = tot.T - tot.R; row[M.C_ID] = a.id;
      rows.push(row);
    });
    return { rows: rows, count: list.length, formulas: formulas };
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
      // setFormulas attend la syntaxe anglaise : indépendant de la langue du classeur (setValues casserait en français).
      if (built.formulas.length) { try { sheet.getRange(M.HEADER_ROW + 2, 35, built.formulas.length, 3).setFormulas(built.formulas); } catch (e) { Logger.log('Formules non écrites : ' + e.message); } }
      decorate(sheet, params, built.count);
    });
  }
  function writeGlobal(months, agents, params) {
    var rows = [['Nom', 'Fonction', 'Contrat', 'TOT T', 'TOT CR', 'TOT ABS', 'Reliquat', 'Statut actuel', 'Jours restants', 'Prochain changement', 'Mis à jour']];
    var now = Dates.today();
    agents.filter(function (x) { return Agents.isPerson(x) && x.actif === '1'; }).forEach(function (a) {
      var t = Cycle.totalsOf(months, a.id);
      var info = Cycle.dayInfo(Cycle.timelineOf(months, a.id), Agents.rotationParams(a, params), now);
      rows.push([a.nom, a.fonction, a.contrat, t.T, t.R, t.ABS, t.reliquat, info ? info.status : '', info ? info.remaining : '', info && info.change ? Dates.frDate(info.change) : '', now]);
    });
    var sheet = Store.setRows('Global', rows, { text: true });
    try { sheet.setFrozenRows(1); sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold').setBackground('#e8edf3'); } catch (e) { /* ignore */ }
  }
  function emptyMonth(agents) {
    var o = {};
    agents.filter(function (a) { return Agents.isPerson(a); }).forEach(function (a) { o[a.id] = Array(31).fill(''); });
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
    if (!agents.some(function (a) { return a.id === agentId && Agents.isPerson(a); })) throw httpErr_('Agent introuvable');
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

  // Complète les jours non pointés : pour chaque agent choisi, du lendemain de son dernier pointage (ou d'une date imposée) jusqu'à la date de fin,
  // on recopie son DERNIER statut pointé (ABS compris), ou — sur option — la rotation prévue. Un jour déjà pointé n'est jamais remplacé.
  // o : { tous, agent_ids, from, to, mode : 'meme' | 'rotation', apercu }
  function completer(user, o) {
    o = o || {};
    var today = Dates.today(); var to = o.to || today; var from = o.from || '';
    if (!Dates.isDate(to) || (from && !Dates.isDate(from))) throw httpErr_('Dates invalides');
    if (from && from > to) throw httpErr_('La date de fin précède la date de début');
    var rotation = o.mode === 'rotation';
    var data = loadAllMonths(); var months = data.months; var agents = data.agents; var params = Params.get();
    var chosen = {}; (o.agent_ids || []).forEach(function (id) { chosen[id] = true; });
    var cibles = Agents.visibleTo(user).filter(function (a) { return Agents.isPerson(a) && a.actif === '1' && (o.tous || chosen[a.id]); });
    if (!cibles.length) throw httpErr_('Aucun agent sélectionné');
    var plan = []; var ignores = []; var total = 0;
    cibles.forEach(function (a) {
      var tl = Cycle.timelineOf(months, a.id); var last = '';
      tl.forEach(function (v, d) { if (!last || d > last) last = d; });
      if (!last) { ignores.push({ id: a.id, nom: a.nom, raison: 'aucun pointage' }); return; }
      var start = from || Dates.addDays(last, 1);
      if (start > to) { ignores.push({ id: a.id, nom: a.nom, raison: 'à jour' }); return; }
      if (Dates.diffDays(start, to) > 92) throw httpErr_('Période trop longue (93 jours maximum par agent) : ' + a.nom);
      var fc = rotation ? Cycle.forecastOf(tl, Agents.rotationParams(a, params), to) : null; var dernier = tl.get(last);
      var jours = [];
      for (var d = start; d <= to; d = Dates.addDays(d, 1)) {
        if (tl.has(d)) continue; // jamais de remplacement d'un pointage existant
        var st = rotation ? fc.get(d) : dernier;
        if (st) jours.push({ date: d, statut: st });
      }
      if (!jours.length) { ignores.push({ id: a.id, nom: a.nom, raison: 'à jour' }); return; }
      total += jours.length;
      plan.push({ id: a.id, nom: a.nom, dernier: last, dernier_statut: dernier, du: jours[0].date, au: jours[jours.length - 1].date, jours: jours.length, statut: rotation ? 'rotation' : dernier, _j: jours });
    });
    var resume = plan.map(function (x) { return { id: x.id, nom: x.nom, dernier: x.dernier, dernier_statut: x.dernier_statut, du: x.du, au: x.au, jours: x.jours, statut: x.statut }; });
    if (o.apercu || !plan.length) return { applique: false, agents: resume, ignores: ignores, total: total, to: to };
    var touched = {};
    plan.forEach(function (x) {
      x._j.forEach(function (j) {
        var key = j.date.slice(0, 7);
        if (!months[key]) months[key] = emptyMonth(agents);
        if (!months[key][x.id]) months[key][x.id] = Array(31).fill('');
        months[key][x.id][Number(j.date.slice(8, 10)) - 1] = j.statut; touched[key] = true;
      });
    });
    var firstKey = Object.keys(touched).sort()[0];
    writeMonths(months, agents, Object.keys(months).sort().filter(function (k) { return k >= firstKey; }), params);
    writeGlobal(months, agents, params);
    return { applique: true, agents: resume, ignores: ignores, total: total, to: to };
  }

  // Import de pointages en masse : lignes = [{ key, lignes: [{ id, jours[31] }] }].
  // mode « completer » : ne remplace aucun pointage existant ; « remplacer » : le fichier l'emporte (ses cases vides n'effacent rien).
  function importEntries(data, lignesParMois, mode) {
    var months = data.months; var agents = data.agents; var ecrits = 0; var conserves = 0; var touched = {};
    lignesParMois.forEach(function (m) {
      if (!Dates.isMonthKey(m.key)) return;
      var nd = Dates.daysInMonth(Dates.parseKey(m.key).y, Dates.parseKey(m.key).m);
      m.lignes.forEach(function (l) {
        if (!months[m.key]) months[m.key] = emptyMonth(agents);
        if (!months[m.key][l.id]) months[m.key][l.id] = Array(31).fill('');
        var cur = months[m.key][l.id];
        for (var d = 0; d < nd; d += 1) {
          var v = cell(l.jours[d]);
          if (!v) continue;
          if (cur[d] && (mode !== 'remplacer' || cur[d] === v)) { if (cur[d] !== v) conserves += 1; continue; }
          cur[d] = v; ecrits += 1; touched[m.key] = true;
        }
      });
    });
    var keys = Object.keys(touched).sort();
    if (keys.length) {
      var params = Params.get();
      writeMonths(months, agents, Object.keys(months).sort().filter(function (k) { return k >= keys[0]; }), params); // les cumuls des mois suivants changent aussi
      writeGlobal(months, agents, params);
    }
    return { ecrits: ecrits, conserves: conserves, mois: keys.length };
  }

  function grid(key, visibleAgents, prevu) {
    if (!Dates.isMonthKey(key)) throw httpErr_('Mois invalide (AAAA-MM)');
    var withForecast = prevu !== false;
    var data = loadAllMonths(); var months = data.months; var params = Params.get();
    var p = Dates.parseKey(key); var nd = Dates.daysInMonth(p.y, p.m);
    var end = key + '-' + (nd < 10 ? '0' : '') + nd;
    // Personnes d'abord, puis véhicules ; pas de rotation (donc pas de prévision) pour un véhicule.
    var ordered = visibleAgents.slice().sort(function (a, b) { return (a.type === 'vehicule' ? 1 : 0) - (b.type === 'vehicule' ? 1 : 0); });
    var rows = ordered.map(function (a) {
      var tl = Cycle.timelineOf(months, a.id);
      var ap = Agents.rotationParams(a, params); // rotation propre à l'agent, sinon celle du Setup
      var fc = withForecast && a.type !== 'vehicule' ? Cycle.forecastOf(tl, ap, end) : new Map();
      // Prévision : calculée seule dès le premier pointage T/R (aucune sans pointage ; jamais pour un véhicule).
      var cy = Cycle.cycleOf(tl, ap);
      var prevision = { etat: a.type === 'vehicule' ? 'vehicule' : (cy ? 'ok' : 'aucun'), derniere: cy ? cy.last : '' };
      var days = [];
      for (var i = 0; i < nd; i += 1) {
        var d = key + '-' + (i < 9 ? '0' : '') + (i + 1);
        days.push({ statut: tl.get(d) || '', prevu: tl.has(d) ? '' : fc.get(d) || '' });
      }
      var one = {}; one[key] = months[key] || {};
      return { id: a.id, rotation: a.rotation || '', nom: a.nom, type: a.type === 'vehicule' ? 'vehicule' : 'personne', fonction: a.fonction, affectation: a.affectation, contrat: a.contrat, chef_id: a.chef_id, prevision: prevision, days: days, mois: Cycle.totalsOf(one, a.id), cumul: Cycle.totalsOf(months, a.id, key) };
    });
    return { month: key, label: Dates.monthLabel(key), nd: nd, rows: rows, feries: Holidays.between(key + '-01', end, params.feries_perso), today: Dates.today() };
  }

  // Vue étalée sur 1, 3, 6 ou 12 mois à partir du mois choisi : un caractère par jour et par agent
  // (T, R, A = absence en majuscules : pointé ; t, r en minuscules : prévu ; . : rien), jours fériés, totaux des jours pointés.
  function timeline(startKey, n, visibleAgents, prevu) {
    if (!Dates.isMonthKey(startKey)) throw httpErr_('Mois invalide (AAAA-MM)');
    n = Number(n);
    if ([1, 3, 6, 12].indexOf(n) < 0) throw httpErr_('Période invalide (1, 3, 6 ou 12 mois)');
    var withForecast = prevu !== false;
    var data = loadAllMonths(); var months = data.months; var params = Params.get();
    var keys = []; for (var i = 0; i < n; i += 1) keys.push(Dates.addMonths(startKey, i));
    var spans = keys.map(function (k) { var p = Dates.parseKey(k); return { key: k, label: Dates.monthLabel(k), nd: Dates.daysInMonth(p.y, p.m) }; });
    var last = spans[n - 1]; var from = startKey + '-01'; var to = last.key + '-' + (last.nd < 10 ? '0' : '') + last.nd;
    var dates = []; spans.forEach(function (s) { for (var d = 1; d <= s.nd; d += 1) dates.push(s.key + '-' + (d < 10 ? '0' : '') + d); });
    var ordered = visibleAgents.slice().sort(function (a, b) { return (a.type === 'vehicule' ? 1 : 0) - (b.type === 'vehicule' ? 1 : 0); });
    var rows = ordered.map(function (a) {
      var tl = Cycle.timelineOf(months, a.id);
      var fc = withForecast && a.type !== 'vehicule' ? Cycle.forecastOf(tl, Agents.rotationParams(a, params), to) : new Map();
      var tot = { T: 0, R: 0, ABS: 0 };
      var chars = dates.map(function (d) {
        var real = tl.get(d);
        if (real) { if (tot[real] !== undefined) tot[real] += 1; return real === 'ABS' ? 'A' : real; }
        var f = fc.get(d); return f === 'T' ? 't' : f === 'R' ? 'r' : '.';
      }).join('');
      return { id: a.id, nom: a.nom, type: a.type === 'vehicule' ? 'vehicule' : 'personne', fonction: a.fonction, d: chars, total: tot, cumul: Cycle.totalsOf(months, a.id, last.key) };
    });
    return { from: from, to: to, n: n, months: spans, rows: rows, feries: Holidays.between(from, to, params.feries_perso), today: Dates.today() };
  }

  // Page d'accueil de l'agent : totaux, cycle et situation du jour (travail / congé, jours restants).
  function overview(agent) {
    var data = loadAllMonths(); var months = data.months; var params = Agents.rotationParams(agent, Params.get());
    var tl = Cycle.timelineOf(months, agent.id);
    var key = Dates.today().slice(0, 7);
    var one = {}; one[key] = months[key] || {};
    var info = Cycle.dayInfo(tl, params, Dates.today()); var cumul = Cycle.totalsOf(months, agent.id);
    // Solde (T − CR) prévu le dernier jour avant le changement (départ en congé ou reprise) : jours pointés + jours prévus jusque-là.
    var soldeChange = null;
    if (info && info.change) {
      var endD = Dates.addDays(info.change, -1); var t = 0; var r = 0;
      Cycle.forecastOf(tl, params, endD).forEach(function (v, d) { if (d <= endD) { if (v === 'T') t += 1; else if (v === 'R') r += 1; } });
      soldeChange = cumul.T + t - (cumul.R + r);
    }
    return { cumul: cumul, mois: Cycle.totalsOf(one, agent.id), month: key, cycle: Cycle.cycleOf(tl, params), aujourdhui: info, soldeChange: soldeChange, today: Dates.today() };
  }
  return { completer: completer, importEntries: importEntries, setStatus: setStatus, grid: grid, timeline: timeline, overview: overview, loadAllMonths: loadAllMonths, writeGlobal: writeGlobal, parseMonthTab: parseMonthTab };
})();
