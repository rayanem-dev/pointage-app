const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const { run } = loadApp();
const parse = (fn, arg) => JSON.parse(run(`JSON.stringify(Bordereau.${fn}(${JSON.stringify(arg)}))`));
const toF = (lines, delai) => JSON.parse(run(`JSON.stringify(Bordereau.toFonctions(${JSON.stringify(lines)}, ${delai || 0}))`));

// Bordereau des prix du contrat I/24/DEMO-SRV/2025 (Annexe 02), tel qu'OCRisé en tableau HTML.
const HTML = `<html><body><p>ANNEXE : 02</p><p>BORDEREAU DES PRIX</p><table>
<tr><td>Désignation</td><td>Nombre</td><td>Tarif<br>Journalier<br>(DA)</td><td>Délai de<br>mobilisation<br>(jours)</td><td>Montant<br>(DA)</td></tr>
<tr><td>Technicien électricien</td><td>2</td><td>14 000,00</td><td>540</td><td>15 120 000,00</td></tr>
<tr><td>Soudeur qualifié</td><td>2</td><td>12 500,00</td><td>540</td><td>13 500 000,00</td></tr>
<tr><td>Chauffeur poids lourd</td><td>1</td><td>12 500,00</td><td>540</td><td>6 750 000,00</td></tr>
<tr><td>Magasinier</td><td>1</td><td>9 500,00</td><td>540</td><td>5 130 000,00</td></tr>
<tr><td colspan="3">Total (DA) en (HT)</td><td colspan="2">40 500 000,00</td></tr></table>
<p>Arrêté le présent bordereau des prix à la somme de : Quarante Millions Cinq Cent Mille Dinars Algériens( 40 500 000,00 DA) en hors taxes (HT).</p></body></html>`;
const ATTENDU = [['Technicien électricien', 2, 14000], ['Soudeur qualifié', 2, 12500], ['Chauffeur poids lourd', 1, 12500], ['Magasinier', 1, 9500]];
const check = (lignes) => {
  assert.strictEqual(lignes.length, 4, JSON.stringify(lignes.map((l) => l.designation)));
  lignes.forEach((l, i) => assert.deepStrictEqual([l.designation, l.positions, l.delai, l.prix_unitaire], [ATTENDU[i][0], ATTENDU[i][1], 540, ATTENDU[i][2]], l.designation));
  assert.deepStrictEqual(lignes.map((l) => l.quantite_contrat), [1080, 1080, 540, 540]);
};

test('nombres français', () => {
  const n = (s) => parse('toNumber', s);
  assert.deepStrictEqual(['14 000,00', '15 120 000,00', '14.000,00', '1080', '12 500.00', '1 080'].map(n), [14000, 15120000, 14000, 1080, 12500, 1080]);
  assert.strictEqual(n('abc'), null);
});

test('tableau OCR du vrai bordereau : 4 fonctions, postes déduits du montant', () => {
  const rows = parse('htmlRows', HTML);
  assert.strictEqual(rows.length, 6);
  const lignes = toF(parse('parseRows', rows), 0);
  check(lignes);
  assert.ok(lignes.every((l) => l.fiable), 'toutes les lignes sont jugées fiables');
});

test('texte brut OCR (sans tableau) : mêmes résultats, via nombre × tarif × délai = montant', () => {
  const text = `Désignation   Nombre   Tarif Journalier (DA)   Délai de mobilisation (jours)   Montant (DA)
Technicien électricien 2 14 000,00 540 15 120 000,00
Soudeur qualifié 2 12 500,00 540 13 500 000,00
Chauffeur poids lourd 1 12 500,00 540 6 750 000,00
Magasinier 1 9 500,00 540 5 130 000,00
Total (DA) en (HT) 40 500 000,00
Arrêté le présent bordereau des prix à la somme de : Cinquante-Six Millions`;
  check(toF(parse('parseText', text), 0));
});

test('CSV / Excel (colonnes séparées par ;) : l\'en-tête est reconnu', () => {
  const csv = [['Désignation', 'Nombre', 'Tarif Journalier (DA)', 'Délai de mobilisation (jours)', 'Montant (DA)'], ...ATTENDU.map((a) => [a[0], a[1], a[2], 540, a[1] * a[2] * 540]), ['Total', '', '', '', 40500000]];
  check(toF(parse('parseRows', csv.map((r) => r.map(String))), 0));
});

test('colonnes dans un autre ordre, avec positions et quantité en jours', () => {
  const rows = [['N°', 'Désignation', 'U/M', 'Quantité', 'Prix unitaire HT', 'Montant HT'], ['1', 'Chauffeur', 'Jour', '1 080', '9 000,00', '9 720 000,00'], ['2', 'Total HT', '', '', '', '9 720 000,00']];
  const [l] = toF(parse('parseRows', rows), 540);
  assert.deepStrictEqual([l.designation, l.positions, l.delai, l.prix_unitaire, l.unite, l.fiable], ['Chauffeur', 2, 540, 9000, 'Jour', true]);
});

test('lignes douteuses signalées (non fiables) et lignes de total ignorées', () => {
  const rows = [['Désignation', 'Nombre', 'Tarif Journalier', 'Délai', 'Montant'], ['Technicien', '2', '14 000,00', '540', '1 000 000,00'], ['Total', '', '', '', '1 000 000,00'], ['TVA 19%', '', '', '', '190 000,00']];
  const lignes = toF(parse('parseRows', rows), 0);
  assert.strictEqual(lignes.length, 1);
  assert.strictEqual(lignes[0].fiable, false, 'montant incohérent avec 2 × 14 000 × 540');
});

test('parties du contrat lues dans l\'en-tête : prestataire et client', () => {
  const p = parse('detectParties', 'energie du sud\nContrat SH /SARL HORIZON SERVICES N° I/24/ DEMO-SRV/2025\nANNEXE : 02\nBORDEREAU DES PRIX\n');
  assert.deepStrictEqual([p.prestataire, p.client], ['SARL HORIZON SERVICES', 'ENERGIE DU SUD']);
  assert.deepStrictEqual(Object.values(parse('detectParties', 'Client : Naftal\nbla')), ['', 'NAFTAL']);
});

test('numéro de contrat, délai et total détectés dans le texte', () => {
  assert.strictEqual(parse('detectNumero', 'Contrat SH /SARL HORIZON SERVICES N° I/24/ DEMO-SRV/2025\n'), 'I/24/DEMO-SRV/2025');
  assert.strictEqual(parse('detectDelai', 'Délai de mobilisation : 540 jours'), 540);
  assert.strictEqual(parse('detectTotal', 'Total (DA) en (HT)   40 500 000,00'), 40500000);
});

// ---- Chaîne complète avec faux Google Drive (OCR) ----
function withDrive(html, text) {
  const app = loadApp(); const sent = [];
  app.env.fetchHandler = (url, opts) => {
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) { sent.push({ url, payload: opts.payload, type: opts.contentType }); return { code: 200, body: JSON.stringify({ id: 'docOCR' }) }; }
    if (url.includes('/files/docOCR/export')) return { code: 200, body: url.includes('text%2Fhtml') ? html : text };
    return null;
  };
  return { ...app, sent };
}
const call = (app, name, ...args) => app.ctx.rpc(app.token, name, args);

test('analyse d\'un PDF scanné de bout en bout (OCR Drive simulé) : lignes, numéro, total contrôlé', () => {
  const app = withDrive(HTML, 'Contrat SH /SARL HORIZON SERVICES N° I/24/ DEMO-SRV/2025\nTotal (DA) en (HT) 40 500 000,00');
  app.run("Setup.install('admin@test.local', 'adminpw1', 'Admin')");
  app.token = app.ctx.rpc(null, 'login', ['admin@test.local', 'adminpw1']).data.token;
  const pdf = Buffer.from('%PDF-1.4 scan').toString('base64');
  const r = JSON.parse(JSON.stringify(call(app, 'bordereauAnalyser', { nom: 'CONTRAT.pdf', mime: 'application/pdf', base64: pdf })));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  check(r.data.lignes);
  assert.deepStrictEqual([r.data.source, r.data.numero_detecte, r.data.total_detecte, r.data.total_calcule, r.data.total_ok], ['tableau', 'I/24/DEMO-SRV/2025', 40500000, 40500000, true]);
  assert.match(app.sent[0].type, /^multipart\/related; boundary=/);
  assert.match(app.sent[0].url, /ocrLanguage=fr/);
  assert.ok(Buffer.from(app.sent[0].payload).toString('latin1').includes('"mimeType":"application/vnd.google-apps.document"'), 'conversion en Google Doc = OCR');
  // erreurs
  assert.match(call(app, 'bordereauAnalyser', { nom: 'x.docx', base64: pdf }).error, /Format non pris en charge/);
  assert.match(call(app, 'bordereauAnalyser', { nom: 'x.pdf', base64: '' }).error, /vide/);
  app.token = null; assert.match(call(app, 'bordereauAnalyser', { nom: 'x.pdf', base64: pdf }).error, /expirée/);
});

test('droits : l\'import du bordereau suit l\'accès au Setup', () => {
  const app = withDrive(HTML, '');
  app.run("Setup.install('admin@test.local', 'adminpw1', 'Admin')");
  const adm = app.ctx.rpc(null, 'login', ['admin@test.local', 'adminpw1']).data.token;
  app.ctx.rpc(adm, 'agentCreate', [{ nom: 'CHEF', email: 'c@t.local', role: 'chef', password: 'chefpw12' }]);
  const chef = app.ctx.rpc(null, 'login', ['c@t.local', 'chefpw12']).data.token;
  const pdf = Buffer.from('%PDF').toString('base64');
  assert.match(app.ctx.rpc(chef, 'bordereauAnalyser', [{ nom: 'a.pdf', base64: pdf }]).error, /Setup/);
});

test('« Nombre » = personnes (postes) ; « Quantité » = véhicules mis à disposition ; nature détectée', () => {
  const rows = [
    ['Désignation', 'Nombre', 'Quantité', 'Tarif Journalier (DA)', 'Délai de mobilisation (jours)', 'Montant (DA)'],
    ['Technicien électricien', '2', '', '14 000,00', '540', '15 120 000,00'],
    ['Véhicule pick-up 4x4 avec chauffeur', '', '3', '9 000,00', '540', '14 580 000,00'],
  ];
  const [p, v] = toF(parse('parseRows', rows), 0);
  assert.deepStrictEqual([p.nature, p.positions, p.fiable], ['personne', 2, true]);
  assert.deepStrictEqual([v.nature, v.designation, v.positions, v.quantite_contrat, v.fiable], ['vehicule', 'Véhicule pick-up 4x4 avec chauffeur', 3, 1620, true], '3 véhicules × 540 jours × 9 000 = montant du bordereau');
});

test('véhicules : colonne Quantité seule = nombre de véhicules (petite valeur) ou jours (grande valeur)', () => {
  const rows = [['Désignation', 'Unité', 'Quantité', 'Prix unitaire', 'Montant'], ['Camion benne', 'Jour', '1 080', '12 000,00', '12 960 000,00'], ['Voiture de liaison', 'Jour', '2', '8 000,00', '8 640 000,00']];
  const [a, b] = toF(parse('parseRows', rows), 540);
  assert.deepStrictEqual([a.nature, a.positions, b.nature, b.positions], ['vehicule', 2, 'vehicule', 2]);
});

// ---- OCR réel : pas de tableau reconnu, texte en vrac avec du bruit (cas observé sur le vrai scan) ----
const NOISE_TOP = 'energie du sud\nContrat SH /SARL HORIZON SERVICES N° I/24/ DEMO-SRV/2025\nANNEXE : 02\nBORDEREAU DES PRIX\n';
const NOISE_BOTTOM = 'Total (DA) en (HT)\n40 500 000,00\nArrêté le présent bordereau des prix à la somme de : Quarante Millions Cinq Cent Mille Dinars Algériens( 40 500 000,00 DA) en hors taxes (HT).\n33\n';
const HEAD_V = 'Désignation\nNombre\nTarif\nJournalier\n(DA)\nDélai de\nmobilisation\n(jours)\nMontant\n(DA)\n';
const DATA = [['Technicien électricien', '2', '14 000,00', '540', '15 120 000,00'], ['Soudeur qualifié', '2', '12 500,00', '540', '13 500 000,00'], ['Chauffeur poids lourd', '1', '12 500,00', '540', '6 750 000,00'], ['Magasinier', '1', '9 500,00', '540', '5 130 000,00']];
const SHAPES = {
  'cellules sur des lignes séparées': NOISE_TOP + HEAD_V + DATA.map((r) => r.join('\n')).join('\n') + '\n' + NOISE_BOTTOM,
  'colonnes lues l\'une après l\'autre': NOISE_TOP + HEAD_V + DATA.map((r) => r[0]).join('\n') + '\n' + [1, 2, 3, 4].map((c) => DATA.map((r) => r[c]).join('\n')).join('\n') + '\n' + NOISE_BOTTOM,
  'désignation coupée sur deux lignes': NOISE_TOP + HEAD_V + DATA.map((r) => r.join('\n').replace('travaux en génie civil', 'travaux en génie\ncivil')).join('\n') + '\n' + NOISE_BOTTOM,
  'une ligne par ligne, tout en vrac': NOISE_TOP + 'Désignation Nombre Tarif Journalier (DA) Délai de mobilisation (jours) Montant (DA)\n' + DATA.map((r) => r.join(' ')).join('\n') + '\n' + NOISE_BOTTOM,
};
for (const [nom, text] of Object.entries(SHAPES)) {
  test(`OCR sans tableau — ${nom} : 4 fonctions, sans lignes parasites`, () => {
    const lignes = toF(parse('solveText', text), 0);
    check(lignes);
    assert.ok(lignes.every((l) => l.fiable));
  });
}

test('OCR sans aucun tableau lisible : aucune ligne inventée (contrat, annexe, phrase d\'arrêté ignorés)', () => {
  const bruit = NOISE_TOP + 'Arrêté le présent bordereau des prix à la somme de : Quarante Millions Cinq Cent Mille Dinars Algériens( 40 500 000,00 DA) en hors taxes (HT).\n';
  assert.deepStrictEqual(parse('solveText', bruit), []);
  assert.deepStrictEqual(parse('parseText', bruit), []);
});

test('chaîne complète : Google rend du texte sans <table>, n° de contrat « 1/24 » rapproché du contrat « I/24 »', () => {
  const html = '<html><body>' + SHAPES['cellules sur des lignes séparées'].split('\n').map((l) => `<p>${l}</p>`).join('') + '</body></html>';
  const text = SHAPES['cellules sur des lignes séparées'].replace('N° I/24/ RNS', 'N° 1/24/ RNS');
  const app = withDrive(html, text);
  app.run("Setup.install('admin@test.local', 'adminpw1', 'Admin')");
  const tok = app.ctx.rpc(null, 'login', ['admin@test.local', 'adminpw1']).data.token;
  app.ctx.rpc(tok, 'contratsSave', [{ contrats: [{ numero: 'I/24/DEMO-SRV/2025', client: 'ENERGIE DU SUD', objet: '' }], fonctions: [] }]);
  const r = JSON.parse(JSON.stringify(app.ctx.rpc(tok, 'bordereauAnalyser', [{ nom: 'scan.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF').toString('base64') }])));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  check(r.data.lignes);
  assert.deepStrictEqual([r.data.source, r.data.numero_detecte], ['texte', 'I/24/DEMO-SRV/2025']);
  assert.match(r.data.apercu, /BORDEREAU DES PRIX/, 'le texte lu par Google est renvoyé pour contrôle');
});

test('total du bordereau détecté même sur la ligne suivante ou via la phrase d\'arrêté', () => {
  assert.strictEqual(parse('detectTotal', 'Total (DA) en (HT)\n40 500 000,00\nArrêté'), 40500000);
  assert.strictEqual(parse('detectTotal', 'Arrêté le présent bordereau à la somme de : Cinquante-Six Millions Dinars Algériens( 40 500 000,00 DA) en hors taxes'), 40500000);
  assert.strictEqual(parse('detectTotal', 'rien ici'), null);
});

// ---- Bordereau à total de jours (« Total (365 jours X 2 ans X Nb d'agent) »), sections et sous-totaux : entreprise fictive ----
const HEAD2 = 'Item\nDésignation\nNbre\nd\'agent\nU\nTotal\n(365\njours X\n2ans X\nNb\nd\'agent)\nPrix U\nMontant\n';
const L2 = [['01', 'Technicien électricien', '02', 'Jour', '1460', '9 800,00', '14 308 000,00'], ['02', 'Chef de chantier', '01', 'Jour', '730', '12 000,00', '8 760 000,00'], ['03', 'Camion 2,5 tonnes', '02', 'Jour', '1460', '5 500,00', '8 030 000,00']];
const L2B = [['01', 'Topographe', '01', 'Jour', '120', '12 000,00', '1 440 000,00']];
const FIN2 = 'S Total 2\n1 440 000,00\nTotal General en Hors Taxe (HT) = S Total1 + S Total 2\n32 538 000,00\nArrêter le présent bordereau des prix à la somme de trente-deux millions (32 538 000,00 DA) En Hors Taxes (HT).\n';
const TEXTE2 = 'CONTRAT CLIENT/SARL DEMO N° 1/00/TST/2026\nANNEXE 03 :\nBordereau Des Prix\n1. Equipe permanente :\n' + HEAD2 + 'Equipe Travaux\n' + L2.map((r) => r.join('\n')).join('\n') + '\nMoyens Materiel\nS Total 1\n31 098 000,00\n2. Equipe à la demande :\nItem\nDésignation\nNbre d\'agent\nU\nTotal (Jour)\nPrix U\nMontant\n' + L2B.map((r) => r.join('\n')).join('\n') + '\n' + FIN2;
test('bordereau à total de jours : nombre d\'agents = total ÷ (365 × années), délai de référence, sans lignes parasites ni doublon de sous-total', () => {
  const lignes = toF(parse('solveText', TEXTE2), 0);
  assert.deepStrictEqual(lignes.map((l) => [l.designation, l.positions, l.delai, l.prix_unitaire]), [['Technicien électricien', 2, 730, 9800], ['Chef de chantier', 1, 730, 12000], ['Camion 2,5 tonnes', 2, 730, 5500], ['Topographe', 1, 120, 12000]]);
  assert.ok(lignes.every((l) => l.fiable), JSON.stringify(lignes));
  assert.strictEqual(parse('detectTotal', TEXTE2), 32538000);
  assert.strictEqual(parse('detectDelai', TEXTE2), 730);
});
test('bordereau à total de jours en tableau HTML : colonnes « Total (… jours) » ≠ montant, titres de section et sous-totaux ignorés', () => {
  const tr = (c) => '<tr>' + c.map((x) => '<td>' + x + '</td>').join('') + '</tr>';
  const html = '<table>' + tr(['Item', 'Désignation', 'Nbre d\'agent', 'U', 'Total (365 jours X 2ans X Nb d\'agent)', 'Prix U', 'Montant']) + tr(['Equipe Travaux', '', '', '', '', '', '']) + L2.map(tr).join('').replace(/<tr><td>(\d\d)<\/td><td>/g, '<tr><td>$1</td><td>') + tr(['Moyens Materiel', '', '', '', '', '', '']) + tr(['S Total 1', '', '', '', '', '', '31 098 000,00']) + '</table>';
  const rows = parse('htmlRows', html); const lignes = parse('parseRows', rows);
  const f = toF(lignes, 730);
  assert.deepStrictEqual(f.map((l) => [l.designation, l.positions, l.delai, l.montant]), [['Technicien électricien', 2, 730, 14308000], ['Chef de chantier', 1, 730, 8760000], ['Camion 2,5 tonnes', 2, 730, 8030000]]);
  assert.ok(f.every((l) => l.fiable), JSON.stringify(f));
});

test('bordereau à total de jours, colonnes lues l\'une après l\'autre, en-tête « 365 jours » illisible, désignation coupée : base déduite des totaux, noms dans l\'ordre', () => {
  const noms = ['Technicien électricien', 'Chef de chantier', 'Magasinier\nqualifié de dépôt', 'Camion 2,5 tonnes'];
  const items = ['01', '02', '03', '04']; const nb = ['02', '03', '01', '02']; const tot = ['1460', '2190', '730', '1460']; const prix = ['9 800,00', '12 000,00', '8 000,00', '5 500,00']; const mt = ['14 308 000,00', '26 280 000,00', '5 840 000,00', '8 030 000,00'];
  const texte = 'CONTRAT CLIENT/SARL DEMO N° 1/00/TST/2026\nBordereau Des Prix\nItem\nDésignation\nNbre\nd\'agent\nU\nTotal\n(jours)\nPrix U\nMontant\nEquipe Travaux\n' + noms.join('\n') + '\n' + [items, nb, ['Jour', 'Jour', 'Jour', 'Jour'], tot, prix, mt].map((c) => c.join('\n')).join('\n') + '\nS Total 1\n54 458 000,00\nTotal General en Hors Taxe (HT)\n54 458 000,00\n';
  const l = toF(parse('solveText', texte), 0);
  assert.deepStrictEqual(l.map((x) => [x.designation, x.positions, x.delai]), [['Technicien électricien', 2, 730], ['Chef de chantier', 3, 730], ['Magasinier qualifié de dépôt', 1, 730], ['Camion 2,5 tonnes', 2, 730]], JSON.stringify(l));
});

test('bordereau : nom du client avant l\'en-tête ignoré, désignation coupée par un n° d\'item, véhicule et dernier poste retrouvés', () => {
  const texte = 'CONTRAT ACME/SARL DEMO N° 1/00/TST/2026\nACME\nAnnexe\nBordereau Des Prix\nItem\nDésignation\nNbre\nd\'agent\nU\nTotal\n(365 jours X 2ans X Nb d\'agent)\nPrix U\nMontant\n' +
    'Equipe Travaux\nIngénieur chargé du suivi ou\n02\nsupervision des projets\nMétreur\nVéhicule 4x4 double cabines\nTopographe\n' +
    ['02', '01', '02', '01'].join('\n') + '\n' + ['Jour', 'Jour', 'Jour', 'Jour'].join('\n') + '\n' + ['1460', '730', '1460', '120'].join('\n') + '\n' + ['9 800,00', '8 000,00', '5 500,00', '12 000,00'].join('\n') + '\n' + ['14 308 000,00', '5 840 000,00', '8 030 000,00', '1 440 000,00'].join('\n') + '\nTotal General en Hors Taxe (HT)\n29 618 000,00\n';
  const l = toF(parse('solveText', texte), 0);
  assert.deepStrictEqual(l.map((x) => x.designation), ['Ingénieur chargé du suivi ou supervision des projets', 'Métreur', 'Véhicule 4x4 double cabines', 'Topographe'], JSON.stringify(l));
  assert.deepStrictEqual(l.map((x) => [x.positions, x.delai]), [[2, 730], [1, 730], [2, 730], [1, 120]]);
});
