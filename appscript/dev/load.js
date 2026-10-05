// Charge les fichiers .gs dans un contexte unique (comme Apps Script) avec les services simulés.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeEnv } = require('./mock');

const DIR = path.join(__dirname, '..');
const ORDER = ['Config', 'Changelog', 'Charte', 'Dates', 'Holidays', 'Format', 'Cycle', 'Store', 'Tenants', 'Auth', 'Auto', 'Params', 'Agents', 'Contrats', 'Bordereau', 'Pointage', 'Remarques', 'Import', 'Demandes', 'Documents', 'DocData', 'Export', 'Archive', 'Prospects', 'Setup', 'Installer', 'Main'];

function loadApp(order) {
  const { env, globals } = makeEnv();
  const ctx = vm.createContext({ ...globals, console, Map, Set, Date, JSON, Math, Object, Array, String, Number, Error, RegExp, isFinite, parseInt });
  for (const f of (order || ORDER)) vm.runInContext(fs.readFileSync(path.join(DIR, `${f}.gs`), 'utf8'), ctx, { filename: `${f}.gs` });
  const run = (code) => vm.runInContext(code, ctx);
  return { env, ctx, run, call: (token, name, ...args) => JSON.parse(JSON.stringify(ctx.rpc(token, name, args))) }; // comme Apps Script : la réponse est sérialisée (tableaux et objets du contexte de test)
}
module.exports = { loadApp, DIR };
