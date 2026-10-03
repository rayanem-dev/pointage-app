const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); return r; };
const src = loadApp(); const dst = loadApp();
const S = {};

test('source : contrat, fonctions, agents, pointages, quantités et attachement validé', () => {
  src.run("Setup.install('admin@src.fr', 'adminpw1', 'Admin')");
  S.tk = ok(src.call(null, 'login', 'admin@src.fr', 'adminpw1')).token;
  ok(src.call(S.tk, 'setupSave', { prestataire_nom: 'SARL SOURCE', client_nom: 'ENERGIE DU SUD', jours_travail: '14', jours_repos: '14' }));
  ok(src.call(S.tk, 'contratsSave', { contrats: [{ numero: 'I/24/TEST', client: 'ENERGIE DU SUD', objet: 'Objet', ref_mois: '2026-05', ref_attachement: 3 }], fonctions: [
    { contrat: 'I/24/TEST', designation: 'Technicien', libelle: 'Technicien', positions: 2, delai: 540, prix_unitaire: 14000, qte_precedente_ref: 100 },
    { contrat: 'I/24/TEST', designation: 'Pick-up', libelle: 'Pick-up', positions: 1, delai: 540, prix_unitaire: 9000, qte_precedente_ref: 0, nature: 'vehicule' }] }));
  const a = ok(src.call(S.tk, 'agentCreate', { nom: 'DUPONT MARTIN', email: 'dupont@src.fr', password: 'pwpwpw12', fonction: 'Technicien', contrat: 'I/24/TEST', affectation: 'Hassi', rotation: '6/2' })).agent;
  const v = ok(src.call(S.tk, 'agentCreate', { nom: '123-456 Toyota', type: 'vehicule', fonction: 'Pick-up', contrat: 'I/24/TEST' })).agent;
  ok(src.call(S.tk, 'agentCreate', { nom: 'AUTRE SANS CONTRAT', email: 'autre@src.fr', password: 'pwpwpw12' }));
  ok(src.call(S.tk, 'pointer', { agent_id: a.id, date: '2026-05-04', date_fin: '2026-05-10', statut: 'T' }));
  ok(src.call(S.tk, 'pointer', { agent_id: a.id, date: '2026-06-01', statut: 'ABS' }));
  ok(src.call(S.tk, 'pointer', { agent_id: v.id, date: '2026-05-04', date_fin: '2026-05-05', statut: 'T' }));
  ok(src.call(S.tk, 'attachementQte', { contrat: 'I/24/TEST', mois: '2026-05', designation: 'Technicien', qte_mois: 7 }));
  ok(src.call(S.tk, 'attachementValider', { month: '2026-05', contrat: 'I/24/TEST' }));
});

test('export : modèle (contrat + dépendances + mois), sans mots de passe ; classeur Excel', () => {
  const m = JSON.parse(JSON.stringify(src.run("Archive.model({ contrat: 'I/24/TEST' })")));
  assert.deepStrictEqual(m.agents.map((x) => x.nom).sort(), ['123-456 Toyota', 'DUPONT MARTIN'], 'agents du contrat seulement');
  assert.deepStrictEqual([m.contrats.length, m.fonctions.length, m.attachements.length, m.valides.length], [1, 2, 1, 1]);
  assert.deepStrictEqual(m.mois.map((x) => x.key), ['2026-05', '2026-06'], 'mois pointés seulement');
  assert.ok(m.params.prestataire_nom === 'SARL SOURCE' && !('password_hash' in m.agents[0]) && !JSON.stringify(m).includes('password'));
  const solo = JSON.parse(JSON.stringify(src.run("Archive.model({ contrat: '', dependances: false, debut: '2026-06' })")));
  assert.deepStrictEqual([solo.contrats.length, solo.valides.length, solo.mois.length, solo.agents.length], [0, 0, 1, 3], 'sans dépendances, période limitée, tous les agents');
  const sheets = JSON.parse(JSON.stringify(src.run("Archive.toSheets(Archive.model({ contrat: 'I/24/TEST' }))")));
  assert.deepStrictEqual(sheets.map((x) => x.name), ['Lisez-moi', 'Contrat', 'Fonctions', 'Agents', 'Attachements', 'AttachementsValides', 'Params', '2026-05', '2026-06']);
  const fich = ok(src.call(S.tk, 'pointageExport', { contrat: 'I/24/TEST' })); assert.match(fich.nom, /^Pointage_I_24_TEST_2026-05_a_2026-06\.xlsx$/); assert.ok(fich.base64);
  fail(src.call(S.tk, 'pointageExport', { contrat: 'INCONNU' }), /introuvable/);
  S.sheets = sheets;
  const ag = ok(src.call(null, 'login', 'admin@src.fr', 'adminpw1')); const chef = ok(src.call(S.tk, 'agentCreate', { nom: 'CHEF X', email: 'chefx@src.fr', password: 'pwpwpw12', role: 'agent' })).agent;
  const t = ok(src.call(null, 'login', 'chefx@src.fr', 'pwpwpw12')).token; fail(src.call(t, 'pointageExport', {}), /refusé/);
});

function installFile(app, sheets) {
  app.env.fetchHandler = (url) => {
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
      const b = app.run('SpreadsheetApp').create('conv'); b.sheets = [];
      sheets.forEach(({ name, rows }) => { const s = b.insertSheet(name); rows.forEach((r, i) => r.forEach((v, j) => { if (v !== '' && v != null) s._set(i + 1, j + 1, v); })); });
      return { code: 200, body: JSON.stringify({ id: b.getId() }) };
    }
    return null;
  };
}

test('import : l\'archive est reconnue (contrat, prix, agents) puis restaurée dans un classeur vierge', () => {
  dst.run("Setup.install('admin@dst.fr', 'adminpw1', 'Admin')");
  const tk = ok(dst.call(null, 'login', 'admin@dst.fr', 'adminpw1')).token;
  installFile(dst, S.sheets);
  const a = ok(dst.call(tk, 'pointageImportAnalyser', { nom: 'export.xlsx', base64: Buffer.from('x').toString('base64') }));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.archive.resume)), { contrats: 1, fonctions: 2, agents: 2, attachements: 1, valides: 1, params: a.archive.resume.params });
  assert.deepStrictEqual(a.mois.map((m) => m.key), ['2026-05', '2026-06']); assert.strictEqual(a.personnes.length, 2);
  assert.ok(a.avertissements.every((w) => !/Contrat|Fonctions|Agents|Params/.test(w)), 'les onglets de données ne sont pas signalés comme ignorés');
  const dup = a.personnes.find((p) => /DUPONT/.test(p.nom)); assert.strictEqual(dup.info.rotation, '6/2'); assert.strictEqual(dup.info.contrat, 'I/24/TEST');
  const choix = {}; a.personnes.forEach((p) => { choix[p.cle] = '__new'; });
  const r = ok(dst.call(tk, 'pointageImportAppliquer', { mois: a.mois, choix, mode: 'completer', archive: a.archive, reprendre: { contrat: true, attachements: true, quantites: true, params: false } }));
  assert.deepStrictEqual([r.dependances.contrats, r.dependances.fonctions, r.dependances.quantites, r.dependances.valides, r.dependances.params], [1, 2, 1, 1, 0]);
  assert.strictEqual(r.agents_crees.length, 2); assert.strictEqual(r.identifiants.length, 1, 'mot de passe fourni pour la personne (pas pour le véhicule)');
  assert.deepStrictEqual([r.identifiants[0].email, r.identifiants[0].password.length >= 8], ['dupont@src.fr', true]);
  const T = (n) => JSON.parse(JSON.stringify(dst.run(`Store.readTable('${n}')`)));
  assert.strictEqual(T('Contrats')[0].numero, 'I/24/TEST');
  const fn = T('Fonctions'); assert.deepStrictEqual([fn.length, fn.find((f) => f.designation === 'Technicien').prix_unitaire, fn.find((f) => f.designation === 'Pick-up').nature], [2, '14000', 'vehicule']);
  assert.strictEqual(T('Attachements')[0].qte_mois, '7'); assert.strictEqual(T('AttachementsValides')[0].statut, 'valide');
  const ag = T('Agents'); const d = ag.find((x) => x.nom === 'DUPONT MARTIN'); const v = ag.find((x) => x.nom === '123-456 Toyota');
  assert.deepStrictEqual([d.fonction, d.contrat, d.affectation, d.rotation, v.type, v.contrat], ['Technicien', 'I/24/TEST', 'Hassi', '6/2', 'vehicule', 'I/24/TEST']);
  assert.ok(!ag.some((x) => /AUTRE SANS/.test(x.nom)), 'agent hors contrat non exporté');
  const g = ok(dst.call(tk, 'gridMonth', '2026-05')); const row = g.rows.find((x) => x.nom === 'DUPONT MARTIN');
  assert.deepStrictEqual([row.days[3].statut, row.days[9].statut, row.days[10].statut], ['T', 'T', '']);
  assert.strictEqual(ok(dst.call(tk, 'gridMonth', '2026-06')).rows.find((x) => x.nom === 'DUPONT MARTIN').days[0].statut, 'ABS');
  // l'attachement validé importé est consultable tel quel (copie figée) ; un 2e import ne casse rien
  assert.strictEqual(ok(dst.call(tk, 'attachementPreview', '2026-05', 'I/24/TEST')).statut, 'valide');
  const choix2 = {}; a.personnes.forEach((p) => { choix2[p.cle] = ag.find((x) => x.nom === p.nom).id; });
  const r2 = ok(dst.call(tk, 'pointageImportAppliquer', { mois: a.mois, choix: choix2, mode: 'completer', archive: a.archive, reprendre: { contrat: true, attachements: true, quantites: true, params: true } }));
  assert.strictEqual(r2.jours_ecrits, 0); assert.strictEqual(r2.agents_crees.length, 0); assert.strictEqual(dst.run("Params.get().client_nom"), 'ENERGIE DU SUD', 'paramètres repris sur demande');
});

test('import : un attachement déjà facturé dans la destination n\'est pas écrasé', () => {
  const tk = ok(dst.call(null, 'login', 'admin@dst.fr', 'adminpw1')).token;
  dst.run("(function(){ var v = Store.readTable('AttachementsValides'); v[0].statut = 'facture'; v[0].facture_numero = 'F-1'; Store.writeTable('AttachementsValides', v); })()");
  const arch = JSON.parse(JSON.stringify(dst.call(tk, 'pointageImportAnalyser', { nom: 'export.xlsx', base64: Buffer.from('y').toString('base64') }).data.archive));
  const r = ok(dst.call(tk, 'pointageImportAppliquer', { mois: [], choix: {}, archive: arch, reprendre: { attachements: true } }));
  assert.strictEqual(r.dependances.valides, 0); assert.match(r.dependances.ignores[0], /déjà facturé/);
  assert.strictEqual(JSON.parse(JSON.stringify(dst.run("Store.readTable('AttachementsValides')")))[0].facture_numero, 'F-1');
});
