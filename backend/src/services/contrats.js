const store = require('../store');
const { httpErr } = require('./agents');

const contrats = () => store.readTable('Contrats');
const fonctions = () => store.readTable('Fonctions');

async function saveContrats(list) {
  const seen = new Set();
  const clean = (list || []).map((c) => {
    const numero = String(c.numero || '').trim();
    if (!numero) throw httpErr(400, 'Numéro de contrat obligatoire');
    if (seen.has(numero)) throw httpErr(400, `Contrat en double : ${numero}`);
    seen.add(numero);
    if (c.ref_mois && !/^\d{4}-\d{2}$/.test(c.ref_mois)) throw httpErr(400, 'Mois de référence : AAAA-MM');
    return { numero, client: c.client || '', objet: c.objet || '', date_contrat: c.date_contrat || '', ref_mois: c.ref_mois || '', ref_attachement: c.ref_attachement || '', rep_prestataire: c.rep_prestataire || '', rep_client: c.rep_client || '' };
  });
  return store.withLock(async () => { await store.writeTable('Contrats', clean); return clean; });
}

async function saveFonctions(list) {
  const clean = (list || []).map((f) => {
    const nums = ['positions', 'delai', 'prix_unitaire', 'qte_precedente_ref'].map((k) => (f[k] === '' || f[k] == null ? 0 : Number(f[k])));
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) throw httpErr(400, `Valeurs numériques invalides pour « ${f.designation} »`);
    if (!String(f.designation || '').trim() || !String(f.contrat || '').trim()) throw httpErr(400, 'Contrat et désignation obligatoires');
    return { contrat: f.contrat, designation: f.designation.trim(), libelle: (f.libelle || '').trim(), positions: nums[0], delai: nums[1], prix_unitaire: nums[2], qte_precedente_ref: nums[3] };
  });
  return store.withLock(async () => { await store.writeTable('Fonctions', clean); return clean; });
}

async function saveOverride({ contrat, mois, designation, qte_mois }) {
  return store.withLock(async () => {
    const all = (await store.readTable('Attachements')).filter((o) => !(o.contrat === contrat && o.mois === mois && o.designation === designation));
    if (qte_mois !== '' && qte_mois != null) {
      const n = Number(qte_mois);
      if (!Number.isFinite(n) || n < 0) throw httpErr(400, 'Quantité invalide');
      all.push({ contrat, mois, designation, qte_mois: n });
    }
    await store.writeTable('Attachements', all);
  });
}

module.exports = { contrats, fonctions, saveContrats, saveFonctions, saveOverride };
