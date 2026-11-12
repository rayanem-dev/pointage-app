// Import d'agents depuis une fiche RH (Excel / CSV) et fiche RH confidentielle : données fictives.
const test = require('node:test'); const assert = require('node:assert');
const { loadApp } = require('./load');
const { call, run, env } = loadApp();
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); };
const T = {};
const CSV = ['FICHE RH DES AGENTS;;;;;;;;;;;;;;;',
  "N°;Nom et prénom;Nom (arabe);Prénom (arabe);Fonction;Téléphone;E-mail;Date de naissance;Lieu de naissance;Père;Mère;Adresse;N° carte d'identité / NIN;N° sécurité sociale (CNAS);N° CCP / RIB;Situation familiale;Observations",
  '1;DURAND MARC;دوران;مارك;Ingénieur génie civil;0550000001;marc.durand@t.fr;30745;Alger;Paul;Anne;1 rue des Essais;;840000000001;1234567 Clé 11;Marié(e);RAS',
  '2;MEZIANE SOFIANE;مزيان;سفيان;Conducteur de travaux;0550000002;sofiane@t.fr;15/03/1990;Oran;Ali;Nadia;2 rue des Essais;109000000002;900000000002;7654321 Clé 22;Célibataire;',
  '3;SANS MAIL;;;Topographe;0550000003;;;;;;;;;;;',
  '4;DOUBLON MAIL;;;Topographe;;sofiane@t.fr;;;;;;;;;;',
  '5;KADRI DEJA;;;Ingénieur génie civil;0550000005;kadri@t.fr;01/01/1985;;;;;;850000000005;;;'].join('\n');
const fichier = (extra = {}) => ({ nom: 'Fiche_RH.csv', mime: 'text/csv', base64: Buffer.from(CSV).toString('base64'), ...extra });

test('import d\'agents : mise en place (contrat, fonctions, un agent déjà présent)', () => {
  run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  T.admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  run("Store.writeTable('Contrats', [{ numero: 'C-1', client: 'CLIENT TEST' }]); Store.writeTable('Fonctions', [{ contrat: 'C-1', designation: 'Ingénieurs en Génie civil', libelle: '', positions: '2', delai: '730', prix_unitaire: '1000', nature: 'personne' }, { contrat: 'C-1', designation: 'Conducteur de travaux GC', libelle: '', positions: '3', delai: '730', prix_unitaire: '900', nature: 'personne' }, { contrat: 'C-1', designation: 'Véhicule 4x4', libelle: '', positions: '1', delai: '730', prix_unitaire: '500', nature: 'vehicule' }])");
  T.kadri = ok(call(T.admin, 'agentCreate', { nom: 'KADRI DEJA', email: 'kadri@t.fr', role: 'agent', password: 'kadripw12' })).agent.id;
  T.chef = ok(call(T.admin, 'agentCreate', { nom: 'CHEF UN', email: 'chef@t.fr', role: 'chef', password: 'chefpw1234' })).agent.id;
});

test('analyse : colonnes reconnues, dates, fonction du contrat proposée, erreurs et agent existant ; rien n\'est écrit', () => {
  const avant = ok(call(T.admin, 'agentsManage')).length;
  const r = ok(call(T.admin, 'agentsImportAnalyser', fichier({ contrat: 'C-1' })));
  assert.deepStrictEqual([r.lignes.length, r.nouveaux, r.existants, r.erreurs], [5, 2, 1, 2]);
  assert.deepStrictEqual(r.colonnes.map((c) => c.cle).sort(), ['adresse', 'ccp', 'date_naissance', 'email', 'fonction', 'lieu_naissance', 'mere', 'nin', 'nom', 'nom_ar', 'nss', 'pere', 'prenom_ar', 'situation', 'telephone']);
  assert.deepStrictEqual(r.ignorees, ['Observations']);
  const [d, m, s, dbl, k] = r.lignes;
  assert.deepStrictEqual([d.nom, d.email, d.fonction, d.etat, d.fiche.date_naissance, d.fiche.nom_ar, d.fiche.nss, d.fiche.ccp], ['DURAND MARC', 'marc.durand@t.fr', 'Ingénieurs en Génie civil', 'nouveau', '1984-03-04', 'دوران', '840000000001', '1234567 Clé 11']);
  assert.deepStrictEqual([m.fonction, m.fiche.date_naissance, m.fiche.nin], ['Conducteur de travaux GC', '1990-03-15', '109000000002']);
  assert.strictEqual(s.etat, 'erreur'); assert.match(s.message, /e-mail/);
  assert.strictEqual(dbl.etat, 'erreur'); assert.match(dbl.message, /double/);
  assert.deepStrictEqual([k.etat, k.agent_id], ['existant', T.kadri]);
  assert.deepStrictEqual(r.fonctions, ['Ingénieurs en Génie civil', 'Conducteur de travaux GC'], 'les véhicules ne sont pas proposés');
  assert.strictEqual(ok(call(T.admin, 'agentsManage')).length, avant);
  // sans contrat : la fonction du fichier est gardée telle quelle
  assert.strictEqual(ok(call(T.admin, 'agentsImportAnalyser', fichier())).lignes[0].fonction, 'Ingénieur génie civil');
});

test('import : comptes créés avec contrat, fonction et responsable ; fiche RH enregistrée ; agent existant complété sans être modifié', () => {
  const r = ok(call(T.admin, 'agentsImportAnalyser', fichier({ contrat: 'C-1' })));
  env.mails.length = 0;
  const choisies = r.lignes.filter((l) => l.etat !== 'erreur');
  const x = ok(call(T.admin, 'agentsImportAppliquer', { lignes: choisies, contrat: 'C-1', chef_id: T.chef, envoyer: true }));
  assert.deepStrictEqual([x.crees.length, x.completes, x.erreurs.length], [2, 1, 0], JSON.stringify(x));
  const agents = ok(call(T.admin, 'agentsManage')); const durand = agents.find((a) => a.email === 'marc.durand@t.fr');
  assert.deepStrictEqual([durand.nom, durand.fonction, durand.contrat, durand.chef_id, durand.role], ['DURAND MARC', 'Ingénieurs en Génie civil', 'C-1', T.chef, 'agent']);
  ok(call(null, 'login', 'marc.durand@t.fr', x.crees[0].password));
  assert.ok(env.mails.some((m) => m.to === 'marc.durand@t.fr' && m.body.includes(x.crees[0].password)), 'accès envoyés par e-mail');
  const f = ok(call(T.admin, 'ficheRhGet', durand.id));
  assert.deepStrictEqual([f.telephone, f.date_naissance, f.lieu_naissance, f.pere, f.situation], ['0550000001', '1984-03-04', 'Alger', 'Paul', 'Marié(e)']);
  assert.strictEqual(ok(call(T.admin, 'ficheRhGet', T.kadri)).nss, '850000000005');
  // rejouer le même fichier : plus aucun nouveau, aucun doublon créé
  const r2 = ok(call(T.admin, 'agentsImportAnalyser', fichier({ contrat: 'C-1' })));
  assert.deepStrictEqual([r2.nouveaux, r2.existants], [0, 3]);
});

test('import : fonction hors contrat refusée ligne par ligne, les autres passent', () => {
  const csv = 'Nom et prénom;E-mail;Fonction\nBON AGENT;bon@t.fr;Conducteur de travaux GC\nMAUVAIS POSTE;mauvais@t.fr;Plombier';
  const r = ok(call(T.admin, 'agentsImportAnalyser', { nom: 'a.csv', base64: Buffer.from(csv).toString('base64'), contrat: 'C-1' }));
  assert.strictEqual(r.lignes[1].fonction, ''); assert.match(r.lignes[1].message, /non trouvée au contrat/);
  r.lignes[1].fonction = 'Plombier';
  const x = ok(call(T.admin, 'agentsImportAppliquer', { lignes: r.lignes, contrat: 'C-1' }));
  assert.deepStrictEqual([x.crees.length, x.erreurs.length], [1, 1]); assert.match(x.erreurs[0].message, /non prévue au contrat/);
});

test('fiche RH : modifiable par l\'administrateur, invisible pour le responsable d\'équipe et l\'agent', () => {
  const f = ok(call(T.admin, 'ficheRhSave', T.kadri, { telephone: '0660 00 00 00', date_naissance: '1985-01-01', situation: 'Marié(e)', inconnu: 'x' }));
  assert.deepStrictEqual([f.telephone, f.date_naissance, f.nss, f.inconnu], ['0660 00 00 00', '1985-01-01', '', undefined], 'la saisie à la main remplace toute la fiche');
  const tc = ok(call(null, 'login', 'chef@t.fr', 'chefpw1234')).token; const tk = ok(call(null, 'login', 'kadri@t.fr', 'kadripw12')).token;
  for (const t of [tc, tk]) { fail(call(t, 'ficheRhGet', T.kadri), /./); fail(call(t, 'ficheRhSave', T.kadri, {}), /./); fail(call(t, 'agentsImportAnalyser', fichier()), /./); fail(call(t, 'agentsImportAppliquer', { lignes: [{ nom: 'X', email: 'x@t.fr' }] }), /./); }
  assert.ok(!JSON.stringify(ok(call(tc, 'agentsManage'))).includes('0660 00 00 00'), 'aucune donnée RH dans la liste des agents');
});

test('fichier sans tableau d\'agents : message clair', () => {
  fail(call(T.admin, 'agentsImportAnalyser', { nom: 'x.csv', base64: Buffer.from('a;b\n1;2').toString('base64') }), /Aucun tableau d'agents/);
  fail(call(T.admin, 'agentsImportAnalyser', { nom: 'x.pdf', base64: Buffer.from('x').toString('base64') }), /Format non pris en charge/);
});
