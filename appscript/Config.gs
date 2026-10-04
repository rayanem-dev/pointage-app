/** Configuration commune : tables, rôles, types de demandes. */
var CFG = {
  EDITEUR: 'Rayane M.', // éditeur du logiciel (charte de confidentialité)
  CODE_EDITEUR: 'ADMIN', // code réservé : connexion à la console de l'éditeur (gestion des clients)
  APP_SHELL_URL: 'https://rayanem-dev.github.io/pointage-app/', // page d'accueil installable (liens d'invitation ?c=CODE)
  COPYRIGHT: '© 2026 Rayane M. — Tous droits réservés', // propriétaire du logiciel : à modifier ici, affiché sur toutes les pages
  VERSION: '3.22.0',
  TABLES: {
    Params: ['cle', 'valeur'],
    Agents: ['id', 'nom', 'fonction', 'affectation', 'contrat', 'email', 'role', 'chef_id', 'actif', 'acces_setup', 'password_hash', 'salt', 'date_entree', 'type', 'rotation', 'acces_exports'],
    Contrats: ['numero', 'client', 'objet', 'date_contrat', 'ref_mois', 'ref_attachement', 'rep_prestataire', 'rep_client', 'date_debut', 'duree_mois', 'client_email'],
    Fonctions: ['contrat', 'designation', 'libelle', 'positions', 'delai', 'prix_unitaire', 'qte_precedente_ref', 'nature'],
    Attachements: ['contrat', 'mois', 'designation', 'qte_mois'],
    // Attachement validé = copie figée (lignes en JSON) : la facture est générée à partir d'elle
    AttachementsValides: ['contrat', 'mois', 'numero', 'statut', 'valide_par', 'date_validation', 'rep_prestataire', 'total_ht', 'lignes', 'facture_numero', 'facture_date', 'facture_par'],
    Demandes: ['id', 'agent_id', 'type', 'objet', 'message', 'date_debut', 'date_fin', 'date_creation', 'statut', 'envoi_id', 'reponse', 'traite_par', 'date_traitement'],
    Envois: ['id', 'chef_id', 'date_envoi', 'nb', 'themes', 'note', 'statut', 'reponse', 'date_reponse'],
    Clients: ['code', 'nom', 'classeur_id', 'statut', 'fin_licence', 'contact', 'exec_url', 'cree_le', 'note', 'vitrine'], // vitrine = 1 : affiché sur la page d'accueil (« Ils nous font confiance »)
  Prospects: ['id', 'date', 'societe', 'nom', 'email', 'tel', 'message', 'statut', 'note', 'client'], // demandes d'essai reçues depuis la page d'accueil (classeur principal) // annuaire des clients (classeur principal uniquement)
  Remarques: ['id', 'agent_id', 'date', 'texte', 'auteur_id', 'auteur_nom', 'contrat', 'date_creation', 'statut', 'reponse', 'date_reponse'],
  Documents: ['id', 'agent_id', 'type', 'titre', 'file_id', 'nom_original', 'depose_par', 'date', 'code', 'periode', 'dossier', 'champs'],
  Depots: ['id', 'nom_original', 'file_id', 'ext', 'agent_id', 'type', 'champs', 'nom_force', 'source', 'avert', 'depose_par', 'depose_id', 'date_depot', 'candidats']
  },
  // Colonnes masquées dans le classeur (données techniques)
  HIDDEN: { Agents: ['password_hash', 'salt'] },
  ROLES: ['agent', 'chef', 'admin', 'client'], // client = compte de consultation du client du contrat (lecture seule, ni pointage ni Setup)
  // Rotations proposées (jours de travail / jours de repos). La rotation par défaut est réglée dans Setup → Rotation (28/28).
  ROTATIONS: ['28/28', '14/14', '21/21', '42/14', '7/7', '6/2', '3/3', '5/2'],
  STATUTS: ['T', 'R', 'ABS'],
  TYPES_DEMANDE: {
    titre_conge: 'Titre de congé',
    attestation_travail: 'Attestation de travail',
    ats: 'ATS',
    fiche_emolument: "Fiche d'émoluments",
    contrat: 'Copie du contrat',
    attestation_cnas: 'Attestation CNAS',
    maj_cnas: 'Mise à jour CNAS',
    attestation_emoluments: "Attestation d'émoluments",
    prolongation_conge: 'Prolongation de congé',
    prolongation_sejour: 'Prolongation de séjour'
  },
  STATUTS_DEMANDE: { en_attente: 'En attente', envoyee: 'Envoyée à la direction', acceptee: 'Acceptée', refusee: 'Refusée', traitee: 'Traitée' },
  TYPES_DOC: { titre_conge: 'Titre de congé', fiche_emolument: 'Fiche de paie', contrat: 'Contrat', attestation_cnas: 'Attestation CNAS', maj_cnas: 'Mise à jour CNAS', attestation_travail: 'Attestation de travail', attestation_emoluments: "Attestation d'émoluments", ats: 'ATS', autre: 'Autre' },
  // Onglet mensuel : A nom, B fonction, C..AG jours 1-31, puis OBS, T, CR, ABS, TOT T, TOT CR, Reliquat, ID
  MONTH: { C_DAY0: 2, C_ID: 40, HEADER_ROW: 4, WIDTH: 41 },
  SESSION_SECONDS: 21600,
  REMEMBER_DAYS: 30, // « Rester connecté » : durée de la reconnexion automatique
  MAX_UPLOAD_BYTES: 6 * 1024 * 1024
};

function httpErr_(message, code) { var e = new Error(message); e.code = code || 'ERR'; return e; }
function newId_(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }
