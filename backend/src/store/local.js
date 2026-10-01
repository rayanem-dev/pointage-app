// Pilote de stockage local (fichier JSON) — pour la démo et les tests.
const fs = require('fs');
const path = require('path');

const file = process.env.DATA_FILE || path.join(__dirname, '../../data/db.json');
let db = null;

function load() {
  if (db) return db;
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { db = {}; }
  return db;
}
function save() {
  if (process.env.DATA_FILE === ':memory:') return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(db, null, 1));
}

module.exports = {
  cacheable: false,
  async listTabs() { return Object.keys(load()); },
  async getRows(tab) { return (load()[tab] || []).map((r) => r.slice()); },
  async setRows(tab, rows) { load()[tab] = rows.map((r) => r.slice()); save(); },
  async decorateMonth() {},
  reset() { db = {}; },
};
