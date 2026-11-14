// Documents RH préremplis (certificat de travail, attestation de travail, titre de congé) : personnes et société fictives.
const test = require('node:test'); const assert = require('node:assert');
const { loadApp } = require('./load');
const { call, run, env } = loadApp();
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); };
const T = {};

test('mise en place : société, agent avec fiche RH, responsable avec et sans le droit', () => {
  run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  run("Params.set({ prestataire_nom: 'SARL DEMO', prestataire_adresse: 'BP 1 VILLE TEST', prestataire_ville: 'Ville Test', prestataire_employeur: '1234567890' })");
  T.admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  T.chef = ok(call(T.admin, 'agentCreate', { nom: 'CHEF AUTORISE', email: 'ca@t.fr', role: 'chef', password: 'chefpw1234', acces_rh: true })).agent;
  T.chef2 = ok(call(T.admin, 'agentCreate', { nom: 'CHEF SIMPLE', email: 'cs@t.fr', role: 'chef', password: 'chefpw1234' })).agent;
  assert.deepStrictEqual([T.chef.acces_rh, T.chef2.acces_rh], ['1', '0']);
  T.ag = ok(call(T.admin, 'agentCreate', { nom: 'DURAND Marc Antoine', email: 'md@t.fr', role: 'agent', password: 'agentpw123', fonction: 'Ingénieur', chef_id: T.chef.id, date_entree: '2025-05-01' })).agent;
  T.autre = ok(call(T.admin, 'agentCreate', { nom: 'AUTRE Equipe', email: 'ae@t.fr', role: 'agent', password: 'agentpw123', chef_id: T.chef2.id })).agent;
  ok(call(T.admin, 'ficheRhSave', T.ag.id, { date_naissance: '1984-03-04', lieu_naissance: 'Ville Test', nss: '840000000001' }));
  T.tc = ok(call(null, 'login', 'ca@t.fr', 'chefpw1234')).token; T.tc2 = ok(call(null, 'login', 'cs@t.fr', 'chefpw1234')).token; T.ta = ok(call(null, 'login', 'md@t.fr', 'agentpw123')).token;
});

test('certificat de travail : champs préremplis depuis l\'agent et sa fiche RH, PDF rangé et nommé', () => {
  const d = ok(call(T.admin, 'modeleDonnees', { agent_id: T.ag.id, type: 'certificat_travail' }));
  assert.deepStrictEqual([d.champs.nom, d.champs.prenom, d.champs.date_naissance, d.champs.lieu_naissance, d.champs.nss, d.champs.fonction, d.champs.date_debut, d.champs.ville, d.champs.qualite], ['DURAND', 'Marc Antoine', '1984-03-04', 'VILLE TEST', '840000000001', 'INGÉNIEUR', '2025-05-01', 'Ville Test', 'Gérant']);
  assert.deepStrictEqual(d.manque, []);
  fail(call(T.admin, 'modeleGenerer', { agent_id: T.ag.id, type: 'certificat_travail', champs: d.champs }), /date de fin/);
  const champs = { ...d.champs, date_fin: '2026-10-31', date_doc: '2026-11-01', numero: '12/2026' };
  const h = ok(call(T.admin, 'modeleApercu', { agent_id: T.ag.id, type: 'certificat_travail', champs })).html;
  for (const t of ['Certificat de Travail', 'Nous soussignés Gérant de la SARL DEMO Sise à BP 1 VILLE TEST', 'DURAND', 'Marc Antoine', '04-03-1984', '840000000001', '01-05-2025', '31-10-2026', 'Fait à Ville Test le : 01-11-2026', "N° D'EMPLOYEUR : 1234567890", 'N° : 12/2026']) assert.ok(h.includes(t), t);
  const r = ok(call(T.admin, 'modeleGenerer', { agent_id: T.ag.id, type: 'certificat_travail', champs }));
  assert.deepStrictEqual([r.document.type, r.document.nom_original], ['certificat_travail', 'DURAND_Marc-Antoine_CertificatTravail_2026-11-01.pdf']);
  assert.ok(ok(call(T.ta, 'documentsList')).some((x) => x.id === r.document.id), 'l\'agent trouve le document dans son espace');
});

test('attestation de travail : « à ce jour », accord féminin, balises neutralisées', () => {
  const d = ok(call(T.admin, 'modeleDonnees', { agent_id: T.ag.id, type: 'attestation_travail' }));
  const h = ok(call(T.admin, 'modeleApercu', { agent_id: T.ag.id, type: 'attestation_travail', champs: { ...d.champs, civilite: 'Madame', fonction: '<b>CHEF</b>' } })).html;
  assert.ok(h.includes('Attestation de Travail') && h.includes('à ce jour.') && h.includes('Est employée') && h.includes('atteste par la présente que'));
  assert.ok(h.includes('&lt;b&gt;CHEF&lt;/b&gt;') && !h.includes('<b>CHEF</b>'));
  assert.strictEqual(ok(call(T.admin, 'modeleGenerer', { agent_id: T.ag.id, type: 'attestation_travail', champs: { ...d.champs, date_doc: '2026-05-04' } })).document.nom_original, 'DURAND_Marc-Antoine_AttestationTravail_2026-05-04.pdf');
});

test('titre de congé : dates reprises de la demande, reprise et jours calculés, détail du droit, document proposé à la clôture', () => {
  const dem = ok(call(T.ta, 'demandeCreate', { type: 'titre_conge', date_debut: '2026-09-21', date_fin: '2026-10-18' }));
  const d = ok(call(T.tc, 'modeleDonnees', { agent_id: T.ag.id, type: 'titre_conge', demande_id: dem.id }));
  assert.deepStrictEqual([d.champs.date_debut, d.champs.date_fin, d.champs.reprise, d.champs.jours, d.champs.nature], ['2026-09-21', '2026-10-18', '2026-10-19', '28', 'Congé de récupération']);
  const champs = { ...d.champs, destination: 'VILLE TEST', date_doc: '2026-09-20', jours_presence: '28', droit: '28', relicat: '3', derniere_reprise: '2026-08-24' };
  const h = ok(call(T.tc, 'modeleApercu', { agent_id: T.ag.id, type: 'titre_conge', champs })).html;
  for (const t of ['Titre de congé', 'DURAND Marc Antoine', '21/09/2026', '18/10/2026', '19/10/2026', 'Détail calcul du droit de congé', 'Total droit :</td><td><b>31</b>', 'Reste :</td><td><b>3</b>', '24/08/2026']) assert.ok(h.includes(t), t);
  ok(call(T.tc, 'demandeRepondre', dem.id, 'acceptee', ''));
  const avant = ok(call(T.tc, 'demandesList')).toHandle.find((x) => x.id === dem.id);
  assert.deepStrictEqual([avant.modele, avant.doc_propose], ['titre_conge', null]);
  const r = ok(call(T.tc, 'modeleGenerer', { agent_id: T.ag.id, type: 'titre_conge', champs }));
  assert.strictEqual(r.document.nom_original, 'TC_DURAND_Marc-Antoine_2026-09-21.pdf');
  assert.strictEqual(ok(call(T.tc, 'demandesList')).toHandle.find((x) => x.id === dem.id).doc_propose.id, r.document.id, 'le titre établi est proposé à la clôture');
});

test('droits : responsable sans la case, agent, et agent d\'une autre équipe refusés', () => {
  for (const fn of ['modeleDonnees', 'modeleApercu', 'modeleGenerer']) { fail(call(T.tc2, fn, { agent_id: T.autre.id, type: 'attestation_travail', champs: {} }), /Réservé/); fail(call(T.ta, fn, { agent_id: T.ag.id, type: 'attestation_travail' }), /./); }
  fail(call(T.tc, 'modeleDonnees', { agent_id: T.autre.id, type: 'attestation_travail' }), /pas dans votre groupe/);
  fail(call(T.admin, 'modeleDonnees', { agent_id: T.ag.id, type: 'contrat' }), /Type de document invalide/);
  // la case est retirée quand le responsable redevient agent
  ok(call(T.admin, 'agentUpdate', T.chef.id, { role: 'agent' })); assert.strictEqual(ok(call(T.admin, 'agentsManage')).find((x) => x.id === T.chef.id).acces_rh, '0');
});
