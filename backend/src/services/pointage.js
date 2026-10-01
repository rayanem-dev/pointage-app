// Pointage : un onglet "YYYY-MM" par mois (même format que la fiche ACOSCO) + onglet "Global".
const store = require('../store');
const agentsSvc = require('./agents');
const { getParams } = require('./params');
const { daysInMonth, parseKey, isMonthKey, isDate, addDays, monthLabel, today, frDate } = require('../lib/dates');
const { timelineOf, totalsOf, cycleOf, forecastOf } = require('../lib/cycle');

const STATUTS = ['T', 'R', 'ABS'];
// Colonnes de l'onglet mensuel : A nom, B fonction, C..AG jours 1-31, puis OBS, T, CR, ABS, TOT T, TOT CR, Reliquat, ID.
const C_DAY0 = 2; const C_OBS = 33; const C_ID = 40; const HEADER_ROW = 4; const WIDTH = 41;
const colName = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const cell = (v) => { const s = String(v == null ? '' : v).trim().toUpperCase(); return s === 'CR' ? 'R' : STATUTS.includes(s) ? s : ''; };

function parseMonthTab(rows, agents) {
  let h = rows.findIndex((r) => norm(r[0]) === 'nom et prenom');
  if (h < 0) h = HEADER_ROW;
  const byName = new Map(agents.map((a) => [norm(a.nom), a.id]));
  const byId = new Set(agents.map((a) => a.id));
  const entries = {};
  for (const r of rows.slice(h + 1)) {
    const id = byId.has(String(r[C_ID] || '')) ? r[C_ID] : byName.get(norm(r[0]));
    if (!id) continue;
    entries[id] = Array.from({ length: 31 }, (_, i) => cell(r[C_DAY0 + i]));
  }
  return entries;
}

async function loadAllMonths() {
  const [tabs, agents] = await Promise.all([store.listTabs(), agentsSvc.list()]);
  const months = {};
  for (const t of tabs.filter(isMonthKey).sort()) months[t] = parseMonthTab(await store.getRows(t), agents);
  return { months, agents };
}

function monthRows(key, entries, agents, months, params) {
  const { y, m } = parseKey(key);
  const nd = daysInMonth(y, m);
  const header = ['Nom Et Prenom', 'Fonction', ...Array.from({ length: 31 }, (_, i) => i + 1), 'OBS', 'T', 'CR', 'ABS', 'TOT T', 'TOT CR', 'Reliquat', 'ID'];
  const rows = [[], ['', '', '', '', '', '', '', 'FICHE DE POINTAGE'], [`Mois de : ${monthLabel(key)}`], [`Rotation : ${params.jours_travail} T / ${params.jours_repos} R`], header];
  const list = agents.filter((a) => a.role !== 'admin' && (a.actif === '1' || (entries[a.id] || []).some(Boolean)));
  list.forEach((a, i) => {
    const days = (entries[a.id] || Array(31).fill('')).map((s, d) => (d < nd ? s : ''));
    const r = HEADER_ROW + 2 + i; // numéro de ligne dans la feuille (1-based)
    const rng = `${colName(C_DAY0)}${r}:${colName(C_DAY0 + 30)}${r}`;
    const tot = totalsOf(months, a.id, key);
    const row = Array(WIDTH).fill('');
    row[0] = a.nom; row[1] = a.fonction;
    days.forEach((s, d) => { row[C_DAY0 + d] = s; });
    row[34] = `=COUNTIF(${rng},"T")`; row[35] = `=COUNTIF(${rng},"R")`; row[36] = `=COUNTIF(${rng},"ABS")`;
    row[37] = tot.T; row[38] = tot.R; row[39] = tot.T - tot.R; row[C_ID] = a.id;
    rows.push(row);
  });
  return { rows, count: list.length };
}

async function writeMonths(months, agents, keys, params) {
  for (const key of keys) {
    const { rows, count } = monthRows(key, months[key], agents, months, params);
    await store.setRows(key, rows);
    try {
      await store.decorateMonth(key, { T: params.couleur_T, R: params.couleur_R, ABS: params.couleur_ABS }, HEADER_ROW + 1, HEADER_ROW + 1 + count);
    } catch (e) { console.warn('Couleurs de l\'onglet non appliquées :', e.message); }
  }
}

async function writeGlobal(months, agents, params) {
  const rows = [['Nom', 'Fonction', 'Contrat', 'TOT T', 'TOT CR', 'TOT ABS', 'Reliquat', 'Statut actuel', 'Jours dans le cycle', 'Prochain changement', 'Mis à jour']];
  for (const a of agents.filter((x) => x.role !== 'admin' && x.actif === '1')) {
    const t = totalsOf(months, a.id); const c = cycleOf(timelineOf(months, a.id), params);
    rows.push([a.nom, a.fonction, a.contrat, t.T, t.R, t.ABS, t.reliquat, c ? c.status : '', c && c.run ? `${c.run}/${c.total}` : '', c && c.next ? frDate(c.next) : '', today()]);
  }
  await store.setRows('Global', rows);
}

const emptyMonth = (agents) => Object.fromEntries(agents.filter((a) => a.role !== 'admin').map((a) => [a.id, Array(31).fill('')]));

// Pointe un agent sur une période [from, to] (statut '' = effacer).
async function setStatus({ agentId, from, to, statut }) {
  const end = to || from;
  if (!isDate(from) || !isDate(end) || end < from) throw agentsSvc.httpErr(400, 'Dates invalides');
  if (statut !== '' && !STATUTS.includes(statut)) throw agentsSvc.httpErr(400, 'Statut invalide (T, R ou ABS)');
  const span = (Date.parse(end) - Date.parse(from)) / 86400000;
  if (span > 92) throw agentsSvc.httpErr(400, 'Période trop longue (92 jours maximum)');
  return store.withLock(async () => {
    const { months, agents } = await loadAllMonths();
    if (!agents.some((a) => a.id === agentId && a.role !== 'admin')) throw agentsSvc.httpErr(404, 'Agent introuvable');
    const touched = new Set();
    for (let d = from; d <= end; d = addDays(d, 1)) {
      const key = d.slice(0, 7);
      if (!months[key]) months[key] = emptyMonth(agents);
      if (!months[key][agentId]) months[key][agentId] = Array(31).fill('');
      months[key][agentId][Number(d.slice(8, 10)) - 1] = statut;
      touched.add(key);
    }
    const params = await getParams();
    const first = [...touched].sort()[0];
    // Les cumuls (TOT T / TOT CR / Reliquat) des mois suivants changent aussi.
    await writeMonths(months, agents, Object.keys(months).sort().filter((k) => k >= first), params);
    await writeGlobal(months, agents, params);
    return { jours: span + 1 };
  });
}

// Grille d'un mois pour une liste d'agents, avec prévisions et totaux.
async function grid(key, visibleAgents, { prevu = true } = {}) {
  if (!isMonthKey(key)) throw agentsSvc.httpErr(400, 'Mois invalide (AAAA-MM)');
  const [{ months }, params] = await Promise.all([loadAllMonths(), getParams()]);
  const { y, m } = parseKey(key);
  const nd = daysInMonth(y, m);
  const end = `${key}-${String(nd).padStart(2, '0')}`;
  const rows = visibleAgents.map((a) => {
    const tl = timelineOf(months, a.id);
    const fc = prevu ? forecastOf(tl, params, end) : new Map();
    const days = Array.from({ length: nd }, (_, i) => {
      const d = `${key}-${String(i + 1).padStart(2, '0')}`;
      return { statut: tl.get(d) || '', prevu: tl.has(d) ? '' : fc.get(d) || '' };
    });
    const month = totalsOf({ [key]: months[key] || {} }, a.id);
    const cumul = totalsOf(months, a.id, key);
    return { id: a.id, nom: a.nom, fonction: a.fonction, affectation: a.affectation, contrat: a.contrat, chef_id: a.chef_id, days, mois: month, cumul };
  });
  return { month: key, label: monthLabel(key), nd, rows };
}

async function agentOverview(agent) {
  const [{ months }, params] = await Promise.all([loadAllMonths(), getParams()]);
  const tl = timelineOf(months, agent.id);
  const key = today().slice(0, 7);
  return { cumul: totalsOf(months, agent.id), mois: totalsOf({ [key]: months[key] || {} }, agent.id), month: key, cycle: cycleOf(tl, params) };
}

module.exports = { setStatus, grid, loadAllMonths, agentOverview, writeGlobal, STATUTS };
