const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const app = loadApp();
const { call, run, env } = app;
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); return r; };

// Onglet « fiche de pointage » comme dans les classeurs du client : titre « Mois de : … », en-tête « Nom Et Prenom », jours 1..31, pied « P/… ».
function sheet(titre, personnes, nd) {
  const rows = [[], [], ['', '', '', '', '', 'FICHE DE POINTAGE'], [], [], [titre], [], ['', '', 'Mois']];
  rows.push(['Nom Et Prenom', ''].concat(Array.from({ length: 31 }, (_, i) => String(i + 1)), ['OBS', 'T']));
  rows.push(['PERSONNEL', 'FONCTION']);
  personnes.forEach(([nom, fn, jours]) => rows.push([nom, fn].concat(jours.split('').map((c) => ({ '.': '', T: 'T', R: 'R', C: 'CR', B: 'AB' }[c])).concat(Array(31 - jours.length).fill('')), ['12', '12'])));
  rows.push([], ['P/CLIENT'], []);
  return rows;
}
let n = 0;
function installFile(sheets) {
  env.fetchHandler = (url) => {
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
      const b = run('SpreadsheetApp').create('conv'); b.sheets = [];
      sheets.forEach(([name, rows]) => { const s = b.insertSheet(name); rows.forEach((r, i) => r.forEach((v, j) => { if (v !== '') s._set(i + 1, j + 1, v); })); });
      return { code: 200, body: JSON.stringify({ id: b.getId() }) };
    }
    return null;
  };
}
const file = () => ({ nom: 'pointage.xlsx', base64: Buffer.from('x' + (n += 1)).toString('base64') });

test('import du pointage : analyse (mois, regroupement des noms, cumul ignoré) puis écriture', () => {
  run("Setup.install('admin@t.fr', 'adminpw1', 'Admin')");
  const adm = ok(call(null, 'login', 'admin@t.fr', 'adminpw1')).token;
  ok(call(adm, 'agentCreate', { nom: 'Amin Boudiaf', email: 'b@t.fr', password: 'azerty12' })); // existe déjà, orthographe différente
  const t = 'T'.repeat(10) + 'R'.repeat(10) + 'B' + 'T'.repeat(9);
  installFile([
    ['Mai25', sheet('Mois de : Mai 2025', [['DUPONT MARTIN', 'Chef', t + 'T'], ['AMINE BOUDIAF', 'Technicien', 'R'.repeat(31)]])],
    ['Jui25', sheet('Mois de :Juin 2025', [['Dupont Martin', 'Chef', t], ['AMINE BOUDIAF', 'Technicien', '.'.repeat(20) + 'T'.repeat(10)], ['aBDELKADER', 'Aide', '.'.repeat(25) + 'TTTTT']])],
    ['Cumul', sheet('Mois de : Mai 2025', [['DUPONT MARTIN', 'Chef', 'T'.repeat(31)]])],
    ['Notes', [['rien']]],
  ]);
  const a = ok(call(adm, 'pointageImportAnalyser', file()));
  assert.deepStrictEqual(a.mois.map((m) => m.key), ['2025-05', '2025-06'], 'onglet Cumul ignoré, mois lus dans les titres');
  assert.strictEqual(a.personnes.length, 3, 'les variantes d\'un même nom sont regroupées');
  const bel = a.personnes.find((p) => /BOUDIAF/.test(p.nom));
  assert.strictEqual(bel.suggestion.nom, 'Amin Boudiaf', 'suggestion de l\'agent existant malgré l\'orthographe');
  const dup = a.personnes.find((p) => /DUPONT/i.test(p.nom));
  assert.strictEqual(dup.suggestion, null); assert.strictEqual(dup.mois, 2);
  assert.strictEqual(a.mois[0].lignes[0].jours[30], 'T', '31 jours en mai'); assert.strictEqual(a.mois[1].lignes[0].jours[30], '', 'juin : 30 jours');
  assert.strictEqual(a.mois[0].lignes[0].jours[20], 'ABS', 'AB lu comme ABS');
  // écriture : Boudiaf -> agent existant, Dupont -> nouvel agent, Abdelkader ignoré
  const choix = {}; a.personnes.forEach((p) => { choix[p.cle] = /BOUDIAF/.test(p.nom) ? p.suggestion.id : /DUPONT/i.test(p.nom) ? '__new' : ''; });
  const r = ok(call(adm, 'pointageImportAppliquer', { mois: a.mois, choix, mode: 'completer' }));
  assert.deepStrictEqual(Array.from(r.agents_crees), ['DUPONT MARTIN']); assert.strictEqual(r.mois, 2);
  const ag = run("Store.readTable('Agents')");
  const dupId = ag.find((x) => /DUPONT/.test(x.nom)).id; const belId = ag.find((x) => /Amin/.test(x.nom)).id;
  assert.ok(!ag.some((x) => /abdelkader/i.test(x.nom)), 'personne ignorée : aucun agent créé');
  const g = ok(call(adm, 'gridMonth', '2025-05')); const row = (id) => g.rows.find((x) => x.id === id);
  assert.deepStrictEqual([row(dupId).days[0].statut, row(dupId).days[10].statut, row(dupId).days[20].statut, row(belId).days[5].statut], ['T', 'R', 'ABS', 'R']);
  assert.strictEqual(ok(call(adm, 'gridMonth', '2025-06')).rows.find((x) => x.id === belId).days[25].statut, 'T');
  assert.ok(run("Store.listTabs()").includes('2025-06') && run("Store.listTabs()").includes('Global'));
  // « compléter » ne remplace rien ; « remplacer » le fichier l'emporte
  Object.keys(choix).forEach((c) => { if (choix[c] === '__new') choix[c] = dupId; }); // 2e import : on relie à l'agent créé
  ok(call(adm, 'pointer', { agent_id: dupId, date: '2025-05-02', statut: 'ABS' }));
  const r2 = ok(call(adm, 'pointageImportAppliquer', { mois: a.mois, choix, mode: 'completer' }));
  assert.strictEqual(r2.jours_ecrits, 0); assert.ok(r2.jours_conserves >= 1);
  assert.strictEqual(ok(call(adm, 'gridMonth', '2025-05')).rows.find((x) => x.id === dupId).days[1].statut, 'ABS');
  ok(call(adm, 'pointageImportAppliquer', { mois: a.mois, choix, mode: 'remplacer', debut: '2025-05', fin: '2025-05' }));
  assert.strictEqual(ok(call(adm, 'gridMonth', '2025-05')).rows.find((x) => x.id === dupId).days[1].statut, 'T');
  // période limitée
  assert.strictEqual(ok(call(adm, 'pointageImportAppliquer', { mois: a.mois, choix, mode: 'completer', debut: '2025-07' })).mois, 0);
});

test('import du pointage : réservé à l\'admin, erreurs lisibles', () => {
  const ag = ok(call(null, 'login', 'b@t.fr', 'azerty12')).token;
  fail(call(ag, 'pointageImportAnalyser', {}), /refusé/);
  fail(call(ag, 'pointageImportAppliquer', {}), /refusé/);
  const adm = ok(call(null, 'login', 'admin@t.fr', 'adminpw1')).token;
  installFile([['Divers', [['a', 'b'], ['c']]]]);
  fail(call(adm, 'pointageImportAnalyser', file()), /Aucun mois reconnu/);
  fail(call(adm, 'pointageImportAnalyser', { nom: 'x.pdf', base64: Buffer.from('x').toString('base64') }), /Format non pris en charge/);
  fail(call(adm, 'pointageImportAppliquer', { mois: [], choix: {} }), /Rien à importer/);
});

test('rapprochement des noms : fautes, ordre des mots, nom incomplet', () => {
  const sim = (a, b) => run(`PointageImport.similarity(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
  assert.ok(sim('WALID TEBAL', 'WALID TEBBAL') >= 0.85);
  assert.ok(sim('FARIDE OUALI', 'FARID OUALI') >= 0.85);
  assert.ok(sim('zIANI', 'TAREK ZIANI') >= 0.85);
  assert.ok(sim('OUALI FARID', 'Farid Ouali') >= 0.99);
  assert.ok(sim('MAHDI LYES', 'HOCINE AMRANI') < 0.5);
});
