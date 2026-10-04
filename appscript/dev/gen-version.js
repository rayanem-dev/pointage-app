// Génère version.json (racine, servi par la page d'accueil) à partir de CFG.VERSION : node dev/gen-version.js
const fs = require('fs'); const path = require('path');
const { loadApp } = require('./load');
const v = loadApp().run('CFG.VERSION');
fs.writeFileSync(path.join(__dirname, '..', '..', 'version.json'), JSON.stringify({ version: v }) + '\n');
console.log('version.json : ' + v);
