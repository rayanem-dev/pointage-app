const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const app = loadApp();
const { call, run, env } = app;
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); return r; };
const T = {};
let ocr = '';
const JPG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAGAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDDoooryD9FP//Z'; const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAFElEQVR4nGP8xcXFgA0wYRWlkwQAoSIBGmQ5qnUAAAAASUVORK5CYII='; const RGBA = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAYAAAD+Bd/7AAAAFklEQVR4nGP8xcX1nwEPYMInOVgUAACWXwIZGOXdkwAAAABJRU5ErkJggg==';
const b64 = Buffer.from('%PDF-1.4 test').toString('base64');
let cpt = 0; const unique = () => Buffer.from('%PDF-1.4 test ' + (cpt += 1)).toString('base64');
const add = (nom, texte = '', extra = {}) => { ocr = texte; return ok(call(T.admin, 'depotAdd', { nom, mime: 'application/pdf', base64: unique(), ...extra })); };

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

test('dépôt en vrac : conversion des images en PDF à l\'envoi (aperçu = image d\'origine), repli, rejet, droits', () => {
  ocr = '';
  const img = ok(call(T.admin, 'depotAdd', { nom: 'KADRI_Sofiane_Contrat_2026-04-05.jpg', mime: 'image/jpeg', base64: JPG, pdf: true }));
  assert.strictEqual(img.nom_final, 'KADRI_Sofiane_2026-04-05_Contrat.pdf'); assert.match(img.avertissement, /sera converti en PDF/);
  const ap = ok(call(T.admin, 'depotApercu', img.id));
  assert.strictEqual(ap.base64, JPG, 'l\'aperçu montre l\'image d\'origine, lisible par le navigateur');
  const png = ok(call(T.admin, 'depotAdd', { nom: 'KADRI_Sofiane_Contrat_2026-04-06.png', mime: 'image/png', base64: PNG, pdf: false }));
  assert.strictEqual(png.nom_final, 'KADRI_Sofiane_2026-04-06_Contrat.png', 'sans conversion : format conservé');
  const alpha = ok(call(T.admin, 'depotAdd', { nom: 'KADRI_Sofiane_Contrat_2026-04-07.png', mime: 'image/png', base64: RGBA, pdf: true }));
  assert.strictEqual(alpha.nom_final, 'KADRI_Sofiane_2026-04-07_Contrat.png'); assert.match(alpha.avertissement, /Conversion PDF impossible/);
  const v = ok(call(T.admin, 'depotValider', [img.id]));
  assert.strictEqual(v.valides, 1, JSON.stringify(v.erreurs));
  const dossier = env.sheetFolder.folders.find((f) => f.name === 'Documents').folders.find((f) => f.name === 'Kadri Sofiane');
  assert.ok(dossier.getFilesByName('KADRI_Sofiane_2026-04-05_Contrat.pdf').hasNext(), 'fichier .pdf rangé chez l\'agent');
  const doc = ok(call(T.admin, 'documentsList', T.kadri)).find((d) => d.nom_original === 'KADRI_Sofiane_2026-04-05_Contrat.pdf');
  assert.ok(Buffer.from(ok(call(T.admin, 'documentDownload', doc.id)).base64, 'base64').toString('latin1').startsWith('%PDF-1.5'), 'contenu = PDF fabriqué');
  assert.deepStrictEqual(ok(call(T.admin, 'depotRejeter', [png.id, alpha.id])), { retires: 2 });
  assert.strictEqual(ok(call(T.admin, 'depotList')).length, 0);
  const ag = ok(call(null, 'login', 'kadri@t.fr', 'kadripw12')).token;
  fail(call(ag, 'depotAdd', { nom: 'a.pdf', base64: b64 }), /refusé/); fail(call(ag, 'depotList'), /refusé/);
  fail(call(T.admin, 'depotAdd', { nom: 'a.pdf', base64: '' }), /manquant/);
  env.fetchHandler = null;
});

test('conversion image → PDF fabriquée sur place : JPEG et PNG valides (xref cohérente), alpha refusé proprement', () => {
  const pdfOf = (b64) => Buffer.from(app.run('Utilitaire = null; Utilities.base64Encode(Documents.imageToPdf(Utilities.base64Decode(' + JSON.stringify(b64) + ')))'), 'base64');
  for (const [b64, filtre] of [[JPG, '/DCTDecode'], [PNG, '/FlateDecode']]) {
    const pdf = pdfOf(b64); const txt = pdf.toString('latin1');
    assert.ok(txt.startsWith('%PDF-1.5') && txt.includes(filtre) && txt.includes('/Subtype /Image') && txt.trimEnd().endsWith('%%EOF'));
    const xref = Number(/startxref\n(\d+)/.exec(txt)[1]); assert.ok(txt.slice(xref).startsWith('xref'), 'startxref pointe sur la table');
    for (let n = 1; n <= 5; n += 1) { const off = Number(txt.slice(xref).split('\n')[2 + n].slice(0, 10)); assert.ok(txt.slice(off).startsWith(n + ' 0 obj'), 'objet ' + n + ' à son décalage'); }
  }
  assert.strictEqual(app.run('Documents.imageToPdf(Utilities.base64Decode(' + JSON.stringify(RGBA) + '))'), null, 'PNG avec transparence : non géré (le fichier est conservé tel quel)');
  assert.strictEqual(app.run('Documents.imageToPdf(Utilities.base64Decode("aGVsbG8="))'), null);
});

test('aperçu d\'un document en attente : le fichier est lisible avant envoi ; réservé au personnel', () => {
  ocr = '';
  const r = ok(call(T.admin, 'depotAdd', { nom: 'KADRI_Sofiane_Contrat_2026-06-01.pdf', mime: 'application/pdf', base64: b64 }));
  const ap = ok(call(T.admin, 'depotApercu', r.id));
  assert.strictEqual(ap.nom, 'KADRI_Sofiane_Contrat_2026-06-01.pdf'); assert.strictEqual(Buffer.from(ap.base64, 'base64').toString(), '%PDF-1.4 test');
  fail(call(T.admin, 'depotApercu', 'inconnu'), /introuvable/);
  const ag = ok(call(null, 'login', 'kadri@t.fr', 'kadripw12')).token; fail(call(ag, 'depotApercu', r.id), /refusé/);
  ok(call(T.admin, 'depotRejeter', [r.id]));
});

test('conversion PDF d\'une grosse image (plusieurs Mo) : pas de dépassement de pile', () => {
  const grand = Buffer.alloc(3 * 1024 * 1024, 7); // faux JPEG volumineux : en-tête valide, corps quelconque
  const tete = Buffer.from('ffd8ffe000104a46494600010100000100010000ffc0000b080064006401011100ffd9', 'hex');
  const jpg = Buffer.concat([tete.subarray(0, tete.length - 2), grand, tete.subarray(tete.length - 2)]).toString('base64');
  const taille = app.run('var p = Documents.imageToPdf(Utilities.base64Decode(' + JSON.stringify(jpg) + ')); p.length');
  assert.ok(taille > 3 * 1024 * 1024, 'PDF fabriqué sans erreur : ' + taille + ' octets');
});

test('doublons : même fichier déjà classé ou déjà listé, même type et même période ; envoi bloqué sans confirmation', () => {
  env.fetchHandler = (url) => { if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) return { code: 200, body: JSON.stringify({ id: 'ocr1' }) }; if (url.includes('/files/ocr1/export')) return { code: 200, body: '' }; return null; };
  const contenu = Buffer.from('%PDF-1.4 fiche de paie unique').toString('base64');
  const a1 = ok(call(T.admin, 'depotAdd', { nom: 'BENALI_Nadia_FDP_avril_2026.pdf', mime: 'application/pdf', base64: contenu }));
  assert.deepStrictEqual(a1.doublons, [], 'premier dépôt : aucun doublon');
  const a2 = ok(call(T.admin, 'depotAdd', { nom: 'copie de la fiche.pdf', mime: 'application/pdf', base64: contenu, agent_id: T.benali, type: 'fiche_emolument' }));
  assert.ok(a2.doublon_exact && /déjà dans la liste/.test(a2.doublons[0].message), 'même fichier déjà listé');
  assert.ok(ok(call(T.admin, 'depotList')).find((x) => x.id === a1.id).doublon_exact, 'signalé aussi sur le premier');
  const refus = ok(call(T.admin, 'depotValider', [a2.id]));
  assert.strictEqual(refus.valides, 0); assert.match(refus.erreurs[0].message, /Doublon exact/);
  ok(call(T.admin, 'depotRejeter', [a2.id]));
  assert.strictEqual(ok(call(T.admin, 'depotValider', [a1.id])).valides, 1, 'envoi normal une fois le doublon retiré');
  // le même fichier déposé encore après classement
  const a3 = ok(call(T.admin, 'depotAdd', { nom: 'encore.pdf', mime: 'application/pdf', base64: contenu, agent_id: T.benali, type: 'fiche_emolument' }));
  assert.ok(a3.doublon_exact && /déjà classé chez BENALI NADIA/.test(a3.doublons[0].message), 'même fichier déjà classé');
  ok(call(T.admin, 'depotUpdate', a3.id, { champs: { mois: 'avril 2026' } }));
  const forcee = ok(call(T.admin, 'depotValider', [a3.id], true));
  assert.strictEqual(forcee.valides, 1, 'envoi possible en confirmant explicitement');
  // contenu différent mais même agent, type et période
  const a4 = ok(call(T.admin, 'depotAdd', { nom: 'BENALI_Nadia_FDP_avril_2026_v2.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF autre scan').toString('base64') }));
  assert.ok(!a4.doublon_exact && a4.doublons.length && a4.doublons[0].niveau === 'periode' && /même période/.test(a4.doublons[0].message), 'avertissement de période, sans blocage');
  assert.strictEqual(ok(call(T.admin, 'depotValider', [a4.id])).valides, 1);
  // dépôt simple : avertissement
  const u = ok(call(T.admin, 'documentUpload', { agent_id: T.benali, type: 'fiche_emolument', nom: 'BENALI_Nadia_FDP_avril_2026.pdf', mime: 'application/pdf', base64: contenu }));
  assert.match(u.detecte.avertissement, /Doublon/);
  env.fetchHandler = null;
});

test('mois en abrégé et année sur 2 chiffres dans le nom du fichier (FEVR 26, JANV 26, dec 25) ; le nom prime sur le contenu', () => {
  env.fetchHandler = (url) => { if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) return { code: 200, body: JSON.stringify({ id: 'ocr1' }) }; if (url.includes('/files/ocr1/export')) return { code: 200, body: ocr }; return null; };
  const nom = (n, texte = '') => { ocr = texte; return ok(call(T.admin, 'depotAdd', { nom: n, mime: 'image/jpeg', base64: unique() })); };
  assert.strictEqual(nom('FDP KADRI SOFIANE FEVR 26 .jpg').nom_final, 'KADRI_Sofiane_FDP_Fevrier2026.jpg');
  assert.strictEqual(nom('FDP KADRI SOFIANE JANV 26 .jpg').nom_final, 'KADRI_Sofiane_FDP_Janvier2026.jpg');
  assert.strictEqual(nom('FDP KADRI SOFIANE MARS 26 .jpg').nom_final, 'KADRI_Sofiane_FDP_Mars2026.jpg');
  assert.strictEqual(nom('FDP KADRI SOFIANE dec 25.jpg').nom_final, 'KADRI_Sofiane_FDP_Decembre2025.jpg');
  const avecTexte = nom('FDP KADRI SOFIANE AVR 26.jpg', 'Date d\'entrée : juin 2025\nBulletin de paie — Période : avril 2026');
  assert.strictEqual(avecTexte.nom_final, 'KADRI_Sofiane_FDP_Avril2026.jpg', 'le mois du nom de fichier prime');
  // contenu seul : le mois de la période (mot-clé « période ») et non la première date venue
  const contenu = nom('scan_x.jpg', 'KADRI SOFIANE bulletin de paie\nEmbauché en juin 2025\nPériode : février 2026');
  assert.strictEqual(contenu.champs.mois, 'fevrier2026'); assert.match(contenu.avertissement, /lues dans le contenu/);
  env.fetchHandler = null;
});
