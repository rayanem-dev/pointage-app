// Génère Help.html (page « Aide » de l'application) à partir de dev/help-data.json : node dev/gen-help.js
const fs = require('fs'); const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'help-data.json'), 'utf8'));
fs.writeFileSync(path.join(__dirname, '..', 'Help.html'), '<script>\n// Fichier généré par dev/gen-help.js : ne pas modifier à la main (contenu dans dev/help-data.json).\nvar HELP = ' + JSON.stringify(data) + ';\n</script>\n');
console.log('Help.html :', data.length, 'sections');
