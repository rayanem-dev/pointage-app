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
