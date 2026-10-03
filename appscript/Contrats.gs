var Contrats = (function () {
  function contrats() { return Store.readTable('Contrats'); }
  function fonctions() { return Store.readTable('Fonctions'); }
  function saveContrats(list) {
    var seen = {};
    var clean = (list || []).map(function (c) {
      var numero = String(c.numero || '').trim();
      if (!numero) throw httpErr_('Numéro de contrat obligatoire');
      if (seen[numero]) throw httpErr_('Contrat en double : ' + numero);
      seen[numero] = true;
      if (c.ref_mois && !/^\d{4}-\d{2}$/.test(c.ref_mois)) throw httpErr_('Mois de référence : AAAA-MM');
      var debut = String(c.date_debut || '').trim(); if (debut && !Dates.isDate(debut)) throw httpErr_('Date de début du contrat invalide (AAAA-MM-JJ)');
      var duree = String(c.duree_mois == null ? '' : c.duree_mois).trim(); if (duree && !(Number(duree) >= 1 && Number(duree) % 1 === 0)) throw httpErr_('Durée du contrat : nombre de mois entier ≥ 1');
      var cemail = Format.emails(c.client_email, 'E-mails du contact client', 3).join(', ');
      return { numero: numero, client: c.client || '', objet: c.objet || '', date_contrat: c.date_contrat || '', ref_mois: c.ref_mois || '', ref_attachement: c.ref_attachement || '', rep_prestataire: c.rep_prestataire || '', rep_client: c.rep_client || '', date_debut: debut, duree_mois: duree, client_email: cemail };
    });
    Store.writeTable('Contrats', clean);
    return clean;
  }
  // Fin du contrat = début + durée (en mois) − 1 jour ; vide si le début ou la durée manque.
  function dateFin(debut, duree) {
    if (!debut || !Dates.isDate(debut) || !(Number(duree) >= 1)) return '';
    var key = Dates.addMonths(debut.slice(0, 7), Number(duree)); var p = Dates.parseKey(key);
    var d = Math.min(Number(debut.slice(8, 10)), Dates.daysInMonth(p.y, p.m));
    return Dates.addDays(key + '-' + (d < 10 ? '0' : '') + d, -1);
  }
  // Informations visibles de tous (agents, chefs, clients) : numéro, client, début, durée, fin.
  function info(numero) {
    var c = numero ? contrats().filter(function (x) { return x.numero === numero; })[0] : null;
    if (!c) return null;
    return { numero: c.numero, client: c.client, objet: c.objet, date_debut: c.date_debut, duree_mois: c.duree_mois, date_fin: dateFin(c.date_debut, c.duree_mois) };
  }
  // Compte de consultation par défaut pour le contact client de chaque contrat (e-mail renseigné, pas encore de compte).
  function ensureClientAccounts(user) {
    var out = []; var existing = {}; Agents.list().forEach(function (a) { existing[String(a.email).toLowerCase()] = true; });
    contrats().forEach(function (c) {
      Format.emails(c.client_email, 'E-mails du contact client', 3).forEach(function (email, i) {
        if (existing[email]) return;
        try {
          var base = c.rep_client || ('Client ' + (c.client || c.numero));
          var r = Agents.create(user, { nom: i ? base + ' (' + (i + 1) + ')' : base, email: email, role: 'client', contrat: c.numero });
          existing[email] = true;
          out.push({ id: r.agent.id, nom: r.agent.nom, email: email, contrat: c.numero, password: r.password });
        } catch (e) { Logger.log('Compte client non créé (' + email + ') : ' + e.message); }
      });
    });
    return out;
  }
  function saveFonctions(list) {
    var clean = (list || []).map(function (f) {
      var keys = ['positions', 'delai', 'prix_unitaire', 'qte_precedente_ref'];
      var nums = keys.map(function (k) { return f[k] === '' || f[k] == null ? 0 : Number(f[k]); });
      if (nums.some(function (n) { return !isFinite(n) || n < 0; })) throw httpErr_('Valeurs numériques invalides pour « ' + f.designation + ' »');
      if (!String(f.designation || '').trim() || !String(f.contrat || '').trim()) throw httpErr_('Contrat et désignation obligatoires');
      return { contrat: f.contrat, designation: String(f.designation).trim(), libelle: String(f.libelle || '').trim(), positions: nums[0], delai: nums[1], prix_unitaire: nums[2], qte_precedente_ref: nums[3], nature: f.nature === 'vehicule' ? 'vehicule' : 'personne' };
    });
    Store.writeTable('Fonctions', clean);
    return clean;
  }
  function saveOverride(o) {
    var all = Store.readTable('Attachements').filter(function (x) { return !(x.contrat === o.contrat && x.mois === o.mois && x.designation === o.designation); });
    if (o.qte_mois !== '' && o.qte_mois != null) {
      var n = Number(o.qte_mois);
      if (!isFinite(n) || n < 0) throw httpErr_('Quantité invalide');
      all.push({ contrat: o.contrat, mois: o.mois, designation: o.designation, qte_mois: n });
    }
    Store.writeTable('Attachements', all);
  }
  // Effectif nécessaire en rotation : postes × (travail + repos) ÷ travail (ex. 2 postes en 28/28 → 4 personnes).
  // Les personnes tournent (postes × rotation) ; un véhicule mis à disposition n'est pas en rotation : quantité = nombre de véhicules.
  function besoin(positions, params, nature) {
    var nT = Number(params.jours_travail); var nR = Number(params.jours_repos);
    if (nature === 'vehicule') return Number(positions);
    return nT > 0 ? Math.ceil(Number(positions) * (nT + nR) / nT - 1e-9) : Number(positions);
  }
  function natureOf(f) { return f.nature === 'vehicule' ? 'vehicule' : 'personne'; }
  function typeOf(a) { return a.type === 'vehicule' ? 'vehicule' : 'personne'; }
  function sameFonction(f, label) { var n = Format.norm(label); return n && (Format.norm(f.libelle) === n || Format.norm(f.designation) === n); }
  function activeStaff(agents) { return agents.filter(function (a) { return a.actif === '1' && Agents.isPerson(a); }); }

  // Pour l'écran des agents : par contrat, chaque fonction prévue avec postes, effectif nécessaire et personnes déjà affectées.
  function effectifs() {
    var params = Params.get(); var staff = activeStaff(Agents.list()); var funcs = fonctions();
    return {
      strict: params.contrat_strict === '1', rotation: { travail: Number(params.jours_travail), repos: Number(params.jours_repos) },
      contrats: contrats().map(function (c) {
        return {
          numero: c.numero, client: c.client,
          fonctions: funcs.filter(function (f) { return f.contrat === c.numero; }).map(function (f) {
            var nat = natureOf(f);
            return { libelle: f.libelle || f.designation, designation: f.designation, nature: nat, positions: Number(f.positions), besoin: besoin(f.positions, params, nat), affectes: staff.filter(function (a) { return a.contrat === c.numero && typeOf(a) === nat && sameFonction(f, a.fonction); }).length };
          })
        };
      })
    };
  }

  // Contrôle l'affectation d'une personne : la fonction doit être prévue au contrat, dans la limite des postes.
  // Retourne le libellé canonique de la fonction (ou celui saisi si le contrat n'a pas de fonctions).
  // pool : liste des agents en cours de modification (modification groupée), sinon la table.
  function checkAffectation(a, excludeId, pool) {
    if (!a.contrat || !Agents.isPerson(a)) return a.fonction;
    var type = typeOf(a);
    var all = fonctions().filter(function (f) { return f.contrat === a.contrat; });
    if (!all.length) return a.fonction; // contrat sans fonctions définies : pas de contrainte
    var funcs = all.filter(function (f) { return natureOf(f) === type; });
    var what = type === 'vehicule' ? 'véhicule' : 'fonction';
    if (!funcs.length) throw httpErr_('Le contrat ' + a.contrat + ' ne prévoit aucun ' + (type === 'vehicule' ? 'véhicule' : 'poste de personnel') + '.');
    var f = funcs.filter(function (x) { return sameFonction(x, a.fonction); })[0];
    var liste = funcs.map(function (x) { return x.libelle || x.designation; }).join(', ');
    if (!f) throw httpErr_(a.fonction ? (type === 'vehicule' ? 'Véhicule' : 'Fonction') + ' « ' + a.fonction + ' » non prévu' + (type === 'vehicule' ? '' : 'e') + ' au contrat ' + a.contrat + '. Prévus au contrat : ' + liste + '.' : 'Choisissez ' + (type === 'vehicule' ? 'un véhicule' : 'une fonction') + ' prévu' + (type === 'vehicule' ? '' : 'e') + ' au contrat ' + a.contrat + ' (' + liste + ').');
    var params = Params.get();
    if (params.contrat_strict === '1' && Number(f.positions) > 0) {
      var cap = besoin(f.positions, params, type);
      var deja = activeStaff(pool || Agents.list()).filter(function (x) { return x.id !== excludeId && x.contrat === a.contrat && typeOf(x) === type && sameFonction(f, x.fonction); }).length;
      if (deja + 1 > cap) throw httpErr_('Effectif complet pour « ' + (f.libelle || f.designation) + ' » : ' + (type === 'vehicule' ? f.positions + ' véhicule(s) au contrat (déjà ' + deja + ')' : f.positions + ' poste(s) au contrat = ' + cap + ' personne(s) en rotation ' + params.jours_travail + '/' + params.jours_repos + ' (déjà ' + deja + ')') + '. Désactivez-en un ou assouplissez la règle dans Setup.');
    }
    return f.libelle || f.designation;
  }
  // Historique indicatif par fonction : un attachement validé par mois (figé) + le brouillon du mois suivant (admin).
  function historique(c, lignes, mine, prochain, isAdmin, money) {
    var snaps = mine.slice().reverse().map(function (v) { var l = []; try { l = JSON.parse(v.lignes) || []; } catch (e) { l = []; } return { mois: v.mois, numero: v.numero, statut: v.statut, lines: l, indicatif: false }; });
    if (isAdmin && !snaps.some(function (x) { return x.mois === prochain; })) {
      try { var d = DocData.attachementData(prochain, c.numero); snaps.push({ mois: prochain, numero: d.numero, statut: 'brouillon', lines: d.lines, indicatif: true }); } catch (e) { /* pas de brouillon possible */ }
    }
    return lignes.map(function (l) {
      return {
        designation: l.designation, quantite_contrat: l.quantite_contrat,
        mois: snaps.map(function (x) {
          var ln = x.lines.filter(function (y) { return y.designation === l.designation; })[0];
          if (!ln) return null;
          var o = { mois: x.mois, numero: x.numero, statut: x.statut, indicatif: x.indicatif, precedente: Number(ln.precedente), du_mois: Number(ln.mois), cumulee: Number(ln.cumulee), reste: Math.max(0, l.quantite_contrat - Number(ln.cumulee)) };
          if (money) o.montant = Number(ln.montant);
          return o;
        }).filter(Boolean)
      };
    });
  }
  // Synthèse affichée dans « Contrats » : fonctions du contrat, montants, effectifs affectés (noms), quantités facturées, attachements.
  // Les prix et montants ne sont fournis qu'à l'administrateur.
  // isAdmin : brouillon indicatif ; money : prix et montants (admin et client) ; scope : n° de contrat d'un compte client.
  function synthese(isAdmin, money, scope) {
    var params = Params.get(); var staff = activeStaff(Agents.list());
    var funcs = fonctions(); var vals = Store.readTable('AttachementsValides');
    return contrats().filter(function (c) { return !scope || c.numero === scope; }).map(function (c) {
      var mine = vals.filter(function (v) { return v.contrat === c.numero; }).sort(function (a, b) { return a.mois < b.mois ? 1 : -1; });
      var last = mine[0]; var lastLines = [];
      try { lastLines = last ? JSON.parse(last.lignes) || [] : []; } catch (e) { lastLines = []; }
      var total = 0;
      var lignes = funcs.filter(function (f) { return f.contrat === c.numero; }).map(function (f) {
        var nat = natureOf(f); var b = besoin(f.positions, params, nat);
        var membres = staff.filter(function (a) { return a.contrat === c.numero && typeOf(a) === nat && sameFonction(f, a.fonction); }).map(function (a) { return { id: a.id, nom: a.nom }; });
        var qteContrat = Number(f.positions) * Number(f.delai);
        var lastLine = lastLines.filter(function (l) { return l.designation === f.designation; })[0];
        var facture = lastLine ? Number(lastLine.cumulee) : Number(f.qte_precedente_ref || 0);
        var montant = qteContrat * Number(f.prix_unitaire); total += montant;
        var l = { designation: f.designation, libelle: f.libelle || f.designation, nature: nat, positions: Number(f.positions), delai: Number(f.delai), quantite_contrat: qteContrat, besoin: b, affectes: membres.length, membres: membres, quantite_facturee: facture, reste_a_facturer: Math.max(0, qteContrat - facture) };
        if (money) { l.prix_unitaire = Number(f.prix_unitaire); l.montant_contrat = montant; l.montant_facture = facture * Number(f.prix_unitaire); }
        return l;
      });
      var out = {
        numero: c.numero, client: c.client, objet: c.objet, date_contrat: c.date_contrat, date_debut: c.date_debut, duree_mois: c.duree_mois, date_fin: dateFin(c.date_debut, c.duree_mois), ref_mois: c.ref_mois, ref_attachement: c.ref_attachement, lignes: lignes,
        prochain: last ? Dates.addMonths(last.mois, 1) : DocData.refMonth(c, Dates.today().slice(0, 7)),
        attachements: mine.map(function (v) { var o = { mois: v.mois, numero: v.numero, statut: v.statut, valide_par: v.valide_par, date_validation: v.date_validation, facture_numero: v.facture_numero, facture_date: v.facture_date }; if (money) o.total_ht = Number(v.total_ht); return o; })
      };
      out.historique = historique(c, lignes, mine, out.prochain, isAdmin, money);
      if (money) out.montant_contrat = total;
      return out;
    });
  }
  return { info: info, dateFin: dateFin, ensureClientAccounts: ensureClientAccounts, synthese: synthese, effectifs: effectifs, checkAffectation: checkAffectation, besoin: besoin, contrats: contrats, fonctions: fonctions, saveContrats: saveContrats, saveFonctions: saveFonctions, saveOverride: saveOverride };
})();
