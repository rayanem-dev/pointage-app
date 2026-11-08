// Génère Detecter.html (moteur de reconnaissance + lecture/renommage sur le poste) : node dev/gen-detecter.js
// Sources : dev/autodetect-renommage.js (copie de la brique « _autodetect-renommage », telle quelle) et dev/local.js.
const fs = require('fs'); const path = require('path');
const lire = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const out = '<script>\n// Fichier généré par dev/gen-detecter.js : ne pas modifier à la main (sources : dev/autodetect-renommage.js et dev/local.js).\n' + lire('autodetect-renommage.js') + '\n' + lire('local.js') + '</script>\n';
fs.writeFileSync(path.join(__dirname, '..', 'Detecter.html'), out);
console.log('Detecter.html :', out.length, 'octets');
