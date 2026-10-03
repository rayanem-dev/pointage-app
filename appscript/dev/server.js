// Serveur de développement : exécute les vrais .gs sur le simulateur Google et sert l'interface (google.script.run -> /rpc).
// Usage : node dev/server.js [port]   (comptes : admin@demo.local / admin1234 ; karim@demo.local, hamlaoui@demo.local, client@demo.local / demo1234)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadApp, DIR } = require('./load');

const app = loadApp();
const ok = (r) => { if (!r.ok) throw new Error(r.error); return r.data; };

// OCR Google Drive simulé pour la démo : le « scan » renvoie le bordereau des prix du contrat (Annexe 02).
const BORDEREAU = `<html><body><p>Contrat SH /SARL HORIZON SERVICES N° I/24/ DEMO-SRV/2025</p><p>BORDEREAU DES PRIX</p><table>
<tr><td>Désignation</td><td>Nombre</td><td>Tarif Journalier (DA)</td><td>Délai de mobilisation (jours)</td><td>Montant (DA)</td></tr>
<tr><td>Technicien électricien</td><td>2</td><td>14 000,00</td><td>540</td><td>15 120 000,00</td></tr>
<tr><td>Soudeur qualifié</td><td>2</td><td>12 500,00</td><td>540</td><td>13 500 000,00</td></tr>
<tr><td>Chauffeur poids lourd</td><td>1</td><td>12 500,00</td><td>540</td><td>6 750 000,00</td></tr>
<tr><td>Magasinier</td><td>1</td><td>9 500,00</td><td>540</td><td>5 130 000,00</td></tr>
<tr><td>Total (DA) en (HT)</td><td></td><td></td><td></td><td>40 500 000,00</td></tr></table></body></html>`;
// OCR_MODE=texte : simule un OCR sans tableau (texte en vrac avec du bruit), comme sur un vrai scan.
const EN_VRAC = 'energie du sud\nContrat SH /SARL HORIZON SERVICES N° 1/24/ DEMO-SRV/2025\nANNEXE : 02\nBORDEREAU DES PRIX\nDésignation\nNombre\nTarif\nJournalier\n(DA)\nDélai de\nmobilisation\n(jours)\nMontant\n(DA)\nTechnicien électricien\n2\n14 000,00\n540\n15 120 000,00\nSoudeur qualifié\n2\n12 500,00\n540\n13 500 000,00\nChauffeur poids lourd\n1\n12 500,00\n540\n6 750 000,00\nMagasinier\n1\n9 500,00\n540\n5 130 000,00\nTotal (DA) en (HT)\n40 500 000,00\nArrêté le présent bordereau des prix à la somme de : Quarante Millions Cinq Cent Mille Dinars Algériens( 40 500 000,00 DA)';
app.env.fetchHandler = (url) => {
  if (process.env.OCR_MODE === 'texte') {
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) return { code: 200, body: JSON.stringify({ id: 'docOCR' }) };
    if (url.includes('/files/docOCR/export')) return { code: 200, body: url.includes('text%2Fhtml') ? '<html><body>' + EN_VRAC.split('\n').map((l) => `<p>${l}</p>`).join('') + '</body></html>' : EN_VRAC };
  }
  if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) return { code: 200, body: JSON.stringify({ id: 'docOCR' }) };
  if (url.includes('/files/docOCR/export')) return { code: 200, body: url.includes('text%2Fhtml') ? BORDEREAU : 'Contrat SH /SARL HORIZON SERVICES N° I/24/ DEMO-SRV/2025\nTotal (DA) en (HT) 40 500 000,00' };
  return null;
};

function seed() {
  const { run, call } = app;
  run("Setup.install('admin@demo.local', 'admin1234', 'Administrateur')");
  const admin = ok(call(null, 'login', 'admin@demo.local', 'admin1234')).token;
  ok(call(admin, 'setupSave', { prestataire_nom: 'SARL HORIZON SERVICES', direction_nom: 'Direction RH', direction_email: 'direction@client.dz', prestataire_ville: 'Hassi Demo', prestataire_capital: '10 000 000,00 DA', client_entete: 'DIRECTION RÉGIONALE\nHASSI DEMO', signature_client: 'P/ENERGIE DU SUD', signature_prestataire: 'le prestataire SARL HORIZON SERVICES' }));
  const C = 'I/24/DEMO-SRV/2025';
  ok(call(admin, 'contratsSave', {
    contrats: [{ numero: C, client: 'ENERGIE DU SUD Division Production Direction Régionale Hassi Demo', objet: "Mise à disposition de personnel et de véhicules pour les opérations de maintenance du site", date_contrat: '15/01/2025', ref_mois: '2026-08', ref_attachement: 9, rep_prestataire: '', rep_client: 'DP DEMO' }],
    fonctions: [
      { contrat: C, designation: 'Technicien Électricien', libelle: 'Technicien électricien', positions: 2, delai: 540, prix_unitaire: 14000, qte_precedente_ref: 600 },
      { contrat: C, designation: 'Soudeur qualifié', libelle: 'Soudeur', positions: 2, delai: 540, prix_unitaire: 12500, qte_precedente_ref: 600 },
      { contrat: C, designation: 'Chauffeur poids lourd', libelle: 'Chauffeur poids lourd', positions: 1, delai: 540, prix_unitaire: 12500, qte_precedente_ref: 300 },
      { contrat: C, designation: 'Magasinier', libelle: 'Magasinier', positions: 1, delai: 540, prix_unitaire: 9500, qte_precedente_ref: 300 },
      { contrat: C, designation: 'Véhicule utilitaire 4x4', libelle: 'Utilitaire 4x4', positions: 2, delai: 540, prix_unitaire: 7500, qte_precedente_ref: 0, nature: 'vehicule' }],
  }));
  const rows = [
    ['KARIM BENSALEM', 'Magasinier', 'R8T23', 'chef'], ['SAMIR HAMLAOUI', 'Technicien électricien', 'T8R21T2'], ['NADIR CHERIF', 'Technicien électricien', 'T22R9'],
    ['YACINE MEZIANE', 'Soudeur', 'T21R10'], ['AMINE BOUDIAF', 'Technicien électricien', 'T25R6'], ['WALID TEBBAL', 'Technicien électricien', 'T12R19'],
    ['SOFIANE LAKHDARI', 'Soudeur', 'R3T21R7'], ['RACHID BELKACEM', 'Soudeur', 'R18T13'], ['HOCINE AMRANI', 'Soudeur', 'R14T17'],
    ['FARID OUALI', 'Magasinier', 'R8T23'], ['LYES MAHDI', 'Chauffeur poids lourd', 'R18T13'], ['TAREK ZIANI', 'Chauffeur poids lourd', 'T15R16'],
  ];
  const chef = ok(call(admin, 'agentCreate', { nom: rows[0][0], fonction: rows[0][1], email: 'karim@demo.local', role: 'chef', contrat: C, affectation: 'Hassi Demo', password: 'demo1234' })).agent;
  ok(call(admin, 'agentCreate', { nom: 'Client Énergie du Sud (veille)', email: 'client@demo.local', role: 'client', contrat: C, password: 'demo1234' }));
  { const cg = ok(call(admin, 'contratsGet')); cg.contrats[0].date_debut = '2025-02-01'; cg.contrats[0].duree_mois = '24'; cg.contrats[0].client_email = 'client@demo.local'; ok(call(admin, 'contratsSave', { contrats: cg.contrats, fonctions: cg.fonctions })); }
  const chefTok = ok(call(null, 'login', 'karim@demo.local', 'demo1234')).token;
  const ids = { [rows[0][0]]: chef.id };
  for (const [nom, fonction] of rows.slice(1)) {
    const a = ok(call(chefTok, 'agentCreate', { nom, fonction, email: `${nom.split(' ').slice(-1)[0].toLowerCase()}@demo.local`, contrat: C, affectation: 'Hassi Demo', password: 'demo1234' })).agent;
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
  const agentTok = ok(call(null, 'login', 'hamlaoui@demo.local', 'demo1234')).token;
  ok(call(agentTok, 'demandeCreate', { type: 'titre_conge', date_debut: '2026-10-25', date_fin: '2026-11-22', message: 'Retour famille' }));
  ok(call(agentTok, 'demandeCreate', { type: 'ats', message: 'Pour dossier CNAS' }));
  const tadj = ok(call(null, 'login', 'boudiaf@demo.local', 'demo1234')).token;
  ok(call(tadj, 'demandeCreate', { type: 'titre_conge', message: '' }));
  ok(call(tadj, 'demandeCreate', { type: 'fiche_emolument', message: 'Septembre' }));
}

const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const SHIM = `<script>window.google={script:{run:(function(){function mk(ok,fail){return new Proxy({},{get:function(t,name){
 if(name==='withSuccessHandler')return function(f){return mk(f,fail)};
 if(name==='withFailureHandler')return function(f){return mk(ok,f)};
 return function(){var args=Array.prototype.slice.call(arguments);fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({args:args})}).then(function(r){return r.json()}).then(ok).catch(fail)}}})}return mk(function(){},function(){})})()}};</script>`;
const page = (code) => read('Index.html').replace('<body>', '<body><script>window.__CODE = ' + JSON.stringify(code || '') + ';</script>').replace(/<\?!= include\('(\w+)'\); \?>/g, (m, n) => (n === 'App' ? SHIM : '') + read(`${n}.html`));

function start(port) {
  seed();
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/rpc') {
      let body = ''; req.on('data', (c) => { body += c; });
      req.on('end', () => { const { args } = JSON.parse(body); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(app.ctx.rpc(...args))); });
      return;
    }
    res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(page((/[?&]c=([\w-]+)/.exec(req.url) || [])[1]));
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}
if (require.main === module) start(Number(process.argv[2]) || 5056).then((s) => console.log('http://localhost:' + s.address().port));
module.exports = { start, app };
