# Historique des versions

© 2026 Rayane M. — Tous droits réservés

## 3.24.1 — 2026-10-04 — Notifications de documents fiabilisées

- Le « Nouveau » des documents est conservé par Sijil jusqu'à ce que l'agent ouvre sa liste : il s'affiche même si l'agent se connecte plus tard, sur n'importe quel appareil.
- Quand l'éditeur ouvre la session d'un agent pour l'aider, les documents ne sont pas marqués comme lus à sa place.
- Si l'e-mail de notification ne peut pas partir (adresse absente ou invalide, limite d'envoi de Google), la raison est indiquée au moment de l'envoi ; le document est bien dans l'espace de l'agent.

## 3.24.0 — 2026-10-04 — Détection des doublons

- Un même fichier déposé deux fois est signalé : « Doublon » (déjà classé chez l'agent, ou déjà dans la liste). Son envoi demande une confirmation.
- Un document du même type et de la même période qu'un document déjà classé (par exemple une 2e fiche de paie de mars) est signalé par un avertissement.

## 3.23.1 — 2026-10-04 — Conversion PDF des grosses photos et menu Version

- La conversion en PDF fonctionne aussi pour les photos de plusieurs Mo (elle échouait sur les vraies photos de téléphone). Si une image ne peut pas être convertie, la raison est indiquée.
- « Version » est maintenant dans le menu de l'éditeur, avec ✓ quand le site et le serveur sont à jour.

## 3.23.0 — 2026-10-04 — Connexion par utilisateur et carte Version

- L'éditeur choisit une entreprise puis un utilisateur de cette entreprise pour se connecter à sa place et intervenir directement. Chaque accès est noté dans le journal.
- Une carte « Version » compare le site et le serveur : « Tout est à jour » ou ce qu'il reste à publier.
- Les documents peuvent peser jusqu'à 10 Mo.

## 3.22.0 — 2026-10-04 — Aperçu des documents

- Un bouton « Aperçu » permet de voir un document avant de l'envoyer à l'agent, et aussi dans la liste des documents déjà rangés. Il montre les PDF et les images, avec un accès pour l'ouvrir dans un onglet ou le télécharger.

## 3.21.1 — 2026-10-04 — Conversion en PDF corrigée

- La conversion des photos et scans (JPEG, PNG) en PDF fonctionne : une page par image, et les photos prises au téléphone gardent le bon sens. Si un format d'image ne peut pas être converti, le fichier est gardé tel quel et la liste vous le signale.

## 3.21.0 — 2026-10-04 — Dépôt de documents en vrac

- Déposez plusieurs documents d'un coup : Sijil reconnaît l'agent, le type et les dates, et propose le nom (TC_NOM_Prenom_2026-02-14, NOM_Prenom_FDP_Mars2026, contrat, attestations CNAS, attestation de travail, attestation d'émoluments…).
- Vous vérifiez et corrigez la liste, puis vous l'envoyez : rien n'arrive chez les agents avant votre accord, et chacun reçoit un seul e-mail.
- Les photos et scans peuvent être convertis en PDF.
- Nouveaux documents que l'agent peut demander : copie du contrat, attestation CNAS, mise à jour CNAS, attestation d'émoluments.

## 3.20.0 — 2026-10-04 — Sélecteur d'entreprise pour l'éditeur

- Un sélecteur d'entreprise dans l'en-tête : choisir un client ouvre son espace avec tous les droits de son administrateur (onglets, pointages, mots de passe…).
- Chaque accès support est noté dans le journal des connexions.
- « À propos » n'apparaît plus dans le menu de l'éditeur.

## 3.19.0 — 2026-10-03 — Connexions de toutes les entreprises et remarques des agents

- L'éditeur voit dans « Connexions » toutes les entreprises clientes : qui est en ligne, les dernières connexions et un journal.
- Un agent peut laisser une remarque sur son propre pointage : son responsable d'équipe est prévenu et peut lui répondre.

## 3.18.0 — 2026-10-03 — Responsable d'équipe

- Le « chef de groupe » devient « responsable d'équipe » partout dans l'application, l'aide et les documents.

## 3.17.0 — 2026-10-03 — Qui est en ligne ?

- Nouvel onglet « Connexions » pour l'administrateur : qui est en ligne maintenant, la date de la dernière connexion de chacun, le nombre de connexions, et ceux qui ne se sont jamais connectés.

## 3.16.0 — 2026-10-03 — Privilèges du responsable d’équipe et plusieurs e-mails

- L'administrateur choisit, chef par chef, s'il peut extraire l'attachement et la facture (case dans sa fiche), en plus de l'accès au Setup.
- L'onglet Client accepte jusqu'à 4 e-mails de contact client (Setup → Client) : chacun reçoit son compte de consultation, avec les mêmes droits.
- L'e-mail de la direction du prestataire accepte aussi 4 adresses.

## 3.15.0 — 2026-10-03 — Exports pour le responsable d’équipe

- Le responsable d’équipe a un nouvel onglet « Exports » : il extrait en Excel ou PDF la fiche de pointage, l'attachement et la facture déjà établie. Il consulte seulement ; la validation reste à l'administrateur.
- Dans Setup, les onglets sont dans un nouvel ordre : Prestataire (mon entreprise), Client, Contrat, Rotation.

## 3.14.0 — 2026-10-03 — Sécurité renforcée et listes triées

- Les agents sont classés par ordre alphabétique partout (pointage, gestion, documents).
- Un texte saisi (nom, message, remarque) ne peut plus jamais être pris pour une formule du classeur.
- Protection contre les envois en masse : nombre de demandes, de remarques et de codes de réinitialisation limité par heure.
- Les logos importés sont vérifiés (vrai format PNG, JPG ou GIF).

## 3.13.0 — 2026-10-03 — Logos par import et demandes modifiables

- Les logos du prestataire et du client s'ajoutent maintenant en important une image (PNG, JPG ou GIF) dans Setup, sans rien recopier. Ils apparaissent sur les documents exportés.
- Dans « Demandes à traiter » et « Mes demandes », un bouton « Modifier » permet de corriger une demande en attente (oubli, mauvaise date…).
- Une demande envoyée à la direction est marquée « Traitée : demande transmise à la direction » avec le nom de l'entreprise prestataire.

## 3.12.0 — 2026-10-03 — Mot de passe oublié et reconnexion automatique

- « Mot de passe oublié ? » sur la page de connexion : un code à 6 chiffres est envoyé par e-mail (valable 30 minutes) pour choisir un nouveau mot de passe.
- Case « Rester connecté » : sur l'appareil, Sijil vous reconnecte tout seul pendant 30 jours, sans retaper le mot de passe. « Déconnexion » ou un changement de mot de passe l'annule.
- Les sélecteurs de langue et de mode sombre, en bas à droite, sont alignés.

## 3.11.0 — 2026-10-02 — Aide intégrée

- Nouvel onglet « Aide » : le mode d'emploi de Sijil, expliqué simplement pour chaque profil (agent, responsable d’équipe, administrateur, client), avec une recherche.
- L'aide existe en français, en arabe et en anglais.

## 3.10.0 — 2026-10-02 — Compléter les jours non pointés

- Un seul bouton pour rattraper les jours oubliés : du lendemain du dernier pointage jusqu'à aujourd'hui, chaque agent garde son dernier statut (T, R ou ABS).
- Vous choisissez les agents (ou tous) et la date de fin. Vous pouvez aussi suivre la rotation prévue.
- Les jours déjà pointés ne sont jamais modifiés. Un résumé vous est montré avant de valider.

## 3.9.0 — 2026-10-02 — Compte client, remarques et durée du contrat

- Le contrat indique maintenant sa date de début, sa durée et sa date de fin. Tout le monde peut les voir.
- En ajoutant l'e-mail du contact client dans le contrat, son compte de consultation est créé et ses accès peuvent lui être envoyés.
- Le client peut laisser une remarque sur n'importe quel jour du pointage. Le responsable d’équipe est prévenu, répond, et le client voit la réponse.

## 3.8.0 — 2026-10-02 — Vues 3 mois, 6 mois, 1 an et jours fériés

- Le pointage global peut s'afficher sur 3 mois, 6 mois ou 1 an, avec les mêmes couleurs que le mois. Le jour d'aujourd'hui est repéré.
- Les jours fériés algériens sont visibles dans toutes les vues : fêtes nationales et fêtes religieuses. Les dates religieuses sont estimées (un jour d'écart est possible) et se corrigent dans Setup → Rotation.

## 3.7.0 — 2026-10-02 — Pages plus rapides

- L'application s'ouvre et change de page plus vite.

## 3.6.0 — 2026-10-02 — Solde au départ et pointage de l'agent

- Sur l'accueil de l'agent : le solde (T − CR) que l'agent aura le jour de son départ en congé, ou de sa reprise.
- Nouvel onglet « Mon pointage » : l'agent consulte son propre pointage sur 1 mois, 3 mois, 6 mois ou 1 an.
- Les demandes de congé affichent les dates demandées et la date de reprise prévue.

## 3.5.0 — 2026-10-02 — Pastilles et notifications

- Une pastille sur « Mes documents » indique les nouveaux documents. Un message s'affiche quand un document arrive, et l'agent reçoit aussi un e-mail.
- Le responsable d’équipe voit une pastille sur « Demandes » et reçoit un e-mail à chaque nouvelle demande.

## 3.3.0 — 2026-10-02 — Trois langues et mode sombre

- L'application existe en français, en arabe et en anglais. Le choix se fait en bas à droite.
- Un mode sombre est disponible, avec une petite bascule soleil / lune en bas à droite.

## 3.2.0 — 2026-10-02 — Accès des agents par e-mail

- À la création d'un agent, ses accès (lien, identifiant, mot de passe provisoire) peuvent lui être envoyés par e-mail.
- Un bouton « Envoyer l'accès » dans la liste des agents permet de les renvoyer à tout moment.

## 3.0.0 — 2026-10-02 — Sijil : nouveau nom et nouveau logo

- L'application s'appelle Sijil, avec un nouveau logo et de nouvelles couleurs.

## 2.5.0 — 2026-10-02 — Export du pointage en Excel

- Setup → Maintenance : exporter un pointage en Excel, avec le contrat, les prix, les agents et les attachements qui en dépendent.
- Le même fichier peut être réimporté en entier.

## 1.9.0 — 2026-10-01 — Import d'un pointage Excel

- Setup → Maintenance : importer un pointage depuis un fichier Excel, un mois par onglet.
- Les noms écrits différemment sont rapprochés des agents existants, et les agents inconnus peuvent être créés.
- Dans la modification groupée des agents, vous pouvez aussi changer la fonction.

## 1.8.0 — 2026-10-01 — Compte client (consultation)

- Nouveau rôle « Client » : il suit le pointage, le contrat, les attachements et les factures validés, sans rien modifier.

## 1.7.0 — 2026-10-01 — Historique des attachements et factures

- La liste des attachements et des factures validés, avec leurs PDF à télécharger.
- Un tableau par fonction montre ce qui a déjà été facturé et ce qui reste à facturer.

## 1.6.0 — 2026-10-01 — Rotations et modification groupée

- Plusieurs types de rotation au choix (28/28, 14/14, 21/21…), et une rotation propre à chaque agent.
- Dans la liste des agents, cochez plusieurs lignes pour les modifier en une seule fois.
- La quantité de l'attachement reprend les jours de travail réellement pointés.

## 1.5.0 — 2026-10-01 — Setup en onglets

- Le Setup est rangé en onglets : Contrat, Prestataire, Client, Rotation et Maintenance.
- Sauvegarde et restauration de vos données depuis l'onglet Maintenance.

## 1.4.0 — 2026-10-01 — Fiche de pointage, attachement et documents

- La fiche de pointage et l'attachement s'exportent en Excel et en PDF.
- Les documents des agents sont reconnus, renommés et rangés automatiquement.

## 1.3.0 — 2026-10-01 — Prévisions

- Dès le premier pointage, l'application prévoit les jours de travail et de repos suivants. Un pointage réel n'est jamais remplacé.

## 1.2.0 — 2026-10-01 — Contrats

- Le contrat est résumé en une page. Le bordereau des prix se dépose en un geste.
- L'attachement validé est figé, puis la facture est établie.

## 1.1.0 — 2026-10-01 — Bordereau des prix, effectifs et véhicules

- Lecture du bordereau des prix (PDF scanné, photo, Excel ou CSV).
- Les effectifs suivent le contrat, et les véhicules mis à disposition sont gérés comme les agents.

## 1.0.0 — 2026-10-01 — Première version

- Espaces agent, responsable d’équipe et administrateur. Pointage T / R / ABS. Demandes des agents regroupées par thème et envoyées à la direction.
