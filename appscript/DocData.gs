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
    var list = (opts.agents || Agents.list()).filter(function (a) { return a.actif === '1' && Agents.isPerson(a); });
    var contrat = numero ? findContrat(numero) : null;
    if (contrat && !opts.tous) list = list.filter(function (a) { return a.contrat === contrat.numero; });
    var g = Pointage.grid(key, list, !!opts.prevu);
    var prest = params.prestataire_nom || 'Prestataire';
    var client = contrat && contrat.client ? contrat.client.split(/\s+/)[0].toUpperCase() : '';
    var titre = contrat ? (client ? client + '/' : '') + prest + ' N°' + contrat.numero : prest;
    return { key: key, label: g.label, nd: g.nd, rows: g.rows, prevu: !!opts.prevu, titre: titre, params: params, contrat: contrat };
  }
  // Aperçu avant export de la fiche : agents retenus / écartés et avertissements.
  function ficheApercu(key, numero, visibles) {
    var params = Params.get();
    var agents = (visibles || Agents.list()).filter(function (a) { return a.actif === '1' && Agents.isPerson(a); });
    var contrat = numero ? findContrat(numero) : null;
    var dans = contrat ? agents.filter(function (a) { return a.contrat === contrat.numero; }) : agents;
    var hors = contrat ? agents.filter(function (a) { return a.contrat !== contrat.numero; }) : [];
    var warn = [];
    if (!params.prestataire_nom) warn.push('Nom du prestataire vide (Setup → Paramètres).');
    if (contrat && !contrat.client) warn.push('Client vide sur le contrat ' + contrat.numero + '.');
    if (contrat && !dans.length) warn.push('Aucun agent rattaché au contrat ' + contrat.numero + (hors.length ? ' (' + hors.length + ' agent(s) ont un autre numéro de contrat — vérifiez I/24 et 1/24).' : '.'));
    else if (hors.length) warn.push(hors.length + ' agent(s) hors contrat ne seront pas dans la fiche : ' + hors.slice(0, 5).map(function (a) { return a.nom; }).join(', ') + '.');
    return { mois: key, dans: dans.length, hors: hors.length, avertissements: warn };
  }
  // Représentant du prestataire : '' = responsable de groupe (par défaut), '-' = aucun (laissé vide), sinon le nom choisi.
  function repPrestataire(contrat) {
    var v = String(contrat.rep_prestataire || '');
    if (v === '-') return '';
    if (v) return v;
    var chefs = Agents.list().filter(function (a) { return a.role === 'chef' && a.actif === '1'; });
    var chef = chefs.filter(function (c) { return c.contrat === contrat.numero; })[0] || chefs[0];
    return chef ? chef.nom : '';
  }
  // Mois de référence : celui du contrat, sinon le premier mois où un agent du contrat a un pointage (jamais après le mois demandé).
  function refMonth(contrat, key) {
    if (contrat.ref_mois) return contrat.ref_mois;
    var all = Pointage.loadAllMonths();
    var ids = all.agents.filter(function (a) { return a.contrat === contrat.numero; }).map(function (a) { return a.id; });
    var first = Object.keys(all.months).sort().filter(function (k) {
      return ids.some(function (id) { return (all.months[k][id] || []).some(Boolean); });
    })[0];
    return first && first <= key ? first : key;
  }
  function validation(numero, key) { return Store.readTable('AttachementsValides').filter(function (v) { return v.contrat === numero && v.mois === key; })[0]; }
  function snapLines(v) { try { return JSON.parse(v.lignes) || []; } catch (e) { return []; } }

  // Attachement calculé à neuf : quantité du mois = positions × jours du mois, sauf quantité saisie à la main ;
  // quantité précédente = cumul de l'attachement validé du mois d'avant s'il existe.
  function computeFresh(key, contrat) {
    var funcs = Contrats.fonctions().filter(function (f) { return f.contrat === contrat.numero; });
    var overrides = Store.readTable('Attachements');
    var params = Params.get();
    var ref = refMonth(contrat, key);
    var refN = Number(contrat.ref_attachement || 1);
    function override(f, k) { return overrides.filter(function (x) { return x.contrat === contrat.numero && x.mois === k && x.designation === f.designation; })[0]; }
    var base = params.attachement_pointage !== '0'; // quantité = jours T pointés (réels), sinon nombre × jours du mois
    var gridMemo = {};
    function pointesOf(f, k) {
      if (!gridMemo[k]) {
        var ag = Agents.list().filter(function (a) { return a.actif === '1' && Agents.isPerson(a) && a.contrat === contrat.numero; });
        gridMemo[k] = Pointage.grid(k, ag, false);
      }
      var names = [Format.norm(f.designation), Format.norm(f.libelle)];
      return gridMemo[k].rows.filter(function (r) { return names.indexOf(Format.norm(r.fonction)) >= 0; }).reduce(function (t, r) { return t + r.mois.T; }, 0);
    }
    function qty(f, k) {
      var o = override(f, k);
      if (o) return Number(o.qte_mois);
      if (base) return pointesOf(f, k);
      var p = Dates.parseKey(k);
      return Number(f.positions) * Dates.daysInMonth(p.y, p.m);
    }
    var d = Dates.monthDiff(ref, key);
    var pv = d > 0 ? validation(contrat.numero, Dates.addMonths(key, -1)) : null;
    var pvLines = pv ? snapLines(pv) : null;
    var agents = Agents.list().filter(function (a) { return a.actif === '1' && Agents.isPerson(a) && a.contrat === contrat.numero; });
    var g = Pointage.grid(key, agents, false);
    var lines = funcs.map(function (f, i) {
      var prev = Number(f.qte_precedente_ref || 0);
      var i2;
      if (pvLines) { var pl = pvLines.filter(function (l) { return l.designation === f.designation; })[0]; prev = pl ? Number(pl.cumulee) : 0; }
      else {
        if (d > 0) for (i2 = 0; i2 < d; i2 += 1) prev += qty(f, Dates.addMonths(ref, i2));
        if (d < 0) for (i2 = d; i2 < 0; i2 += 1) prev -= qty(f, Dates.addMonths(ref, i2));
      }
      var mois = qty(f, key);
      var names = [Format.norm(f.designation), Format.norm(f.libelle)];
      var pointes = g.rows.filter(function (r) { return names.indexOf(Format.norm(r.fonction)) >= 0; }).reduce(function (s2, r) { return s2 + r.mois.T; }, 0);
      return { n: i + 1, designation: f.designation, nature: f.nature === 'vehicule' ? 'vehicule' : 'personne', positions: Number(f.positions), unite: 'Jour', delai: Number(f.delai), contrat: Number(f.positions) * Number(f.delai), precedente: prev, mois: mois, cumulee: prev + mois, prix_unitaire: Number(f.prix_unitaire), montant: mois * Number(f.prix_unitaire), pointes: pointes, auto: !override(f, key) };
    });
    return { key: key, numero: refN + d, contrat: contrat, rep_prestataire: repPrestataire(contrat), params: params, lines: lines, debut: key + '-01', fin: Dates.monthEnd(key), totalHT: lines.reduce(function (s2, l) { return s2 + l.montant; }, 0), statut: 'brouillon', verrouille: false, precedent_valide: !!pv };
  }

  // Attachement d'un mois : copie figée si validé, sinon calcul à neuf (brouillon).
  function attachementData(key, numero) {
    if (!Dates.isMonthKey(key)) throw httpErr_('Mois invalide (AAAA-MM)');
    var contrat = findContrat(numero);
    var v = validation(contrat.numero, key);
    if (!v) return computeFresh(key, contrat);
    var lines = snapLines(v);
    return {
      key: key, numero: Number(v.numero), contrat: contrat, rep_prestataire: v.rep_prestataire, params: Params.get(), lines: lines, debut: key + '-01', fin: Dates.monthEnd(key),
      totalHT: Number(v.total_ht), statut: v.statut, verrouille: true, valide_par: v.valide_par, date_validation: v.date_validation,
      facture_numero: v.facture_numero, facture_date: v.facture_date, facture_par: v.facture_par
    };
  }
  function requireAdmin(user) { if (user.role !== 'admin') throw httpErr_('Réservé à l\'administrateur', 'FORBIDDEN'); }

  // Valide l'attachement : copie figée, base de la facture. Les mois se valident dans l'ordre (cumuls).
  function valider(user, key, numero) {
    requireAdmin(user);
    var contrat = findContrat(numero);
    if (validation(contrat.numero, key)) throw httpErr_('Attachement déjà validé');
    var d = Dates.monthDiff(refMonth(contrat, key), key);
    var prevKey = Dates.addMonths(key, -1);
    if (d > 0 && !validation(contrat.numero, prevKey)) throw httpErr_("Validez d'abord l'attachement de " + Dates.monthLabel(prevKey) + " : les quantités précédentes en dépendent.");
    var data = computeFresh(key, contrat);
    if (!data.lines.length) throw httpErr_('Aucune fonction au contrat : rien à valider (Setup → Contrats).');
    var all = Store.readTable('AttachementsValides');
    all.push({ contrat: contrat.numero, mois: key, numero: data.numero, statut: 'valide', valide_par: user.nom, date_validation: new Date().toISOString(), rep_prestataire: data.rep_prestataire, total_ht: data.totalHT, lignes: JSON.stringify(data.lines), facture_numero: '', facture_date: '', facture_par: '' });
    Store.writeTable('AttachementsValides', all);
    return attachementData(key, contrat.numero);
  }
  // Réouverture : impossible si déjà facturé ou si un mois suivant est validé.
  function rouvrir(user, key, numero) {
    requireAdmin(user);
    var contrat = findContrat(numero);
    var all = Store.readTable('AttachementsValides');
    var v = all.filter(function (x) { return x.contrat === contrat.numero && x.mois === key; })[0];
    if (!v) throw httpErr_("Cet attachement n'est pas validé");
    if (v.statut === 'facture') throw httpErr_('Attachement déjà facturé (facture ' + v.facture_numero + ') : impossible de le rouvrir.');
    var later = all.filter(function (x) { return x.contrat === contrat.numero && x.mois > key; })[0];
    if (later) throw httpErr_("Rouvrez d'abord l'attachement de " + Dates.monthLabel(later.mois) + ' (validé après celui-ci).');
    Store.writeTable('AttachementsValides', all.filter(function (x) { return x !== v; }));
    return attachementData(key, contrat.numero);
  }
  // Enregistre la facture (n° et date) sur l'attachement validé.
  function facturer(user, key, numero, opts) {
    requireAdmin(user);
    opts = opts || {};
    var contrat = findContrat(numero);
    var all = Store.readTable('AttachementsValides');
    var v = all.filter(function (x) { return x.contrat === contrat.numero && x.mois === key; })[0];
    if (!v) throw httpErr_("Validez d'abord l'attachement : la facture est générée à partir de l'attachement validé.");
    var fnum = String(opts.facture_numero || '').trim();
    if (!fnum) throw httpErr_('N° de facture obligatoire');
    if (opts.date && !Dates.isDate(opts.date)) throw httpErr_('Date de facture invalide');
    v.facture_numero = fnum; v.facture_date = opts.date || v.facture_date || Dates.monthEnd(key); v.facture_par = user.nom; v.statut = 'facture';
    Store.writeTable('AttachementsValides', all);
    return attachementData(key, contrat.numero);
  }
  // La facture reprend les lignes de l'attachement VALIDÉ (copie figée) : mêmes quantités, prix du moment de la validation.
  function factureData(key, numero) {
    var att = attachementData(key, numero);
    if (!att.verrouille) throw httpErr_("Validez d'abord l'attachement : la facture est générée à partir de l'attachement validé.");
    att.lines = att.lines.filter(function (l) { return l.mois > 0; });
    att.facture_numero = att.facture_numero || '';
    att.date = att.facture_date || att.fin;
    att.attachement_date = att.fin;
    att.totalHT = att.lines.reduce(function (s2, l) { return s2 + l.montant; }, 0);
    return att;
  }
  return { ficheData: ficheData, attachementData: attachementData, factureData: factureData, ficheApercu: ficheApercu, refMonth: refMonth, repPrestataire: repPrestataire, valider: valider, rouvrir: rouvrir, facturer: facturer, validation: validation };
})();
