/** Données des documents exportés : fiche de pointage, attachement, facture. */
var DocData = (function () {
  function findContrat(numero) {
    var list = Contrats.contrats();
    var c = numero ? list.filter(function (x) { return x.numero === numero; })[0] : list[0];
    if (!c) throw httpErr_(numero ? 'Contrat introuvable : ' + numero : 'Aucun contrat configuré (Setup → Contrats)');
    return c;
  }
  function ficheData(key, numero, opts) {
    opts = opts || {};
    if (!Dates.isMonthKey(key)) throw httpErr_('Mois invalide (AAAA-MM)');
    var params = Params.get();
    var list = (opts.agents || Agents.list()).filter(function (a) { return a.actif === '1' && a.role !== 'admin'; });
    var contrat = numero ? findContrat(numero) : null;
    if (contrat) list = list.filter(function (a) { return a.contrat === contrat.numero; });
    var g = Pointage.grid(key, list, !!opts.prevu);
    var prest = params.prestataire_nom || 'Prestataire';
    var client = contrat && contrat.client ? contrat.client.split(/\s+/)[0].toUpperCase() : '';
    var titre = contrat ? (client ? client + '/' : '') + prest + ' N°' + contrat.numero : prest;
    return { key: key, label: g.label, nd: g.nd, rows: g.rows, prevu: !!opts.prevu, titre: titre, params: params, contrat: contrat };
  }
  // Quantité d'un mois = positions × jours du mois, sauf quantité saisie à la main.
  function attachementData(key, numero) {
    if (!Dates.isMonthKey(key)) throw httpErr_('Mois invalide (AAAA-MM)');
    var contrat = findContrat(numero);
    var funcs = Contrats.fonctions().filter(function (f) { return f.contrat === contrat.numero; });
    var overrides = Store.readTable('Attachements');
    var params = Params.get();
    var ref = contrat.ref_mois || key;
    var refN = Number(contrat.ref_attachement || 1);
    function override(f, k) { return overrides.filter(function (x) { return x.contrat === contrat.numero && x.mois === k && x.designation === f.designation; })[0]; }
    function qty(f, k) {
      var o = override(f, k);
      if (o) return Number(o.qte_mois);
      var p = Dates.parseKey(k);
      return Number(f.positions) * Dates.daysInMonth(p.y, p.m);
    }
    var d = Dates.monthDiff(ref, key);
    var agents = Agents.list().filter(function (a) { return a.actif === '1' && a.role !== 'admin' && a.contrat === contrat.numero; });
    var g = Pointage.grid(key, agents, false);
    var lines = funcs.map(function (f, i) {
      var prev = Number(f.qte_precedente_ref || 0);
      var i2;
      if (d > 0) for (i2 = 0; i2 < d; i2 += 1) prev += qty(f, Dates.addMonths(ref, i2));
      if (d < 0) for (i2 = d; i2 < 0; i2 += 1) prev -= qty(f, Dates.addMonths(ref, i2));
      var mois = qty(f, key);
      var names = [Format.norm(f.designation), Format.norm(f.libelle)];
      var pointes = g.rows.filter(function (r) { return names.indexOf(Format.norm(r.fonction)) >= 0; }).reduce(function (s, r) { return s + r.mois.T; }, 0);
      return { n: i + 1, designation: f.designation, positions: Number(f.positions), unite: 'Jour', delai: Number(f.delai), contrat: Number(f.positions) * Number(f.delai), precedente: prev, mois: mois, cumulee: prev + mois, prix_unitaire: Number(f.prix_unitaire), montant: mois * Number(f.prix_unitaire), pointes: pointes, auto: !override(f, key) };
    });
    return { key: key, numero: refN + d, contrat: contrat, params: params, lines: lines, debut: key + '-01', fin: Dates.monthEnd(key), totalHT: lines.reduce(function (s, l) { return s + l.montant; }, 0) };
  }
  function factureData(key, numero, opts) {
    opts = opts || {};
    var att = attachementData(key, numero);
    var lines = att.lines.filter(function (l) { return l.mois > 0; });
    att.lines = lines;
    att.facture_numero = opts.facture_numero || '';
    att.date = opts.date || att.fin;
    att.attachement_date = att.fin;
    att.totalHT = lines.reduce(function (s, l) { return s + l.montant; }, 0);
    return att;
  }
  return { ficheData: ficheData, attachementData: attachementData, factureData: factureData };
})();
