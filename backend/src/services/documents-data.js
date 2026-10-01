// Données des documents exportés : fiche de pointage, attachement, facture.
const agentsSvc = require('./agents');
const pointage = require('./pointage');
const cs = require('./contrats');
const store = require('../store');
const { getParams } = require('./params');
const { daysInMonth, parseKey, isMonthKey, addMonths, monthDiff, monthEnd, monthLabel, MOIS } = require('../lib/dates');
const { norm } = require('../lib/format');

async function findContrat(numero) {
  const list = await cs.contrats();
  const c = numero ? list.find((x) => x.numero === numero) : list[0];
  if (!c) throw agentsSvc.httpErr(404, numero ? `Contrat introuvable : ${numero}` : 'Aucun contrat configuré (Paramètres → Contrats)');
  return c;
}

async function ficheData(key, numero, { prevu = false, agents: visible } = {}) {
  if (!isMonthKey(key)) throw agentsSvc.httpErr(400, 'Mois invalide (AAAA-MM)');
  const [params, all] = await Promise.all([getParams(), visible ? Promise.resolve(visible) : agentsSvc.list()]);
  let list = all.filter((a) => a.actif === '1' && a.role !== 'admin');
  const contrat = numero ? await findContrat(numero) : null;
  if (contrat) list = list.filter((a) => a.contrat === contrat.numero);
  const grid = await pointage.grid(key, list, { prevu });
  const client = contrat ? contrat.client.split(/\s+/)[0].toUpperCase() : '';
  const titre = contrat ? `${client}/${params.societe_nom} N°${contrat.numero}` : params.societe_nom;
  return { key, label: monthLabel(key), nd: grid.nd, rows: grid.rows, prevu, titre, params, contrat };
}

// Quantité d'un mois = positions × jours du mois, sauf quantité saisie à la main.
async function attachementData(key, numero) {
  if (!isMonthKey(key)) throw agentsSvc.httpErr(400, 'Mois invalide (AAAA-MM)');
  const contrat = await findContrat(numero);
  const [funcs, overrides, params, all] = await Promise.all([cs.fonctions(), store.readTable('Attachements'), getParams(), agentsSvc.list()]);
  const fl = funcs.filter((f) => f.contrat === contrat.numero);
  const ref = contrat.ref_mois || key;
  const refN = Number(contrat.ref_attachement || 1);
  const qty = (f, k) => {
    const o = overrides.find((x) => x.contrat === contrat.numero && x.mois === k && x.designation === f.designation);
    if (o) return Number(o.qte_mois);
    const { y, m } = parseKey(k);
    return Number(f.positions) * daysInMonth(y, m);
  };
  const d = monthDiff(ref, key);
  const grid = await pointage.grid(key, all.filter((a) => a.actif === '1' && a.role !== 'admin' && a.contrat === contrat.numero), { prevu: false });
  const lines = fl.map((f, i) => {
    const refPrev = Number(f.qte_precedente_ref || 0);
    let prev = refPrev;
    if (d > 0) for (let i2 = 0; i2 < d; i2 += 1) prev += qty(f, addMonths(ref, i2));
    if (d < 0) for (let i2 = d; i2 < 0; i2 += 1) prev -= qty(f, addMonths(ref, i2));
    const mois = qty(f, key);
    const pointes = grid.rows.filter((r) => [norm(f.designation), norm(f.libelle)].includes(norm(r.fonction))).reduce((s, r) => s + r.mois.T, 0);
    return {
      n: i + 1, designation: f.designation, positions: Number(f.positions), unite: 'Jour', delai: Number(f.delai),
      contrat: Number(f.positions) * Number(f.delai), precedente: prev, mois, cumulee: prev + mois,
      prix_unitaire: Number(f.prix_unitaire), montant: mois * Number(f.prix_unitaire), pointes, auto: !overrides.some((x) => x.contrat === contrat.numero && x.mois === key && x.designation === f.designation),
    };
  });
  return {
    key, numero: refN + d, contrat, params, lines,
    debut: `${key}-01`, fin: monthEnd(key),
    totalHT: lines.reduce((s, l) => s + l.montant, 0),
  };
}

async function factureData(key, numero, { facture_numero, date, attachement_date } = {}) {
  const att = await attachementData(key, numero);
  const lines = att.lines.filter((l) => l.mois > 0);
  return { ...att, lines, facture_numero: facture_numero || '', date: date || att.fin, attachement_date: attachement_date || att.fin, totalHT: lines.reduce((s, l) => s + l.montant, 0) };
}

module.exports = { ficheData, attachementData, factureData, MOIS };
