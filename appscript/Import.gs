/**
 * Import d'un pointage depuis un classeur Excel / CSV (un onglet par mois : nom « AAAA-MM » ou titre « Mois de : Mai 2025 »).
 * 1) analyser : lit les onglets, regroupe les noms écrits différemment, propose un agent de l'application pour chaque personne ;
 * 2) appliquer : crée les agents choisis « à créer », écrit les pointages (compléter ou remplacer) et recalcule les cumuls.
 */
var PointageImport = (function () {
  var MOIS = [['jan', 1], ['fev', 2], ['mar', 3], ['avr', 4], ['mai', 5], ['juil', 7], ['juin', 6], ['jui', 6], ['aou', 8], ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12]];
  var IGNORE = /cumul|global|lisez|demarrage|synth|recap|total/;
  function norm(s) { return Format.norm(s); }
  function monthNum(word) { var w = norm(word); for (var i = 0; i < MOIS.length; i += 1) if (w.indexOf(MOIS[i][0]) === 0) return MOIS[i][1]; return 0; }
  function key(y, m) { return y + '-' + (m < 10 ? '0' : '') + m; }

  // Mois d'un onglet : titre « Mois de : … » dans les premières lignes, sinon nom de l'onglet.
  function monthOf(name, rows) {
    var m;
    for (var i = 0; i < Math.min(rows.length, 12); i += 1) {
      for (var j = 0; j < rows[i].length; j += 1) {
        m = /mois\s*de\s*:?\s*([a-zA-Zéèêûôîàù]+)\s*(\d{4})/i.exec(String(rows[i][j] || ''));
        if (m && monthNum(m[1])) return key(Number(m[2]), monthNum(m[1]));
      }
    }
    m = /^(\d{4})-(\d{2})$/.exec(String(name).trim());
    if (m) return key(Number(m[1]), Number(m[2]));
    m = /^([a-zA-Zéèêûôîàù]+)\s*[-_ ]?\s*(\d{2}|\d{4})$/.exec(String(name).trim());
    if (m && monthNum(m[1])) return key(m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]), monthNum(m[1]));
    return '';
  }
  function status(v) {
    var s = String(v == null ? '' : v).trim().toUpperCase();
    if (s === 'T') return 'T';
    if (s === 'R' || s === 'CR') return 'R';
    if (s === 'ABS' || s === 'AB' || s === 'A') return 'ABS';
    return '';
  }
  // Un onglet -> { key, lignes: [{ nom, fonction, jours[31] }] } ou null
  function parseSheet(name, rows) {
    var h = -1; var i;
    for (i = 0; i < rows.length; i += 1) if (norm(rows[i][0]) === 'nom et prenom') { h = i; break; }
    if (h < 0) return null;
    var k = monthOf(name, rows);
    if (!k) return null;
    var p = Dates.parseKey(k); var nd = Dates.daysInMonth(p.y, p.m);
    var c0 = 2; var hdr = rows[h];
    for (i = 0; i < hdr.length; i += 1) if (String(hdr[i]).trim() === '1') { c0 = i; break; }
    var lignes = [];
    for (i = h + 1; i < rows.length; i += 1) {
      var nom = String(rows[i][0] || '').replace(/\s+/g, ' ').trim();
      if (!nom) continue;
      if (/^(p\/|le prestataire)/i.test(nom)) break;
      if (norm(nom) === 'personnel' || /^\d+([.,]\d+)?$/.test(nom)) continue;
      var jours = [];
      for (var d = 0; d < 31; d += 1) jours.push(d < nd ? status(rows[i][c0 + d]) : '');
      lignes.push({ nom: nom, fonction: String(rows[i][1] || '').trim(), jours: jours });
    }
    return { key: k, lignes: lignes };
  }

  // ----- rapprochement des noms -----
  function lev(a, b) {
    var prev = []; var j; var i;
    for (j = 0; j <= b.length; j += 1) prev[j] = j;
    for (i = 1; i <= a.length; i += 1) {
      var cur = [i];
      for (j = 1; j <= b.length; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function ratio(a, b) { var m = Math.max(a.length, b.length); return m ? 1 - lev(a, b) / m : 1; }
  // Variantes d'écriture usuelles des noms arabes translittérés : ou/u, y/i.
  function phon(s) { return s.replace(/ou/g, 'u').replace(/y/g, 'i'); }
  function tokens(s) { return phon(norm(s).replace(/[^a-z0-9 ]/g, ' ')).split(' ').filter(Boolean); }
  // Ressemblance de deux noms (0..1) : mêmes mots dans un autre ordre, fautes de frappe, ou nom incomplet (un mot en moins).
  function similarity(a, b) {
    var ta = tokens(a); var tb = tokens(b);
    if (!ta.length || !tb.length) return 0;
    // mêmes mots dans un autre ordre, ou mots coupés autrement (« TADJ EDDINE » / « TADJEDDINE »)
    var best = Math.max(ratio(ta.slice().sort().join(' '), tb.slice().sort().join(' ')), ratio(ta.join(''), tb.join('')));
    var shorter = ta.length <= tb.length ? ta : tb; var longer = ta.length <= tb.length ? tb : ta;
    if (shorter.length < longer.length && shorter.some(function (t) { return t.length >= 5; })) {
      var used = {};
      var all = shorter.every(function (t) {
        for (var i = 0; i < longer.length; i += 1) if (!used[i] && ratio(t, longer[i]) >= 0.85) { used[i] = true; return true; }
        return false;
      });
      if (all) best = Math.max(best, 0.9);
    }
    return best;
  }

  // Regroupe les écritures d'une même personne (« AZEGGAGH LOCIF » / « WALID TEBBAL ») : une personne = un groupe.
  function groupNames(counts) {
    var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || b.length - a.length; });
    var groups = [];
    names.forEach(function (n) {
      var g = groups.filter(function (x) { return similarity(x.nom, n) >= 0.85; })[0];
      if (g) g.variantes.push(n); else groups.push({ nom: n, variantes: [n] });
    });
    return groups;
  }

  function readSheets(o) {
    var name = String(o.nom || 'pointage'); var ext = ((/\.([a-z0-9]+)$/i.exec(name) || [])[1] || '').toLowerCase();
    var bytes = Utilities.base64Decode(o.base64 || '');
    if (!bytes.length) throw httpErr_('Fichier vide');
    if (bytes.length > CFG.MAX_UPLOAD_BYTES) throw httpErr_('Fichier trop volumineux (6 Mo maximum)');
    if (ext === 'csv') {
      var text = Utilities.newBlob(bytes).getDataAsString('UTF-8');
      var sep = text.indexOf(';') >= 0 ? ';' : text.indexOf('\t') >= 0 ? '\t' : ',';
      return [{ name: String(o.mois || name.replace(/\.csv$/i, '')), rows: text.split(/\r?\n/).map(function (l) { return l.split(sep); }) }];
    }
    if (ext !== 'xlsx' && ext !== 'xls') throw httpErr_('Format non pris en charge (Excel .xlsx ou CSV)');
    var sid = Bordereau.driveConvert(bytes, o.mime || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name, 'application/vnd.google-apps.spreadsheet');
    try {
      return SpreadsheetApp.openById(sid).getSheets().filter(function (s) { return s.getLastRow() > 0; }).map(function (s) {
        return { name: s.getName(), rows: s.getDataRange().getValues().map(function (r) { return r.map(function (c) { return c instanceof Date ? '' : String(c); }); }) };
      });
    } finally { Bordereau.trash(sid); }
  }

  function analyser(o) {
    var sheets = readSheets(o); var warnings = []; var byKey = {};
    var arch = Archive.parse(sheets); // onglets de données (contrat, fonctions, agents…) d'un export de pointage
    sheets.forEach(function (s) {
      if (IGNORE.test(norm(s.name)) || /^(contrat|fonctions|agents|attachements|attachementsvalides|params)$/.test(norm(s.name).replace(/[^a-z]/g, ''))) return;
      var r = parseSheet(s.name, s.rows);
      if (!r) { if (s.rows.length > 5) warnings.push('Onglet « ' + s.name + ' » ignoré : mois ou tableau « Nom Et Prenom » non reconnu.'); return; }
      var n = r.lignes.reduce(function (t, l) { return t + l.jours.filter(Boolean).length; }, 0);
      if (byKey[r.key]) { warnings.push('Mois ' + r.key + ' présent dans deux onglets (« ' + byKey[r.key].onglet + ' » et « ' + s.name + ' ») : celui qui a le plus de jours pointés est retenu.'); if (byKey[r.key].n >= n) return; }
      byKey[r.key] = { key: r.key, onglet: s.name, lignes: r.lignes, n: n };
    });
    var keys = Object.keys(byKey).sort();
    if (!keys.length && !arch) throw httpErr_("Aucun mois reconnu : un onglet par mois, avec « Nom Et Prenom » en A et « Mois de : Mai 2025 » (ou un onglet nommé 2025-05).");
    var counts = {};
    keys.forEach(function (k) { byKey[k].lignes.forEach(function (l) { counts[l.nom] = (counts[l.nom] || 0) + 1; }); });
    var groups = groupNames(counts); var cleOf = {};
    groups.forEach(function (g, i) { g.cle = 'p' + i; g.variantes.forEach(function (v) { cleOf[v] = g.cle; }); g.mois = 0; g.jours = 0; g.fonction = ''; g.debut = ''; g.fin = ''; });
    var agents = Agents.list().filter(function (a) { return Agents.isPerson(a) && a.type !== 'vehicule'; });
    var mois = keys.map(function (k) {
      var lignes = byKey[k].lignes.map(function (l) {
        var g = groups.filter(function (x) { return x.cle === cleOf[l.nom]; })[0];
        var n = l.jours.filter(Boolean).length;
        if (n) { g.mois += 1; g.jours += n; if (l.fonction) g.fonction = l.fonction; if (!g.debut) g.debut = k; g.fin = k; }
        return { cle: g.cle, nom: l.nom, fonction: l.fonction, jours: l.jours };
      });
      return { key: k, label: Dates.monthLabel(k), onglet: byKey[k].onglet, lignes: lignes };
    });
    var personnes = groups.map(function (g) {
      var best = null;
      agents.forEach(function (a) { var sc = similarity(g.nom, a.nom); if (!best || sc > best.score) best = { id: a.id, nom: a.nom, score: sc }; });
      var inf = Archive.agentInfo(arch, g.nom);
      var u = { cle: g.cle, nom: g.nom, variantes: g.variantes.filter(function (v) { return v !== g.nom; }), fonction: g.fonction || (inf ? inf.fonction : ''), info: inf ? { contrat: inf.contrat, rotation: inf.rotation, affectation: inf.affectation, type: inf.type } : null, mois: g.mois, jours: g.jours, debut: g.debut, fin: g.fin, suggestion: best && best.score >= 0.7 ? best : null };
      return u;
    });
    return { fichier: String(o.nom || ''), mois: mois, personnes: personnes, jours: personnes.reduce(function (t, p) { return t + p.jours; }, 0), avertissements: warnings, premier: keys[0] || '', dernier: keys[keys.length - 1] || '', archive: arch };
  }

  function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'agent'; }
  // choix : { cle: id d'agent | '__new' | '' (ignorer) } ; opts : { mode: 'completer' | 'remplacer', debut, fin }
  function appliquer(user, o) {
    o = o || {};
    var mois = o.mois || []; var choix = o.choix || {};
    if (!mois.length && !(o.archive && o.archive.resume)) throw httpErr_('Rien à importer');
    var mode = o.mode === 'remplacer' ? 'remplacer' : 'completer';
    var debut = Dates.isMonthKey(o.debut) ? o.debut : ''; var fin = Dates.isMonthKey(o.fin) ? o.fin : '';
    var dep = Archive.apply(o.archive, o.reprendre); // contrat, prix, quantités, attachements validés, paramètres : avant les agents (fonctions du contrat)
    var all = Agents.list(); var ids = {}; var crees = []; var infos = {}; var identifiants = []; var avert = [];
    mois.forEach(function (m) { m.lignes.forEach(function (l) { if (!infos[l.cle]) infos[l.cle] = { nom: l.nom, fonction: l.fonction }; if (l.fonction) infos[l.cle].fonction = l.fonction; }); });
    var n = 0;
    Object.keys(choix).forEach(function (cle) {
      var v = choix[cle];
      if (!v || !infos[cle]) return;
      if (v === '__new') {
        var nom = infos[cle].nom; var s = slug(nom); var email = 'import.' + s + '@a-completer.invalid'; var k2 = 1;
        while (all.some(function (a) { return a.email.toLowerCase() === email; })) { k2 += 1; email = 'import.' + s + k2 + '@a-completer.invalid'; }
        var inf = Archive.agentInfo(o.archive, nom) || {};
        var vh = inf.type === 'vehicule';
        var mail = inf.email && /^\S+@\S+\.\S+$/.test(inf.email) && !all.some(function (a) { return a.email.toLowerCase() === inf.email.toLowerCase(); }) ? inf.email : email;
        var rot = ''; try { rot = Agents.normRotation(inf.rotation); } catch (e) { rot = ''; }
        var base = { nom: nom, email: mail, fonction: inf.fonction || infos[cle].fonction, role: 'agent', type: vh ? 'vehicule' : 'personne', affectation: inf.affectation || '', rotation: rot, date_entree: inf.date_entree || '' };
        var r;
        var contratOk = inf.contrat && Contrats.contrats().some(function (c) { return c.numero === inf.contrat; });
        try { r = Agents.create(user, Object.assign({}, base, contratOk ? { contrat: inf.contrat } : {})); }
        catch (e) { if (!contratOk) throw e; avert.push(nom + ' : créé sans contrat (' + e.message + ')'); r = Agents.create(user, base); }
        all.push(r.agent); ids[cle] = r.agent.id; crees.push(r.agent.nom); n += 1;
        if (!vh) identifiants.push({ nom: r.agent.nom, email: r.agent.email, password: r.password });
      } else if (all.some(function (a) { return a.id === v && Agents.isPerson(a); })) ids[cle] = v;
      else throw httpErr_('Agent introuvable pour ' + infos[cle].nom);
    });
    var data = Pointage.loadAllMonths();
    var res = Pointage.importEntries(data, mois.filter(function (m) { return (!debut || m.key >= debut) && (!fin || m.key <= fin); }).map(function (m) {
      return { key: m.key, lignes: m.lignes.filter(function (l) { return ids[l.cle]; }).map(function (l) { return { id: ids[l.cle], jours: l.jours }; }) };
    }), mode);
    return { jours_ecrits: res.ecrits, jours_conserves: res.conserves, mois: res.mois, agents_crees: crees, agents_lies: Object.keys(ids).length - crees.length, dependances: dep, identifiants: identifiants, avertissements: avert };
  }
  return { analyser: analyser, appliquer: appliquer, parseSheet: parseSheet, similarity: similarity, groupNames: groupNames, monthOf: monthOf };
})();
