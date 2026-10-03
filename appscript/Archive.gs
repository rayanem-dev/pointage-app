/**
 * Export / import d'un pointage avec ses dépendances (Excel) : contrat, fonctions et prix, agents, quantités saisies, attachements validés
 * et factures, paramètres, puis un onglet « AAAA-MM » par mois de pointage. Les mots de passe ne sont jamais exportés.
 * Le même classeur est relu par « Importer un pointage » (onglets de pointage + onglets de données).
 */
var Archive = (function () {
  var AGENT_COLS = ['nom', 'fonction', 'affectation', 'contrat', 'email', 'role', 'type', 'rotation', 'actif', 'date_entree', 'chef'];
  function key(name) { return Format.norm(name).replace(/[^a-z]/g, ''); }
  var TABLE_SHEETS = { contrat: 'Contrat', fonctions: 'Fonctions', agents: 'Agents', attachements: 'Attachements', attachementsvalides: 'AttachementsValides', params: 'Params' };

  // Modèle de données de l'export. o : { contrat ('' = tous les agents, sans contrat), debut, fin (AAAA-MM), dependances (false pour le pointage seul) }
  function model(o) {
    o = o || {};
    var data = Pointage.loadAllMonths(); var months = data.months; var agents = data.agents;
    var contrat = null;
    if (o.contrat) { contrat = Contrats.contrats().filter(function (c) { return c.numero === o.contrat; })[0]; if (!contrat) throw httpErr_('Contrat introuvable : ' + o.contrat); }
    var staff = agents.filter(function (a) { return Agents.isPerson(a) && (!o.contrat || a.contrat === o.contrat); });
    if (!staff.length) throw httpErr_(o.contrat ? 'Aucun agent n\'est rattaché à ce contrat' : 'Aucun agent');
    var byId = {}; agents.forEach(function (a) { byId[a.id] = a; });
    var debut = Dates.isMonthKey(o.debut) ? o.debut : ''; var fin = Dates.isMonthKey(o.fin) ? o.fin : '';
    var mois = Object.keys(months).sort().filter(function (k) { return (!debut || k >= debut) && (!fin || k <= fin); }).map(function (k) {
      var nd = Dates.daysInMonth(Dates.parseKey(k).y, Dates.parseKey(k).m);
      var lignes = staff.map(function (a) { var j = (months[k][a.id] || []).slice(0, nd); while (j.length < 31) j.push(''); return { nom: a.nom, fonction: a.fonction, jours: j }; })
        .filter(function (l) { return l.jours.some(Boolean); });
      return { key: k, lignes: lignes };
    }).filter(function (m) { return m.lignes.length; });
    var dep = o.dependances !== false;
    var m = {
      meta: { version: CFG.VERSION, date: new Date().toISOString().slice(0, 16).replace('T', ' '), contrat: o.contrat || '', debut: debut, fin: fin, dependances: dep },
      agents: staff.map(function (a) { return { nom: a.nom, fonction: a.fonction, affectation: a.affectation, contrat: a.contrat, email: a.type === 'vehicule' ? '' : a.email, role: a.role, type: a.type === 'vehicule' ? 'vehicule' : 'personne', rotation: a.rotation || '', actif: a.actif, date_entree: a.date_entree, chef: (byId[a.chef_id] || {}).nom || '' }; }),
      mois: mois, contrats: [], fonctions: [], attachements: [], valides: [], params: {}
    };
    if (dep) {
      var nums = contrat ? [contrat.numero] : Contrats.contrats().map(function (c) { return c.numero; });
      m.contrats = Contrats.contrats().filter(function (c) { return nums.indexOf(c.numero) >= 0; });
      m.fonctions = Contrats.fonctions().filter(function (f) { return nums.indexOf(f.contrat) >= 0; });
      m.attachements = Store.readTable('Attachements').filter(function (x) { return nums.indexOf(x.contrat) >= 0; });
      m.valides = Store.readTable('AttachementsValides').filter(function (x) { return nums.indexOf(x.contrat) >= 0; });
      var p = Params.get(); Params.DEFS.forEach(function (d) { m.params[d.key] = p[d.key]; });
    }
    return m;
  }

  function table(cols, objs) { return [cols].concat(objs.map(function (o) { return cols.map(function (c) { return o[c] == null ? '' : String(o[c]); }); })); }
  function pointageSheet(mm, contrat) {
    var p = Dates.parseKey(mm.key); var nd = Dates.daysInMonth(p.y, p.m);
    var rows = [[], ['', '', '', '', '', '', '', 'FICHE DE POINTAGE'], ['Mois de : ' + Dates.monthLabel(mm.key)], [contrat ? 'Contrat : ' + contrat : ''],
      ['Nom Et Prenom', 'Fonction'].concat(Array.from({ length: 31 }, function (_, i) { return i + 1; }), ['T', 'CR', 'ABS'])];
    mm.lignes.forEach(function (l) {
      var j = l.jours.slice(0, nd); while (j.length < 31) j.push('');
      rows.push([l.nom, l.fonction].concat(j, ['T', 'R', 'ABS'].map(function (s) { return j.filter(function (x) { return x === s; }).length; })));
    });
    return rows;
  }
  // Onglets du classeur : [{ name, rows, text (valeurs en texte), header }]
  function toSheets(m) {
    var sheets = [{ name: 'Lisez-moi', rows: [['Export de pointage — ' + (CFG.COPYRIGHT || '')], [''],
      ['Contrat : ' + (m.meta.contrat || '(tous les agents, sans contrat)') + ' · période : ' + (m.meta.debut || 'début') + ' → ' + (m.meta.fin || 'fin') + ' · exporté le ' + m.meta.date + ' · version ' + m.meta.version],
      [m.meta.dependances ? 'Contient : contrat, fonctions et prix, agents, quantités saisies, attachements validés et factures, paramètres, pointages.' : 'Contient : agents et pointages.'],
      ['Se réimporte par Setup → Maintenance → Importer un pointage. Les mots de passe ne sont pas exportés.']] }];
    if (m.meta.dependances) {
      sheets.push({ name: 'Contrat', rows: table(CFG.TABLES.Contrats, m.contrats), text: true, header: true });
      sheets.push({ name: 'Fonctions', rows: table(CFG.TABLES.Fonctions, m.fonctions), text: true, header: true });
    }
    sheets.push({ name: 'Agents', rows: table(AGENT_COLS, m.agents), text: true, header: true });
    if (m.meta.dependances) {
      sheets.push({ name: 'Attachements', rows: table(CFG.TABLES.Attachements, m.attachements), text: true, header: true });
      sheets.push({ name: 'AttachementsValides', rows: table(CFG.TABLES.AttachementsValides, m.valides), text: true, header: true });
      sheets.push({ name: 'Params', rows: [['cle', 'valeur']].concat(Object.keys(m.params).map(function (k) { return [k, String(m.params[k] == null ? '' : m.params[k])]; })), text: true, header: true });
    }
    m.mois.forEach(function (mm) { sheets.push({ name: mm.key, rows: pointageSheet(mm, m.meta.contrat), pointage: true }); });
    return sheets;
  }
  function exportXlsx(user, o) {
    var m = model(o);
    var nom = 'Pointage_' + (m.meta.contrat ? m.meta.contrat.replace(/[^\w-]+/g, '_') : 'tous') + '_' + (m.mois.length ? m.mois[0].key + '_a_' + m.mois[m.mois.length - 1].key : 'sans_pointage');
    return Export.renderBook(toSheets(m), nom);
  }

  // ----- lecture (import) -----
  function readTable(rows, cols) {
    if (!rows || !rows.length) return [];
    var head = rows[0].map(function (h) { return String(h).trim(); });
    return rows.slice(1).filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); }).map(function (r) {
      var o = {}; cols.forEach(function (c) { var i = head.indexOf(c); o[c] = i < 0 || r[i] == null ? '' : String(r[i]).trim(); }); return o;
    });
  }
  // sheets : [{ name, rows }] -> données de l'archive, ou null si le classeur n'en contient pas
  function parse(sheets) {
    var by = {}; sheets.forEach(function (s) { var k = key(s.name); if (TABLE_SHEETS[k]) by[k] = s.rows; });
    if (!Object.keys(by).length) return null;
    var params = {}; (by.params || []).slice(1).forEach(function (r) { if (r[0]) params[String(r[0]).trim()] = r[1] == null ? '' : String(r[1]); });
    var a = {
      contrats: readTable(by.contrat, CFG.TABLES.Contrats), fonctions: readTable(by.fonctions, CFG.TABLES.Fonctions), agents: readTable(by.agents, AGENT_COLS),
      attachements: readTable(by.attachements, CFG.TABLES.Attachements), valides: readTable(by.attachementsvalides, CFG.TABLES.AttachementsValides), params: params
    };
    a.resume = { contrats: a.contrats.length, fonctions: a.fonctions.length, agents: a.agents.length, attachements: a.attachements.length, valides: a.valides.length, params: Object.keys(params).length };
    return a;
  }
  function agentInfo(a, nom) {
    if (!a || !nom) return null;
    var n = Format.norm(nom);
    return a.agents.filter(function (x) { return Format.norm(x.nom) === n; })[0] || null;
  }

  // Applique les données de dépendance. reprendre : { contrat, attachements, quantites, params } (booléens).
  function apply(arch, reprendre) {
    var r = reprendre || {}; var out = { contrats: 0, fonctions: 0, quantites: 0, valides: 0, params: 0, ignores: [] };
    if (!arch) return out;
    if (r.contrat && arch.contrats.length) {
      var cs = Contrats.contrats(); var fs = Contrats.fonctions();
      arch.contrats.forEach(function (c) {
        var i = cs.map(function (x) { return x.numero; }).indexOf(c.numero);
        if (i >= 0) cs[i] = c; else cs.push(c);
        out.contrats += 1;
        fs = fs.filter(function (f) { return f.contrat !== c.numero; }).concat(arch.fonctions.filter(function (f) { return f.contrat === c.numero; }));
        out.fonctions += arch.fonctions.filter(function (f) { return f.contrat === c.numero; }).length;
      });
      Contrats.saveContrats(cs); Contrats.saveFonctions(fs);
    }
    if (r.quantites && arch.attachements.length) {
      var at = Store.readTable('Attachements');
      arch.attachements.forEach(function (x) {
        at = at.filter(function (y) { return !(y.contrat === x.contrat && y.mois === x.mois && y.designation === x.designation); }); at.push(x); out.quantites += 1;
      });
      Store.writeTable('Attachements', at);
    }
    if (r.attachements && arch.valides.length) {
      var vs = Store.readTable('AttachementsValides');
      arch.valides.forEach(function (x) {
        var cur = vs.filter(function (y) { return y.contrat === x.contrat && y.mois === x.mois; })[0];
        if (cur && cur.statut === 'facture' && x.statut !== 'facture') { out.ignores.push('Attachement ' + x.contrat + ' ' + x.mois + ' : déjà facturé ici, conservé'); return; }
        vs = vs.filter(function (y) { return !(y.contrat === x.contrat && y.mois === x.mois); }); vs.push(x); out.valides += 1;
      });
      Store.writeTable('AttachementsValides', vs);
    }
    if (r.params && Object.keys(arch.params).length) {
      var set = {}; Params.DEFS.forEach(function (d) { if (arch.params[d.key] !== undefined && arch.params[d.key] !== '') set[d.key] = arch.params[d.key]; });
      Params.set(set); out.params = Object.keys(set).length;
    }
    return out;
  }
  return { model: model, toSheets: toSheets, exportXlsx: exportXlsx, parse: parse, agentInfo: agentInfo, apply: apply };
})();
