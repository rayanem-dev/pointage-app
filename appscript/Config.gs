/** Configuration commune : tables, rôles, types de demandes. */
var CFG = {
  VERSION: '1.0.0',
  TABLES: {
    Params: ['cle', 'valeur'],
    Agents: ['id', 'nom', 'fonction', 'affectation', 'contrat', 'email', 'role', 'chef_id', 'actif', 'acces_setup', 'password_hash', 'salt', 'date_entree'],
    Contrats: ['numero', 'client', 'objet', 'date_contrat', 'ref_mois', 'ref_attachement', 'rep_prestataire', 'rep_client'],
    Fonctions: ['contrat', 'designation', 'libelle', 'positions', 'delai', 'prix_unitaire', 'qte_precedente_ref'],
    Attachements: ['contrat', 'mois', 'designation', 'qte_mois'],
    Demandes: ['id', 'agent_id', 'type', 'objet', 'message', 'date_debut', 'date_fin', 'date_creation', 'statut', 'envoi_id', 'reponse', 'traite_par', 'date_traitement'],
    Envois: ['id', 'chef_id', 'date_envoi', 'nb', 'themes', 'note', 'statut', 'reponse', 'date_reponse'],
    Documents: ['id', 'agent_id', 'type', 'titre', 'file_id', 'nom_original', 'depose_par', 'date']
  },
  // Colonnes masquées dans le classeur (données techniques)
  HIDDEN: { Agents: ['password_hash', 'salt'] },
  ROLES: ['agent', 'chef', 'admin'],
  STATUTS: ['T', 'R', 'ABS'],
  TYPES_DEMANDE: {
    titre_conge: 'Titre de congé',
    attestation_travail: 'Attestation de travail',
    ats: 'ATS',
    fiche_emolument: "Fiche d'émoluments",
    prolongation_conge: 'Prolongation de congé',
    prolongation_sejour: 'Prolongation de séjour'
  },
  STATUTS_DEMANDE: { en_attente: 'En attente', envoyee: 'Envoyée à la direction', acceptee: 'Acceptée', refusee: 'Refusée', traitee: 'Traitée' },
  TYPES_DOC: { fiche_emolument: "Fiche d'émoluments", attestation_travail: 'Attestation de travail', ats: 'ATS', titre_conge: 'Titre de congé', autre: 'Autre' },
  // Onglet mensuel : A nom, B fonction, C..AG jours 1-31, puis OBS, T, CR, ABS, TOT T, TOT CR, Reliquat, ID
  MONTH: { C_DAY0: 2, C_ID: 40, HEADER_ROW: 4, WIDTH: 41 },
  SESSION_SECONDS: 21600,
  MAX_UPLOAD_BYTES: 6 * 1024 * 1024
};

function httpErr_(message, code) { var e = new Error(message); e.code = code || 'ERR'; return e; }
function newId_(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }
