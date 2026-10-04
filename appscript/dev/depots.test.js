const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const app = loadApp();
const { call, run, env } = app;
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); return r; };
const T = {};
let ocr = '';
const b64 = Buffer.from('%PDF-1.4 test').toString('base64');
const add = (nom, texte = '', extra = {}) => { ocr = texte; return ok(call(T.admin, 'depotAdd', { nom, mime: 'application/pdf', base64: b64, ...extra })); };

test('dépôt en vrac : mise en place et reconnaissance de l\'agent et du type par le nom du fichier', () => {
  run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  T.admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  T.kadri = ok(call(T.admin, 'agentCreate', { nom: 'KADRI SOFIANE', email: 'kadri@t.fr', role: 'agent', password: 'kadripw12' })).agent.id;
  T.benali = ok(call(T.admin, 'agentCreate', { nom: 'BENALI NADIA', email: 'benali@t.fr', role: 'agent', password: 'benalipw1' })).agent.id;
  env.fetchHandler = (url) => {
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) return { code: 200, body: JSON.stringify({ id: 'ocr1' }) };
    if (url.includes('/files/ocr1/export')) return { code: 200, body: ocr };
    return null;
  };
  const avant = env.fetches.filter((u) => u.startsWith('https://www.googleapis.com/upload/drive/v3/files')).length;
  const r = add('KADRI_Sofiane_FDP_mars_2026.pdf');
  assert.deepStrictEqual([r.agent_id, r.type, r.nom_final, r.pret, r.source], [T.kadri, 'fiche_emolument', 'KADRI_Sofiane_FDP_Mars2026.pdf', true, 'nom']);
  assert.strictEqual(env.fetches.filter((u) => u.startsWith('https://www.googleapis.com/upload/drive/v3/files')).length, avant, 'pas d\'OCR quand le nom suffit');
});

test('dépôt en vrac : les 7 règles de nommage, lues dans le contenu des scans', () => {
  const nom = (texte, extra) => add('scan' + Math.random().toString(36).slice(2, 6) + '.pdf', texte, extra);
  assert.strictEqual(nom('Titre de congé\nM. Kadri Sofiane\ndu 14/02/2026 au 12/03/2026').nom_final, 'TC_KADRI_Sofiane_2026-02-14.pdf');
  assert.strictEqual(nom('BULLETIN DE PAIE Kadri Sofiane Période : Février 2026').nom_final, 'KADRI_Sofiane_FDP_Fevrier2026.pdf');
  assert.strictEqual(nom('CONTRAT DE TRAVAIL de Kadri Sofiane, à compter du 04/04/2026').nom_final, 'KADRI_Sofiane_2026-04-04_Contrat.pdf');
  const cnas = nom('CAISSE NATIONALE DES ASSURANCES SOCIALES\nAttestation d\'affiliation\nN° d\'immatriculation : 9600270193\nAssuré : Nadia Benali\nFait à Alger, le 07/05/2026');
  assert.deepStrictEqual([cnas.agent_id, cnas.type, cnas.champs.nss, cnas.nom_final], [T.benali, 'attestation_cnas', '9600270193', 'BENALI_Nadia_AttestationCNAS_9600270193_2026-05-07.pdf']);
  assert.strictEqual(nom('CNAS mise à jour des droits de Sofiane Kadri du 01/01/2026 au 31/03/2026').nom_final, 'KADRI_Sofiane_MAJCNAS_Janvier2026_Mars2026.pdf');
  assert.strictEqual(nom('Attestation de travail\nNadia Benali\nFait à Alger, le 04/05/2026').nom_final, 'BENALI_Nadia_AttestationTravail_2026-05-04.pdf');
  assert.strictEqual(nom('Attestation d\'émoluments de Sofiane Kadri\nPériode : de janvier 2026 à mars 2026').nom_final, 'KADRI_Sofiane_AttestationEmoluments_Janvier2026_Mars2026.pdf');
  assert.strictEqual(nom('Attestation de travail et de salaire Nadia Benali le 02/06/2026').nom_final, 'BENALI_Nadia_ATS_2026-06-02.pdf');
});

test('dépôt en vrac : agent inconnu ou ambigu, correction, puis validation avant envoi', () => {
  const inconnu = add('scan0099.pdf', 'Attestation de travail\nFait le 10/06/2026');
  assert.deepStrictEqual([inconnu.agent_id, inconnu.pret], ['', false]); assert.match(inconnu.avertissement, /Agent non reconnu/);
  const ids = ok(call(T.admin, 'depotList')).map((x) => x.id);
  assert.ok(ids.includes(inconnu.id));
  const res = ok(call(T.admin, 'depotValider', [inconnu.id]));
  assert.strictEqual(res.valides, 0); assert.match(res.erreurs[0].message, /Agent à choisir/);
  fail(call(T.admin, 'depotUpdate', inconnu.id, { agent_id: 'A-inconnu' }), /groupe/);
  const corr = ok(call(T.admin, 'depotUpdate', inconnu.id, { agent_id: T.kadri, champs: { date: '2026-06-10' } }));
  assert.deepStrictEqual([corr.pret, corr.nom_final], [true, 'KADRI_Sofiane_AttestationTravail_2026-06-10.pdf']);
  fail(call(T.admin, 'depotUpdate', inconnu.id, { champs: { date: 'demain' } }), /Date/);
  assert.strictEqual(ok(call(T.admin, 'depotUpdate', inconnu.id, { nom_force: 'Mon nom libre.pdf' })).nom_final, 'Mon nom libre.pdf');
  ok(call(T.admin, 'depotUpdate', inconnu.id, { nom_force: '' }));
  // rien n'est dans l'espace de l'agent avant validation
  assert.strictEqual(ok(call(T.admin, 'documentsList', T.kadri)).length, 0, 'documents encore en attente de validation');
  env.mails.length = 0;
  const avant = ok(call(T.admin, 'depotList')).length;
  const v = ok(call(T.admin, 'depotValider', ids));
  assert.strictEqual(v.erreurs.length, 0, JSON.stringify(v.erreurs)); assert.strictEqual(v.valides, avant);
  assert.deepStrictEqual(ok(call(T.admin, 'depotList')), [], 'file d\'attente vidée');
  const kadri = ok(call(T.admin, 'documentsList', T.kadri)).map((d) => d.nom_original);
  assert.ok(kadri.includes('TC_KADRI_Sofiane_2026-02-14.pdf') && kadri.includes('KADRI_Sofiane_2026-04-04_Contrat.pdf') && kadri.includes('KADRI_Sofiane_FDP_Mars2026.pdf'));
  const racine = env.sheetFolder.folders.find((f) => f.name === 'Documents');
  assert.ok(racine.folders.find((f) => f.name === 'Kadri Sofiane').getFilesByName('KADRI_Sofiane_MAJCNAS_Janvier2026_Mars2026.pdf').hasNext(), 'fichier rangé dans le dossier de l\'agent');
  assert.ok(!racine.folders.find((f) => f.name === 'À classer').getFiles().hasNext(), 'dossier « À classer » vide');
  assert.strictEqual(env.mails.filter((m) => m.to === 'kadri@t.fr').length, 1, 'un seul e-mail récapitulatif par agent');
  assert.match(env.mails.find((m) => m.to === 'kadri@t.fr').body, /MAJCNAS/);
});

test('dépôt en vrac : conversion des images en PDF, rejet, droits', () => {
  ocr = '';
  const img = ok(call(T.admin, 'depotAdd', { nom: 'KADRI_Sofiane_Contrat_2026-04-05.jpg', mime: 'image/jpeg', base64: b64, pdf: true }));
  assert.strictEqual(img.nom_final, 'KADRI_Sofiane_2026-04-05_Contrat.pdf'); assert.match(img.avertissement, /converti en PDF/);
  const png = ok(call(T.admin, 'depotAdd', { nom: 'KADRI_Sofiane_Contrat_2026-04-06.png', mime: 'image/png', base64: b64, pdf: false }));
  assert.strictEqual(png.nom_final, 'KADRI_Sofiane_2026-04-06_Contrat.png', 'sans conversion : format conservé');
  assert.deepStrictEqual(ok(call(T.admin, 'depotRejeter', [img.id, png.id])), { retires: 2 });
  assert.strictEqual(ok(call(T.admin, 'depotList')).length, 0);
  const ag = ok(call(null, 'login', 'kadri@t.fr', 'kadripw12')).token;
  fail(call(ag, 'depotAdd', { nom: 'a.pdf', base64: b64 }), /refusé/); fail(call(ag, 'depotList'), /refusé/);
  fail(call(T.admin, 'depotAdd', { nom: 'a.pdf', base64: '' }), /manquant/);
  env.fetchHandler = null;
});
