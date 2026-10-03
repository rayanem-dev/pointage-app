// Génère CHANGELOG.md (racine) à partir de Changelog.gs : node dev/gen-changelog.js
const fs = require('fs'); const path = require('path');
const { loadApp } = require('./load');
const app = loadApp();
const list = app.run('CHANGELOG'); const copy = app.run('CFG.COPYRIGHT');
const md = ['# Historique des versions', '', copy, ''].concat(...list.map((v) => [`## ${v.v} — ${v.date} — ${v.titre}`, '', ...v.points.map((p) => `- ${p}`), ''])).join('\n');
fs.writeFileSync(path.join(__dirname, '..', '..', 'CHANGELOG.md'), md);
console.log('CHANGELOG.md : ' + list.length + ' versions');
