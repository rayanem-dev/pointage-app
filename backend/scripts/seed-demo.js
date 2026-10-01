// Données de démonstration : reprend la fiche d'août 2026, le contrat et l'attachement N°16 fournis en exemple.
// Usage : STORAGE=local npm run seed   (ou avec STORAGE=sheets pour remplir la vraie base)
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const agents = require('../src/services/agents');
const pointage = require('../src/services/pointage');
const cs = require('../src/services/contrats');
const { setParams, getParams } = require('../src/services/params');

const CONTRAT = 'I/24/RNS-INFRA/2025';
const rows = [
  ['RAYANE REDHA MADANI', 'Préparateur', 'R8T23', 'chef'],
  ['KRIBIA MOHAMMED LAMINE', 'Ingénieur génie civil', 'T8R21T2'],
  ['ADNANE ABDELMOUMEN', 'Ingénieur génie civil', 'T22R9'],
  ['HAMIDI AHCENE', 'Conducteur /T G.civil', 'T21R10'],
  ['BELHEINE TADJ EDDINE', 'Ingénieur génie civil', 'T25R6'],
  ['AZEGGAGH LOUCIF', 'Ingénieur génie civil', 'T12R19'],
  ['TOUAHRI ABDELLATIF', 'Conducteur /T G.civil', 'R3T21R7'],
  ['ZERROUKI AREZKI', 'Conducteur /T G.civil', 'R18T13'],
  ['CHAREF KAMEL', 'Conducteur /T G.civil', 'R14T17'],
  ['CHOAYB LACHI', 'Préparateur', 'R8T23'],
  ['MEZROUA ABDELDJALIL', 'Métreur Vérificateur', 'R18T13'],
  ['BENRITAB ABDESSLAM', 'Métreur Vérificateur', 'T15R16'],
];

(async () => {
  await agents.ensureAdmin();
  await setParams({ societe_rc: '99 B 0602020', societe_nis: '099833060726914', societe_nif: '099933060202019', societe_ai: '33060000925 / BP N°: 2000203717', societe_rib: '002 00092 9209260504 74', societe_contact: 'Tél / Fax: 044 44 60 50 / 044 44 60 90 / 044 44 60 51' });
  await cs.saveContrats([{ numero: CONTRAT, client: 'SONATRACH Division Production Direction Régionale Rhourde Nouss', objet: "Prestations d'accompagnement à l'étude d'engineering de contrôle de qualité des travaux et suivi des projets de la Direction Régionale de Rhourde Nouss.", date_contrat: '30/03/2025', ref_mois: '2026-08', ref_attachement: 16, rep_prestataire: 'ZERGAT. M', rep_client: 'DP RNS' }]);
  await cs.saveFonctions([
    { contrat: CONTRAT, designation: 'Ingénieur Génie civil', libelle: 'Ingénieur génie civil', positions: 2, delai: 540, prix_unitaire: 18500, qte_precedente_ref: 914 },
    { contrat: CONTRAT, designation: 'Conducteur travaux en génie civil', libelle: 'Conducteur /T G.civil', positions: 2, delai: 540, prix_unitaire: 16500, qte_precedente_ref: 914 },
    { contrat: CONTRAT, designation: 'Métreur vérificateur', libelle: 'Métreur Vérificateur', positions: 1, delai: 540, prix_unitaire: 16500, qte_precedente_ref: 457 },
    { contrat: CONTRAT, designation: 'Préparateur', libelle: 'Préparateur', positions: 1, delai: 540, prix_unitaire: 17500, qte_precedente_ref: 457 },
  ]);
  const created = [];
  let chefId = '';
  for (const [nom, fonction, plan, role] of rows) {
    const email = `${nom.split(' ').slice(-1)[0].toLowerCase()}@demo.local`;
    const { agent } = await agents.create({ nom, fonction, affectation: 'Rhourde Nouss', contrat: CONTRAT, email, role: role || 'agent', password: 'demo1234', chef_id: role ? '' : chefId });
    if (role === 'chef') chefId = agent.id;
    created.push([agent, plan]);
  }
  // le chef de groupe encadre aussi les autres (créés avant lui → on les rattache)
  for (const [a] of created) if (a.role !== 'chef') await agents.update(a.id, { chef_id: chefId });
  for (const [a, plan] of created) {
    let day = 1;
    for (const m of plan.matchAll(/([TR])(\d+)/g)) {
      const n = Number(m[2]);
      await pointage.setStatus({ agentId: a.id, from: `2026-08-${String(day).padStart(2, '0')}`, to: `2026-08-${String(day + n - 1).padStart(2, '0')}`, statut: m[1] });
      day += n;
    }
  }
  const p = await getParams();
  console.log(`Démo prête : ${created.length} agents, août 2026. Rotation ${p.jours_travail}/${p.jours_repos}.`);
  console.log('Connexion chef : madani@demo.local / demo1234 — admin : ' + (process.env.ADMIN_EMAIL || 'admin@acosco.local'));
})().catch((e) => { console.error(e); process.exit(1); });
