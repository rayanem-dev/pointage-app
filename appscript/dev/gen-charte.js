// Génère confidentialite.html (racine, lien depuis la page d'accueil installable) à partir de Charte.gs : node dev/gen-charte.js
const fs = require('fs'); const path = require('path');
const { loadApp } = require('./load');
const app = loadApp();
const c = app.run('charte_()'); const copy = app.run('CFG.COPYRIGHT');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Charte de confidentialité — Sijil</title>
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:20px 16px;color:#1d2733}h1{font-size:1.5rem}h2{font-size:1.05rem;margin:22px 0 4px}p{margin:0 0 8px}.m{color:#6b7785;font-size:.85rem}</style></head>
<body><h1>Charte de confidentialité</h1>
${c.sections.map((s) => `<h2>${esc(s.titre)}</h2><p>${esc(s.texte)}</p>`).join('\n')}
<p class="m">Dernière mise à jour : ${c.maj.split('-').reverse().join('/')} · ${esc(copy)}</p>
<p class="m"><a href="./">‹ Retour à l'application</a></p></body></html>
`;
fs.writeFileSync(path.join(__dirname, '..', '..', 'confidentialite.html'), html);
console.log('confidentialite.html : ' + c.sections.length + ' sections');
