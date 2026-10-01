// Couche d'accès unique : tables (objets) + onglets bruts, avec verrou d'écriture et cache.
const driver = process.env.STORAGE === 'local' ? require('./local') : require('./sheets');

const TTL = driver.cacheable ? 5000 : 0;
const cache = new Map();
let tabsCache = null;

const TABLES = {
  Params: ['cle', 'valeur'],
  Agents: ['id', 'nom', 'fonction', 'affectation', 'contrat', 'email', 'role', 'chef_id', 'actif', 'password_hash', 'date_entree'],
  Contrats: ['numero', 'client', 'objet', 'date_contrat', 'ref_mois', 'ref_attachement', 'rep_prestataire', 'rep_client'],
  Fonctions: ['contrat', 'designation', 'libelle', 'positions', 'delai', 'prix_unitaire', 'qte_precedente_ref'],
  Attachements: ['contrat', 'mois', 'designation', 'qte_mois'],
  Demandes: ['id', 'agent_id', 'type', 'objet', 'message', 'destinataire', 'date_creation', 'statut', 'reponse', 'traite_par', 'date_traitement'],
  Documents: ['id', 'agent_id', 'type', 'titre', 'fichier', 'nom_original', 'depose_par', 'date'],
};

let lock = Promise.resolve();
const withLock = (fn) => { const run = lock.then(fn, fn); lock = run.catch(() => {}); return run; };

async function listTabs() {
  if (TTL && tabsCache && Date.now() - tabsCache.at < TTL) return tabsCache.tabs;
  const tabs = await driver.listTabs();
  tabsCache = { tabs, at: Date.now() };
  return tabs;
}
async function getRows(tab) {
  const hit = cache.get(tab);
  if (TTL && hit && Date.now() - hit.at < TTL) return hit.rows.map((r) => r.slice());
  const rows = await driver.getRows(tab);
  cache.set(tab, { rows, at: Date.now() });
  return rows.map((r) => r.slice());
}
async function setRows(tab, rows) {
  await driver.setRows(tab, rows);
  cache.set(tab, { rows: rows.map((r) => r.slice()), at: Date.now() });
  tabsCache = null;
}

async function readTable(name) {
  const rows = await getRows(name);
  if (!rows.length) return [];
  const header = rows[0].map((h) => String(h).trim());
  return rows.slice(1)
    .filter((r) => r.some((c) => c !== '' && c != null))
    .map((r) => Object.fromEntries(TABLES[name].map((k) => { const i = header.indexOf(k); return [k, i < 0 || r[i] == null ? '' : String(r[i])]; })));
}
async function writeTable(name, objs) {
  const cols = TABLES[name];
  await setRows(name, [cols, ...objs.map((o) => cols.map((k) => (o[k] == null ? '' : String(o[k]))))]);
}

module.exports = { TABLES, listTabs, getRows, setRows, readTable, writeTable, withLock, decorateMonth: (...a) => driver.decorateMonth(...a), driver };
