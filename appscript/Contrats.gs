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
      return { numero: numero, client: c.client || '', objet: c.objet || '', date_contrat: c.date_contrat || '', ref_mois: c.ref_mois || '', ref_attachement: c.ref_attachement || '', rep_prestataire: c.rep_prestataire || '', rep_client: c.rep_client || '' };
    });
    Store.writeTable('Contrats', clean);
    return clean;
  }
  function saveFonctions(list) {
    var clean = (list || []).map(function (f) {
      var keys = ['positions', 'delai', 'prix_unitaire', 'qte_precedente_ref'];
      var nums = keys.map(function (k) { return f[k] === '' || f[k] == null ? 0 : Number(f[k]); });
      if (nums.some(function (n) { return !isFinite(n) || n < 0; })) throw httpErr_('Valeurs numériques invalides pour « ' + f.designation + ' »');
      if (!String(f.designation || '').trim() || !String(f.contrat || '').trim()) throw httpErr_('Contrat et désignation obligatoires');
      return { contrat: f.contrat, designation: String(f.designation).trim(), libelle: String(f.libelle || '').trim(), positions: nums[0], delai: nums[1], prix_unitaire: nums[2], qte_precedente_ref: nums[3] };
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
  return { contrats: contrats, fonctions: fonctions, saveContrats: saveContrats, saveFonctions: saveFonctions, saveOverride: saveOverride };
})();
