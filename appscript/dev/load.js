// Charge les fichiers .gs dans un contexte unique (comme Apps Script) avec les services simulés.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeEnv } = require('./mock');

const DIR = path.join(__dirname, '..');
const ORDER = ['Config', 'Dates', 'Format', 'Cycle', 'Store', 'Auth', 'Params', 'Agents', 'Contrats', 'Pointage', 'Demandes', 'Documents', 'DocData', 'Export', 'Setup', 'Main'];

function loadApp() {
  const { env, globals } = makeEnv();
  const ctx = vm.createContext({ ...globals, console, Map, Set, Date, JSON, Math, Object, Array, String, Number, Error, RegExp, isFinite, parseInt });
  for (const f of ORDER) vm.runInContext(fs.readFileSync(path.join(DIR, `${f}.gs`), 'utf8'), ctx, { filename: `${f}.gs` });
  const run = (code) => vm.runInContext(code, ctx);
  return { env, ctx, run, call: (token, name, ...args) => ctx.rpc(token, name, args) };
}
module.exports = { loadApp, DIR };
