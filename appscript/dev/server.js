// Serveur de développement : exécute les vrais .gs sur le simulateur Google et sert l'interface (google.script.run -> /rpc).
// Usage : node dev/server.js [port]   (comptes : admin@demo.local / admin1234 ; madani@demo.local, lamine@demo.local / demo1234)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadApp, DIR } = require('./load');

const app = loadApp();
const ok = (r) => { if (!r.ok) throw new Error(r.error); return r.data; };

function seed() {
  const { run, call } = app;
  run("Setup.install('admin@demo.local', 'admin1234', 'Administrateur')");
  const admin = ok(call(null, 'login', 'admin@demo.local', 'admin1234')).token;
  ok(call(admin, 'setupSave', { prestataire_nom: 'SARL ACOSCO', direction_nom: 'Direction RH', direction_email: 'direction@client.dz', prestataire_ville: 'In Amenas', prestataire_capital: '1 600 000 000,00 DA', client_entete: 'DIVISION PRODUCTION\nDIRECTION REGIONALE\nRHOURDE NOUSS', signature_client: 'P/SONATRACH-DP-RNS', signature_prestataire: 'le prestataire SARL ACOSCO' }));
  const C = 'I/24/RNS-INFRA/2025';
  ok(call(admin, 'contratsSave', {
    contrats: [{ numero: C, client: 'SONATRACH Division Production Direction Régionale Rhourde Nouss', objet: "Prestations d'accompagnement à l'étude d'engineering de contrôle de qualité des travaux et suivi des projets", date_contrat: '30/03/2025', ref_mois: '2026-08', ref_attachement: 16, rep_prestataire: 'ZERGAT. M', rep_client: 'DP RNS' }],
    fonctions: [
      { contrat: C, designation: 'Ingénieur Génie civil', libelle: 'Ingénieur génie civil', positions: 2, delai: 540, prix_unitaire: 18500, qte_precedente_ref: 914 },
      { contrat: C, designation: 'Conducteur travaux en génie civil', libelle: 'Conducteur /T G.civil', positions: 2, delai: 540, prix_unitaire: 16500, qte_precedente_ref: 914 },
      { contrat: C, designation: 'Métreur vérificateur', libelle: 'Métreur Vérificateur', positions: 1, delai: 540, prix_unitaire: 16500, qte_precedente_ref: 457 },
      { contrat: C, designation: 'Préparateur', libelle: 'Préparateur', positions: 1, delai: 540, prix_unitaire: 17500, qte_precedente_ref: 457 }],
  }));
  const rows = [
    ['RAYANE REDHA MADANI', 'Préparateur', 'R8T23', 'chef'], ['KRIBIA MOHAMMED LAMINE', 'Ingénieur génie civil', 'T8R21T2'], ['ADNANE ABDELMOUMEN', 'Ingénieur génie civil', 'T22R9'],
    ['HAMIDI AHCENE', 'Conducteur /T G.civil', 'T21R10'], ['BELHEINE TADJ EDDINE', 'Ingénieur génie civil', 'T25R6'], ['AZEGGAGH LOUCIF', 'Ingénieur génie civil', 'T12R19'],
    ['TOUAHRI ABDELLATIF', 'Conducteur /T G.civil', 'R3T21R7'], ['ZERROUKI AREZKI', 'Conducteur /T G.civil', 'R18T13'], ['CHAREF KAMEL', 'Conducteur /T G.civil', 'R14T17'],
    ['CHOAYB LACHI', 'Préparateur', 'R8T23'], ['MEZROUA ABDELDJALIL', 'Métreur Vérificateur', 'R18T13'], ['BENRITAB ABDESSLAM', 'Métreur Vérificateur', 'T15R16'],
  ];
  const chef = ok(call(admin, 'agentCreate', { nom: rows[0][0], fonction: rows[0][1], email: 'madani@demo.local', role: 'chef', contrat: C, affectation: 'Rhourde Nouss', password: 'demo1234' })).agent;
  const chefTok = ok(call(null, 'login', 'madani@demo.local', 'demo1234')).token;
  const ids = { [rows[0][0]]: chef.id };
  for (const [nom, fonction] of rows.slice(1)) {
    const a = ok(call(chefTok, 'agentCreate', { nom, fonction, email: `${nom.split(' ').slice(-1)[0].toLowerCase()}@demo.local`, contrat: C, affectation: 'Rhourde Nouss', password: 'demo1234' })).agent;
    ids[nom] = a.id;
  }
  for (const [nom, , plan] of rows) {
    let day = 1;
    for (const m of plan.matchAll(/([TR])(\d+)/g)) {
      const n = Number(m[2]); const pad = (x) => String(x).padStart(2, '0');
      ok(call(chefTok, 'pointer', { agent_id: ids[nom], date: `2026-08-${pad(day)}`, date_fin: `2026-08-${pad(day + n - 1)}`, statut: m[1] })); day += n;
    }
  }
  // quelques demandes pour la démo
  const lamine = ok(call(null, 'login', 'lamine@demo.local', 'demo1234')).token;
  ok(call(lamine, 'demandeCreate', { type: 'titre_conge', date_debut: '2026-10-25', date_fin: '2026-11-22', message: 'Retour famille' }));
  ok(call(lamine, 'demandeCreate', { type: 'ats', message: 'Pour dossier CNAS' }));
  const tadj = ok(call(null, 'login', 'eddine@demo.local', 'demo1234')).token;
  ok(call(tadj, 'demandeCreate', { type: 'titre_conge', message: '' }));
  ok(call(tadj, 'demandeCreate', { type: 'fiche_emolument', message: 'Septembre' }));
}

const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const SHIM = `<script>window.google={script:{run:(function(){function mk(ok,fail){return new Proxy({},{get:function(t,name){
 if(name==='withSuccessHandler')return function(f){return mk(f,fail)};
 if(name==='withFailureHandler')return function(f){return mk(ok,f)};
 return function(){var args=Array.prototype.slice.call(arguments);fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({args:args})}).then(function(r){return r.json()}).then(ok).catch(fail)}}})}return mk(function(){},function(){})})()}};</script>`;
const page = () => read('Index.html').replace(/<\?!= include\('(\w+)'\); \?>/g, (m, n) => (n === 'App' ? SHIM : '') + read(`${n}.html`));

function start(port) {
  seed();
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/rpc') {
      let body = ''; req.on('data', (c) => { body += c; });
      req.on('end', () => { const { args } = JSON.parse(body); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(app.ctx.rpc(...args))); });
      return;
    }
    res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(page());
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}
if (require.main === module) start(Number(process.argv[2]) || 5056).then((s) => console.log('http://localhost:' + s.address().port));
module.exports = { start, app };
