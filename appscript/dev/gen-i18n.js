// Génère I18n.html (dictionnaire fr → en / ar + moteur de traduction) à partir de dev/i18n-data.json.
const fs = require('fs'); const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n-data.json'), 'utf8'));
const engine = fs.readFileSync(path.join(__dirname, 'i18n-engine.js'), 'utf8');
const out = '<script>\n// Fichier généré par dev/gen-i18n.js : ne pas modifier à la main (dictionnaire dans dev/i18n-data.json).\nvar I18N_DATA = ' + JSON.stringify(data) + ';\n' + engine + '\n</script>\n';
fs.writeFileSync(path.join(__dirname, '..', 'I18n.html'), out);
console.log('I18n.html :', data.length, 'entrées');
