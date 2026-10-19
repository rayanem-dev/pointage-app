// Génère les fichiers de la version PHP / MySQL à partir de l'application Apps Script (à relancer après chaque évolution) :
//   php/src/Generated.php  : configuration (tables, rôles, types…), changelog, charte
//   php/schema.sql         : tables MySQL (une par onglet de données)
//   php/public/app.html    : l'interface (la même que sur Apps Script, avec un petit adaptateur vers api.php)
// Usage : node dev/gen-php.js
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const DIR = path.join(__dirname, '..'); const OUT = path.join(DIR, '..', 'php');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const ctx = vm.createContext({ console });
['Config', 'Changelog', 'Charte'].forEach((f) => vm.runInContext(read(f + '.gs'), ctx, { filename: f + '.gs' }));
const get = (expr) => JSON.parse(JSON.stringify(vm.runInContext(expr, ctx)));
const CFG = get('CFG'); const CHANGELOG = get('CHANGELOG'); const charte = get('charte_()');
// La charte Apps Script décrit l'hébergement Google : version PHP = hébergement du client.
charte.sections.forEach((s) => { if (/Google Sheets/.test(s.texte)) s.texte = "Les données sont hébergées sur le serveur (base de données MySQL) choisi par la société qui exploite l'application, avec des sauvegardes régulières. Elles sont conservées pendant la durée du contrat puis restituées ou supprimées à la demande de la société."; });
const php = (v) => 'json_decode(' + JSON.stringify(JSON.stringify(v)).replace(/\$/g, '\\$') + ', true)';
fs.mkdirSync(path.join(OUT, 'src'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'src', 'Generated.php'), '<?php\n// Fichier généré par appscript/dev/gen-php.js : ne pas modifier à la main.\nreturn [\n  \'cfg\' => ' + php(CFG) + ',\n  \'changelog\' => ' + php(CHANGELOG) + ',\n  \'charte\' => ' + php(charte) + ',\n];\n');
// ----- schéma MySQL -----
const SHORT = /^(id|.*_id|cle|numero|code|role|statut|actif|type|rotation|nature|ext|source|dossier|periode|nouveau|convertir|vitrine|portee|origine|mois|email|contrat|acces_.*|date.*|.*_date|.*_le|valide_par|.*_par|empreinte|salt|password_hash|duree_mois|ref_.*|nb)$/;
const BIG = /^(lignes|champs|candidats)$/;
let sql = '-- Fichier généré par appscript/dev/gen-php.js : ne pas modifier à la main.\n-- Base MySQL / MariaDB (utf8mb4). Une table par onglet de données de la version Apps Script.\nSET NAMES utf8mb4;\n\n';
Object.keys(CFG.TABLES).forEach((t) => {
  const cols = CFG.TABLES[t].map((c) => '  `' + c + '` ' + (BIG.test(c) ? 'MEDIUMTEXT' : SHORT.test(c) ? 'VARCHAR(190)' : 'TEXT') + ' NOT NULL').join(',\n');
  sql += 'CREATE TABLE IF NOT EXISTS `' + t.toLowerCase() + '` (\n  `seq` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,\n' + cols + '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n';
});
sql += fs.readFileSync(path.join(__dirname, 'php-schema-extra.sql'), 'utf8');
fs.writeFileSync(path.join(OUT, 'schema.sql'), sql);
// ----- interface -----
const SHIM = `<script>window.google={script:{url:{getLocation:function(cb){cb({parameter:{},hash:location.hash.slice(1)})}},run:(function(){function mk(ok,fail){return new Proxy({},{get:function(t,name){
 if(name==='withSuccessHandler')return function(f){return mk(f,fail)};
 if(name==='withFailureHandler')return function(f){return mk(ok,f)};
 return function(token,fn,args){var a=Array.prototype.slice.call(arguments);fetch('api.php',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({token:a[0],name:a[1],args:a[2]})}).then(function(r){return r.json()}).then(ok).catch(fail)}}})}return mk(function(){},function(){})})()}};</script>`;
const page = read('Index.html').replace('<body>', '<body><script>window.__CODE = "";</script>').replace(/<\?!= include\('(\w+)'\); \?>/g, (m, n) => (n === 'App' ? SHIM : '') + read(`${n}.html`));
fs.mkdirSync(path.join(OUT, 'public'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'public', 'app.html'), page);
console.log('php/ : Generated.php, schema.sql, public/app.html (' + Object.keys(CFG.TABLES).length + ' tables, ' + CHANGELOG.length + ' versions)');
