-- Fichier généré par appscript/dev/gen-php.js : ne pas modifier à la main.
-- Base MySQL / MariaDB (utf8mb4). Une table par onglet de données de la version Apps Script.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `params` (
  `seq` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cle` VARCHAR(190) NOT NULL,
  `valeur` TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `agents` (
  `seq` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id` VARCHAR(190) NOT NULL,
  `nom` TEXT NOT NULL,
  `fonction` TEXT NOT NULL,
  `affectation` TEXT NOT NULL,
  `contrat` VARCHAR(190) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `role` VARCHAR(190) NOT NULL,
  `chef_id` VARCHAR(190) NOT NULL,
  `actif` VARCHAR(190) NOT NULL,
  `acces_setup` VARCHAR(190) NOT NULL,
  `password_hash` VARCHAR(190) NOT NULL,
  `salt` VARCHAR(190) NOT NULL,
  `date_entree` VARCHAR(190) NOT NULL,
  `type` VARCHAR(190) NOT NULL,
  `rotation` VARCHAR(190) NOT NULL,
  `acces_exports` VARCHAR(190) NOT NULL,
  `portee` VARCHAR(190) NOT NULL,
  `origine` VARCHAR(190) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contrats` (
  `seq` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `numero` VARCHAR(190) NOT NULL,
  `client` TEXT NOT NULL,
  `objet` TEXT NOT NULL,
  `date_contrat` VARCHAR(190) NOT NULL,
  `ref_mois` VARCHAR(190) NOT NULL,
  `ref_attachement` VARCHAR(190) NOT NULL,
  `rep_prestataire` TEXT NOT NULL,
  `rep_client` TEXT NOT NULL,
  `date_debut` VARCHAR(190) NOT NULL,
  `duree_mois` VARCHAR(190) NOT NULL,
  `client_email` TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fonctions` (
  `seq` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `contrat` VARCHAR(190) NOT NULL,
  `designation` TEXT NOT NULL,
  `libelle` TEXT NOT NULL,
  `positions` TEXT NOT NULL,
  `delai` TEXT NOT NULL,
  `prix_unitaire` TEXT NOT NULL,
  `qte_precedente_ref` TEXT NOT NULL,
  `nature` VARCHAR(190) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `attachements` (
  `seq` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `contrat` VARCHAR(190) NOT NULL,
  `mois` VARCHAR(190) NOT NULL,
  `designation` TEXT NOT NULL,
  `qte_mois` TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `attachementsvalides` (
  `seq` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `contrat` VARCHAR(190) NOT NULL,
  `mois` VARCHAR(190) NOT NULL,
  `numero` VARCHAR(190) NOT NULL,
  `statut` VARCHAR(190) NOT NULL,
  `valide_par` VARCHAR(190) NOT NULL,
  `date_validation` VARCHAR(190) NOT NULL,
  `rep_prestataire` TEXT NOT NULL,
  `total_ht` TEXT NOT NULL,
  `lignes` MEDIUMTEXT NOT NULL,
  `facture_numero` TEXT NOT NULL,
  `facture_date` VARCHAR(190) NOT NULL,
  `facture_par` VARCHAR(190) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `demandes` (
  `seq` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id` VARCHAR(190) NOT NULL,
  `agent_id` VARCHAR(190) NOT NULL,
  `type` VARCHAR(190) NOT NULL,
  `objet` TEXT NOT NULL,
  `message` TEXT NOT NULL,
  `date_debut` VARCHAR(190) NOT NULL,
  `date_fin` VARCHAR(190) NOT NULL,
  `date_creation` VARCHAR(190) NOT NULL,
  `statut` VARCHAR(190) NOT NULL,
  `envoi_id` VARCHAR(190) NOT NULL,
  `reponse` TEXT NOT NULL,
  `traite_par` VARCHAR(190) NOT NULL,
  `date_traitement` VARCHAR(190) NOT NULL,
  `date_cloture` VARCHAR(190) NOT NULL,
  `cloture_par` VARCHAR(190) NOT NULL,
  `document_id` VARCHAR(190) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `envois` (
  `seq` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id` VARCHAR(190) NOT NULL,
  `chef_id` VARCHAR(190) NOT NULL,
  `date_envoi` VARCHAR(190) NOT NULL,
  `nb` VARCHAR(190) NOT NULL,
  `themes` TEXT NOT NULL,
  `note` TEXT NOT NULL,
  `statut` VARCHAR(190) NOT NULL,
  `reponse` TEXT NOT NULL,
  `date_reponse` VARCHAR(190) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `clients` (
  `seq` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(190) NOT NULL,
  `nom` TEXT NOT NULL,
  `classeur_id` VARCHAR(190) NOT NULL,
  `statut` VARCHAR(190) NOT NULL,
  `fin_licence` TEXT NOT NULL,
  `contact` TEXT NOT NULL,
  `exec_url` TEXT NOT NULL,
  `cree_le` VARCHAR(190) NOT NULL,
  `note` TEXT NOT NULL,
  `vitrine` VARCHAR(190) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `prospects` (
  `seq` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id` VARCHAR(190) NOT NULL,
  `date` VARCHAR(190) NOT NULL,
  `societe` TEXT NOT NULL,
  `nom` TEXT NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `tel` TEXT NOT NULL,
  `message` TEXT NOT NULL,
  `statut` VARCHAR(190) NOT NULL,
  `note` TEXT NOT NULL,
  `client` TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `remarques` (
  `seq` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id` VARCHAR(190) NOT NULL,
  `agent_id` VARCHAR(190) NOT NULL,
  `date` VARCHAR(190) NOT NULL,
  `texte` TEXT NOT NULL,
  `auteur_id` VARCHAR(190) NOT NULL,
  `auteur_nom` TEXT NOT NULL,
  `contrat` VARCHAR(190) NOT NULL,
  `date_creation` VARCHAR(190) NOT NULL,
  `statut` VARCHAR(190) NOT NULL,
  `reponse` TEXT NOT NULL,
  `date_reponse` VARCHAR(190) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `documents` (
  `seq` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id` VARCHAR(190) NOT NULL,
  `agent_id` VARCHAR(190) NOT NULL,
  `type` VARCHAR(190) NOT NULL,
  `titre` TEXT NOT NULL,
  `file_id` VARCHAR(190) NOT NULL,
  `nom_original` TEXT NOT NULL,
  `depose_par` VARCHAR(190) NOT NULL,
  `date` VARCHAR(190) NOT NULL,
  `code` VARCHAR(190) NOT NULL,
  `periode` VARCHAR(190) NOT NULL,
  `dossier` VARCHAR(190) NOT NULL,
  `champs` MEDIUMTEXT NOT NULL,
  `empreinte` VARCHAR(190) NOT NULL,
  `nouveau` VARCHAR(190) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `depots` (
  `seq` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id` VARCHAR(190) NOT NULL,
  `nom_original` TEXT NOT NULL,
  `file_id` VARCHAR(190) NOT NULL,
  `ext` VARCHAR(190) NOT NULL,
  `agent_id` VARCHAR(190) NOT NULL,
  `type` VARCHAR(190) NOT NULL,
  `champs` MEDIUMTEXT NOT NULL,
  `nom_force` TEXT NOT NULL,
  `source` VARCHAR(190) NOT NULL,
  `avert` TEXT NOT NULL,
  `depose_par` VARCHAR(190) NOT NULL,
  `depose_id` VARCHAR(190) NOT NULL,
  `date_depot` VARCHAR(190) NOT NULL,
  `candidats` MEDIUMTEXT NOT NULL,
  `empreinte` VARCHAR(190) NOT NULL,
  `convertir` VARCHAR(190) NOT NULL,
  `ext_orig` TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tables propres à la version PHP (sessions, cache, propriétés, pointage).
CREATE TABLE IF NOT EXISTS `props` (
  `k` VARCHAR(190) NOT NULL PRIMARY KEY,
  `v` MEDIUMTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cache` (
  `k` VARCHAR(190) NOT NULL PRIMARY KEY,
  `v` MEDIUMTEXT NOT NULL,
  `expire` INT UNSIGNED NOT NULL,
  KEY `expire` (`expire`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Un jour pointé par ligne (remplace les onglets mensuels « AAAA-MM »).
CREATE TABLE IF NOT EXISTS `pointage` (
  `agent_id` VARCHAR(64) NOT NULL,
  `jour` DATE NOT NULL,
  `statut` VARCHAR(3) NOT NULL,
  PRIMARY KEY (`agent_id`, `jour`),
  KEY `jour` (`jour`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fichiers (documents, logos) : métadonnées ici, contenu dans le dossier data/ hors du site.
CREATE TABLE IF NOT EXISTS `fichiers` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `nom` VARCHAR(255) NOT NULL,
  `mime` VARCHAR(120) NOT NULL,
  `taille` INT UNSIGNED NOT NULL,
  `cree_le` DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
