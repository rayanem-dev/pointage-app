// Scénario commun aux deux versions (Apps Script simulé en Node et PHP / MySQL) : mêmes appels, résultats comparés par diff.js.
// Un pas : { as: 'admin'|'karim'|'samir'|'amine'|'client'|null, name, args, save: { variable: 'chemin.dans.la.reponse' }, rec: true (résultat comparé) }.
// Dans les arguments, { $: 'variable.chemin' } est remplacé par une valeur sauvegardée.
const C = 'I/24/DEMO-SRV/2025';
const steps = [];
const S = (as, name, args = [], extra = {}) => steps.push({ as, name, args, ...extra });
S(null, '$install', ['admin@demo.local', 'admin1234', 'Administrateur']);
S('admin', 'setupSave', [{ prestataire_nom: 'SARL HORIZON SERVICES', direction_nom: 'Direction RH', direction_email: 'direction@client.dz', prestataire_ville: 'Hassi Demo', prestataire_capital: '10 000 000,00 DA', client_entete: 'DIRECTION RÉGIONALE\nHASSI DEMO', signature_client: 'P/ENERGIE DU SUD', signature_prestataire: 'le prestataire SARL HORIZON SERVICES' }], { rec: true });
S('admin', 'contratsSave', [{
  contrats: [{ numero: C, client: 'ENERGIE DU SUD Division Production Direction Régionale Hassi Demo', objet: 'Mise à disposition de personnel et de véhicules pour les opérations de maintenance du site', date_contrat: '15/01/2025', ref_mois: '2026-08', ref_attachement: 9, rep_prestataire: '', rep_client: 'DP DEMO' }],
  fonctions: [
    { contrat: C, designation: 'Technicien Électricien', libelle: 'Technicien électricien', positions: 2, delai: 540, prix_unitaire: 14000, qte_precedente_ref: 600 },
    { contrat: C, designation: 'Soudeur qualifié', libelle: 'Soudeur', positions: 2, delai: 540, prix_unitaire: 12500, qte_precedente_ref: 600 },
    { contrat: C, designation: 'Chauffeur poids lourd', libelle: 'Chauffeur poids lourd', positions: 1, delai: 540, prix_unitaire: 12500, qte_precedente_ref: 300 },
    { contrat: C, designation: 'Magasinier', libelle: 'Magasinier', positions: 1, delai: 540, prix_unitaire: 9500, qte_precedente_ref: 300 },
    { contrat: C, designation: 'Véhicule utilitaire 4x4', libelle: 'Utilitaire 4x4', positions: 2, delai: 540, prix_unitaire: 7500, qte_precedente_ref: 0, nature: 'vehicule' }],
}], { rec: true });
const rows = [['KARIM BENSALEM', 'Magasinier', 'R8T23', 'chef'], ['SAMIR HAMLAOUI', 'Technicien électricien', 'T8R21T2'], ['NADIR CHERIF', 'Technicien électricien', 'T22R9'], ['YACINE MEZIANE', 'Soudeur', 'T21R10'], ['AMINE BOUDIAF', 'Technicien électricien', 'T25R6'], ['WALID TEBBAL', 'Technicien électricien', 'T12R19'], ['SOFIANE LAKHDARI', 'Soudeur', 'R3T21R7'], ['RACHID BELKACEM', 'Soudeur', 'R18T13'], ['HOCINE AMRANI', 'Soudeur', 'R14T17'], ['FARID OUALI', 'Magasinier', 'R8T23'], ['LYES MAHDI', 'Chauffeur poids lourd', 'R18T13'], ['TAREK ZIANI', 'Chauffeur poids lourd', 'T15R16']];
S('admin', 'agentCreate', [{ nom: rows[0][0], fonction: rows[0][1], email: 'karim@demo.local', role: 'chef', contrat: C, affectation: 'Hassi Demo', password: 'demo1234' }], { save: { chef: 'agent.id' }, rec: true });
S('admin', 'agentCreate', [{ nom: 'Client Énergie du Sud (veille)', email: 'client@demo.local', role: 'client', contrat: C, password: 'demo1234' }], { rec: true });
S('admin', 'contratsGet', [], { save: { cg: '' } });
S('admin', 'contratsSave', [{ $merge: [{ $: 'cg' }, { contrats: [{ $patch: 'cg.contrats.0', date_debut: '2025-02-01', duree_mois: '24', client_email: 'client@demo.local' }] }] }], { rec: true });
const ids = { [rows[0][0]]: { $: 'chef' } };
rows.slice(1).forEach(([nom, fonction], i) => S('karim', 'agentCreate', [{ nom, fonction, email: `${nom.split(' ').slice(-1)[0].toLowerCase()}@demo.local`, contrat: C, affectation: 'Hassi Demo', password: 'demo1234' }], { save: { ['a' + (i + 1)]: 'agent.id' }, rec: true }));
rows.forEach(([nom, , plan], idx) => {
  let day = 1; const idRef = idx === 0 ? { $: 'chef' } : { $: 'a' + idx };
  for (const m of plan.matchAll(/([TR])(\d+)/g)) { const n = Number(m[2]); const pad = (x) => String(x).padStart(2, '0'); S('karim', 'pointer', [{ agent_id: idRef, date: `2026-08-${pad(day)}`, date_fin: `2026-08-${pad(day + n - 1)}`, statut: m[1] }], { rec: idx < 2 }); day += n; }
});
S('samir', 'demandeCreate', [{ type: 'titre_conge', date_debut: '2026-10-25', date_fin: '2026-11-22', message: 'Retour famille' }], { save: { d1: 'id' }, rec: true });
S('samir', 'demandeCreate', [{ type: 'attestation_cnas', message: 'Pour dossier CNAS' }], { save: { d2: 'id' }, rec: true });
S('amine', 'demandeCreate', [{ type: 'titre_conge', message: '' }], { save: { d3: 'id' }, rec: true });
S('amine', 'demandeCreate', [{ type: 'fiche_emolument', message: 'Septembre' }], { save: { d4: 'id' }, rec: true });
// ----- lectures par profil -----
for (const who of ['admin', 'karim', 'samir', 'client']) {
  S(who, 'me', [], { rec: true }); S(who, 'params', [], { rec: true }); S(who, 'badges', [], { rec: who !== 'admin' || true });
  S(who, 'gridMonth', ['2026-08'], { rec: true }); S(who, 'gridMonth', ['2026-10'], { rec: true }); S(who, 'gridPeriod', ['2026-08', 3], { rec: true }); S(who, 'gridPeriod', ['2026-07', 12, '', false], { rec: true });
  if (who !== 'client') { S(who, 'overview', ['2026-08'], { rec: true }); S(who, 'demandesList', [], { rec: true }); S(who, 'documentsList', [], { rec: true }); }
  S(who, 'contratsSynthese', [], { rec: who !== 'karim' });
  S(who, 'changelogMoi', [], { rec: false });
}
S('admin', 'agentsManage', [], { rec: true }); S('karim', 'agentsManage', [], { rec: true }); S('admin', 'agentsVisible', [false], { rec: true }); S('karim', 'agentsVisible', [true], { rec: true });
S('admin', 'contratsGet', [], { rec: true }); S('admin', 'contratsLite', [], { rec: true }); S('admin', 'setupGet', [], { rec: true }); S('admin', 'moisList', [], { rec: true });
S('admin', 'attachementPreview', ['2026-08', C], { rec: true }); S('admin', 'attachementPreview', ['2026-09', C], { rec: true }); S('admin', 'ficheApercu', [{ month: '2026-08', contrat: C }], { rec: true });
// ----- pointage : compléter, prévisions -----
S('karim', 'pointerCompleter', [{ tous: true, to: '2026-09-10', mode: 'meme', apercu: true }], { rec: true });
S('karim', 'pointerCompleter', [{ tous: true, to: '2026-09-10', mode: 'rotation' }], { rec: true });
S('admin', 'gridMonth', ['2026-09'], { rec: true }); S('samir', 'overview', ['2026-09'], { rec: true });
S('karim', 'pointer', [{ agent_id: { $: 'a1' }, date: '2026-09-05', statut: 'ABS' }], { rec: true }); S('samir', 'gridMonth', ['2026-09'], { rec: true });
S('karim', 'pointer', [{ agent_id: { $: 'a1' }, date: '2026-09-05', statut: '' }], { rec: true });
S('samir', 'remarqueAdd', [{ agent_id: { $: 'a1' }, date: '2026-09-05', texte: 'Je conteste ce jour' }], { rec: true });
S('karim', 'gridMonth', ['2026-09'], { rec: true });
// ----- demandes : cycle complet -----
S('karim', 'demandesList', [], { rec: true });
S('karim', 'demandeRepondre', [{ $: 'd1' }, 'acceptee', 'OK'], { rec: true });
S('karim', 'demandeModifier', [{ $: 'd1' }, { message: 'Retour famille (modifié)' }], { rec: true });
S('karim', 'demandeReouvrir', [{ $: 'd1' }], { rec: true });
S('karim', 'demandeRepondre', [{ $: 'd1' }, 'acceptee', ''], { rec: true });
S('karim', 'demandesEnvoyer', [null, 'Merci'], { save: { e1: 'envoi.id' }, rec: true });
S('karim', 'demandesList', [], { rec: true }); S('admin', 'demandesList', [], { rec: true }); S('samir', 'demandesList', [], { rec: true });
S('karim', 'demandeReponseDirection', [{ $: 'd1' }, 'acceptee', 'Accordé'], { rec: true });
S('karim', 'envoiTraiter', [{ $: 'e1' }, 'traitee', 'Reste traité'], { rec: true });
S('karim', 'demandeDocuments', [{ $: 'd1' }], { rec: true });
S('karim', 'demandeCloturer', [{ $: 'd2' }, null], { rec: true, expectError: true });
S('karim', 'demandeAnnulerCloture', [{ $: 'd1' }], { rec: true });
S('samir', 'demandeSupprimer', [{ $: 'd1' }], { rec: true, expectError: true });
S('samir', 'demandeCreate', [{ type: 'contrat', message: 'x' }], { save: { d5: 'id' }, rec: true });
S('samir', 'demandeSupprimer', [{ $: 'd5' }], { rec: true });
// ----- attachement / facture -----
S('admin', 'attachementValider', [{ month: '2026-08', contrat: C }], { rec: true });
S('admin', 'attachementPreview', ['2026-09', C], { rec: true });
S('admin', 'attachementFacturer', [{ month: '2026-08', contrat: C, facture_numero: 'F-001', date: '2026-08-31' }], { rec: true });
S('admin', 'contratsSynthese', [], { rec: true }); S('client', 'contratsSynthese', [], { rec: true });
S('admin', 'attachementRouvrir', [{ month: '2026-08', contrat: C }], { rec: true, expectError: true });
// ----- compte, mot de passe, erreurs attendues -----
S('samir', 'passwordOwn', ['demo1234', 'nouveau123'], { rec: true });
S(null, 'login', ['hamlaoui@demo.local', 'demo1234'], { rec: true, expectError: true });
S('karim', 'pointer', [{ agent_id: { $: 'a1' }, date: '2026-13-40', statut: 'T' }], { rec: true, expectError: true });
S('samir', 'agentsManage', [], { rec: true, expectError: true });
S('admin', 'agentUpdate', [{ $: 'a2' }, { fonction: 'Soudeur', actif: false }], { rec: true });
S('admin', 'agentsUpdateMany', [[{ $: 'a3' }, { $: 'a4' }], { affectation: 'Base vie' }], { rec: true });
S('admin', 'agentCreate', [{ nom: 'TEST EXCES', fonction: 'Magasinier', email: 'exces@demo.local', contrat: C }], { rec: true, expectError: true });

// ----- documents -----
const PDF = Buffer.from('%PDF-1.4 fake document').toString('base64');
S('karim', 'documentUpload', [{ agent_id: { $: 'a1' }, type: 'auto', nom: 'titre de conge HAMLAOUI SAMIR 2026-10-25.pdf', mime: 'application/pdf', base64: PDF }], { save: { g1: 'id' }, rec: true });
S('karim', 'documentUpload', [{ agent_id: { $: 'a1' }, type: 'fiche_emolument', nom: 'fdp mars 2026.pdf', mime: 'application/pdf', base64: PDF }], { save: { g2: 'id' }, rec: true });
S('karim', 'documentUpload', [{ agent_id: { $: 'a1' }, type: 'fiche_emolument', nom: 'fdp mars 2026.pdf', mime: 'application/pdf', base64: PDF }], { rec: true });
S('samir', 'documentsList', [], { rec: true }); S('samir', 'badges', [], { rec: true }); S('samir', 'documentsLus', [], { rec: true }); S('samir', 'badges', [], { rec: true });
S('karim', 'documentsList', [{ $: 'a1' }], { rec: true }); S('admin', 'documentsList', [{ $: 'a1' }], { rec: true });
S('karim', 'documentUpdate', [{ id: { $: 'g2' }, periode: 'avril 2026' }], { rec: true });
S('karim', 'documentDownload', [{ $: 'g2' }], { rec: true });
S('samir', 'documentDownload', [{ $: 'g2' }], { rec: true });
S('amine', 'documentDownload', [{ $: 'g2' }], { rec: true, expectError: true });
S('karim', 'depotAdd', [{ nom: 'attestation de travail NADIR CHERIF 2026-05-04.pdf', mime: 'application/pdf', base64: PDF }], { save: { q1: 'id' }, rec: true });
S('karim', 'depotAdd', [{ nom: 'contrat de travail WALID TEBBAL 2026-01-10.pdf', mime: 'application/pdf', base64: PDF }], { save: { q2: 'id' }, rec: true });
S('karim', 'depotList', [], { rec: true });
S('karim', 'depotUpdate', [{ $: 'q2' }, { nom_force: 'WALID_Contrat_special', champs: { date: '2026-02-01' } }], { rec: true });
S('karim', 'depotValider', [[{ $: 'q1' }, { $: 'q2' }], false], { rec: true });
S('karim', 'depotList', [], { rec: true });
S('admin', 'documentsList', [{ $: 'a4' }], { rec: true });
S('karim', 'demandeRepondre', [{ $: 'd2' }, 'acceptee', 'OK'], { rec: true });
S('karim', 'demandeCloturer', [{ $: 'd2' }, { $: 'g1' }], { rec: true, expectError: true });
S('karim', 'demandeCloturer', [{ $: 'd3' }, null], { rec: true, expectError: true });
S('karim', 'demandeDocuments', [{ $: 'd2' }], { rec: true });
S('samir', 'demandesList', [], { rec: true });
S('karim', 'documentDelete', [{ $: 'g2' }], { rec: true });
S('karim', 'documentsList', [{ $: 'a1' }], { rec: true });
// ----- remarques / auto-pointage / accès -----
S('karim', 'remarqueTraiter', [{ $: 'x' }, { reponse: 'Vu' }], { rec: true, expectError: true });
S('karim', 'autoPointageGet', [], { rec: true }); S('karim', 'autoPointageSet', [{ on: true, heure: '07:15' }], { rec: true }); S('karim', 'autoPointageSet', [{ on: true, heure: '25:00' }], { rec: true, expectError: true });
S('admin', 'agentEnvoyerAcces', [{ $: 'a3' }, null], { rec: true });
S('admin', 'agentPassword', [{ $: 'a3' }, 'abc'], { rec: true, expectError: true });
S('admin', 'agentPassword', [{ $: 'a3' }, 'abcdef'], { rec: true });
S('admin', 'logoView', ['client'], { rec: true }); S('admin', 'setupSave', [{ client_emails: 'nouveau.client@demo.local', staff_emails: 'staff1@demo.local|1, staff2@demo.local|0', direction_email: 'resp@demo.local' }], { rec: true });
S('admin', 'agentsManage', [], { rec: true });
S('admin', 'connexions', [], { rec: false });
S('admin', 'attachementQte', [{ contrat: C, mois: '2026-09', designation: 'Magasinier', qte_mois: 12 }], { rec: true });
S('admin', 'attachementPreview', ['2026-09', C], { rec: true });
S('admin', 'vider', ['donnees', 'nope'], { rec: true, expectError: true });
S('karim', 'demandeCreate', [{ type: 'attestation_travail', message: 'créée par le chef', agent_id: { $: 'a2' } }], { save: { d6: 'id' }, rec: true });
S('karim', 'demandesList', [], { rec: true }); S('amine', 'demandeCreate', [{ type: 'contrat', agent_id: { $: 'a2' } }], { rec: true, expectError: true });
S('karim', 'demandeCreate', [{ type: 'contrat', agent_id: { $: 'chef' } }], { rec: true });
module.exports = steps;
if (require.main === module) require('fs').writeFileSync(__dirname + '/scenario.json', JSON.stringify(steps));
