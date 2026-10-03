# Sijil

Application web de gestion des pointages du personnel détaché (rotation T / R), **100 % Google** : un classeur Google Sheets sert de base de données, **Google Apps Script** de serveur, et un site statique HTML/JS permet de l'installer sur l'écran d'accueil (PWA).

* **Agents** : situation du jour (en travail / en congé, jours restants), solde, calendrier, demandes (titre de congé, attestation de travail, ATS, fiche d'émoluments, prolongation de congé / de séjour), documents.
* **Responsables d’équipe** : pointage de leur groupe, création des agents, demandes regroupées par thème et envoyées en une seule fois à la direction, dépôt de documents.
* **Admin** : paramètres (prestataire, rotation, couleurs, contrats, prix), accès Setup au choix, exports **fiche de pointage / attachement / facture** (Excel et PDF), installation et remise à zéro (coquille vide).

Installation, droits, base de données et tests : voir [`appscript/README.md`](appscript/README.md).

## Installer sur l'écran d'accueil (PWA)

À la racine du dépôt : `index.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png` — un site **statique HTML/JS, sans framework**, qui affiche l'application Apps Script en plein écran et propose l'installation.

* **Publier** : GitHub → *Settings → Pages* → source « Deploy from a branch », dossier `/ (root)`. L'adresse obtenue (HTTPS) est celle à donner aux utilisateurs.
* **Première visite** : la page demande l'adresse `/exec` du déploiement Apps Script, mémorisée sur l'appareil. Pour la changer (nouveau déploiement = nouvelle adresse) : bouton **⚙ Adresse** en bas à gauche de la page, ou `?reset` à la fin de l'adresse. *Astuce : pour garder la même adresse après une mise à jour, utilisez « Déployer → Gérer les déploiements → Modifier → Nouvelle version » et non « Nouveau déploiement ».* Pour la figer, renseigner `APP_URL` en haut du script d'`index.html`.
* **Chrome / Edge / Android** : une bande « Installer Pointage » avec un bouton **Installer** apparaît (fermeture : elle ne revient qu'après 7 jours).
* **iPhone / iPad** : seul **Safari** permet l'ajout, sans bouton natif — la bande affiche l'instruction « Partager → Sur l'écran d'accueil ».
* Rien n'est affiché si l'application est déjà installée. Le service worker (`sw.js`) ne met rien en cache : il sert uniquement à rendre l'installation possible.

## Version 2.6.0 — un seul compte, vitrine et demandes d'essai

- **Compte unique** : l'administrateur du classeur principal est l'éditeur ; ses onglets « Clients » et « Prospects » s'ajoutent à son espace normal. La liste des clients n'affiche plus la ligne du classeur principal.
- **Vitrine** : case « Vitrine » par client (avec son accord) → liste déroulante et bandeau « Elles nous font confiance » sur la page d'accueil (`?entreprises`).
- **Demander un essai** : formulaire de la page d'accueil (`?prospect=`) → onglet « Prospects » → « Créer l'essai » (30 jours par défaut) avec envoi des accès. Après `deploy`, autoriser l'envoi d'e-mails si Google le demande.

## Version 3.0.0 / 3.1.0 — Sijil, identité visuelle et langues

- **Nom et logo** : Sijil (logo « empreinte validée »). Fichiers dans `brand/` (symbole et logo complet en PNG transparent), icônes de l'application (`icon-*.png`, `apple-touch-icon.png`, `favicon-32.png`), couleurs turquoise `#2FB5B4`, bleu `#16598D`, marine `#0E4377`, papier `#F4F1E8`.
- **Langues** : français (source), arabe (de droite à gauche) et anglais. Le dictionnaire est `appscript/dev/i18n-data.json` ; après modification, `node dev/gen-i18n.js` régénère `appscript/I18n.html`. Une phrase sans traduction s'affiche en français. Les documents générés (PDF, Excel) restent en français.

## Version 3.7.0 — performances

`Store.gs` ouvre chaque classeur une fois par appel et garde les tableaux lus dans `CacheService` (clé par client, validée par un numéro de version changé à chaque écriture ; durée de sécurité 2 min pour les modifications faites à la main dans Google Sheets). Toute modification directe du classeur par le code doit appeler `Store.reset()`.
