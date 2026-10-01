# Pointage — version Google Apps Script

Même application que la version Node (agents / chefs de groupe / admin, rotation T-R, prévisions, reliquats, exports), mais **100 % dans Google** : le classeur Google Sheets est la base de données, Apps Script est le serveur et l'interface est une application Web servie par Google. Aucun hébergement à payer.

## Ce que voit chaque rôle

* **Agent** — accueil personnel : **est-il aujourd'hui en travail ou en congé** (pointé ou prévu), **combien de jours il lui reste** (aujourd'hui compris) et la date du prochain changement, solde T − CR, cumuls, calendrier coloré. Il fait ses **demandes** : titre de congé, attestation de travail, ATS, fiche d'émoluments, prolongation de congé, prolongation de séjour, et consulte ses **documents** (déposés par son chef de groupe).
* **Chef de groupe** — pointe ses agents (liste déroulante + date ou période + T / R / ABS), voit la grille de son groupe, **crée les agents de son groupe**, dépose leurs documents. Toutes les demandes de son groupe arrivent chez lui, **regroupées par thème** : il coche ce qu'il transmet et envoie **une seule demande groupée à la direction** (e-mail + suivi dans l'application). Quand la direction répond, il enregistre la réponse en un clic : elle est appliquée à toutes les demandes de l'envoi et visible par chaque agent.
* **Admin** — tout ce qui précède + rôles, groupes, **accès à l'onglet Setup accordé chef par chef** (case à cocher dans la fiche du chef), exports Attachement / Facture, installation et remise à zéro.

## Installation (10 minutes)

1. Ouvrez le classeur Google Sheets (ou créez-en un) → **Extensions → Apps Script**.
2. Créez dans l'éditeur les fichiers de ce dossier : `Config.gs`, `Dates.gs`, `Format.gs`, `Cycle.gs`, `Store.gs`, `Auth.gs`, `Params.gs`, `Agents.gs`, `Contrats.gs`, `Pointage.gs`, `Demandes.gs`, `Documents.gs`, `DocData.gs`, `Export.gs`, `Setup.gs`, `Main.gs` (scripts) et `Index.html`, `Style.html`, `App.html` (HTML), et remplacez le manifeste (⚙ Paramètres du projet → « Afficher le fichier appsscript.json ») par `appsscript.json`.
   *Avec [clasp](https://github.com/google/clasp) : `cd appscript && clasp login && clasp create --type sheets --parentId <ID_DU_CLASSEUR>` (ou `clasp clone`), puis `clasp push`.*
3. Rechargez le classeur : un menu **Pointage** apparaît. **Pointage → Installer / mettre à jour la structure** : acceptez les autorisations (une seule fois), saisissez l'e-mail et le mot de passe de l'administrateur. Les onglets sont créés (tables masquées/protégées, listes de validation, onglet « Démarrage »).
4. **Déployer → Nouveau déploiement → Application Web** — *Exécuter en tant que : moi* ; *Qui a accès : tout le monde* (l'accès est protégé par l'identifiant et le mot de passe de l'application). Copiez l'URL : c'est l'adresse à donner aux agents (menu **Pointage → Ouvrir l'application** la rappelle).
5. Connectez-vous avec le compte admin → onglet **Setup** : renseignez le **prestataire**, la rotation (28 / 28 par défaut), les couleurs, l'e-mail de la **direction**, puis les **contrats**, fonctions et prix (mois et n° d'attachement de référence).

Après chaque modification du code : *Déployer → Gérer les déploiements → Modifier → Nouvelle version*.

## Commercialiser : la coquille vide

* **Prestataire** : champ du Setup (nom, adresse, RC/NIS/NIF/AI/RIB, ville, logo). Il apparaît dans l'en-tête, les e-mails et tous les documents ; aucune donnée d'un client n'est codée en dur.
* Pour livrer à un nouveau prestataire : **Fichier → Créer une copie** du classeur, puis **Pointage → Vider les données** (réponse *Oui* = coquille vide complète : agents, pointages, demandes, documents, contrats, paramètres ; seul le compte admin est conservé) ou, dans l'application, **Setup → Maintenance → Remise à zéro** (confirmation « VIDER »). Le nouveau client lance ensuite **Installer**, déploie sa propre application et saisit son Setup.
* **Réparer / mettre à jour la structure** : recrée les tables manquantes et ajoute les nouvelles colonnes sans perdre de données (utile après une mise à jour du code).

## Base de données (classeur)

| Onglet | Contenu |
|---|---|
| `AAAA-MM` | un onglet par mois au format de la fiche ACOSCO : jours 1-31 (T / R / ABS), T, CR, ABS (formules), TOT T, TOT CR, **Reliquat** ; couleurs par mise en forme conditionnelle |
| `Global` | comptage de tout l'effectif : totaux, reliquat, statut du jour, jours restants, prochain changement |
| `Agents`, `Params`, `Contrats`, `Fonctions`, `Attachements`, `Demandes`, `Envois`, `Documents` | tables de l'application (mots de passe hachés et salés, colonnes techniques masquées) |

Les fichiers déposés (fiches d'émoluments, attestations…) sont rangés dans un dossier Google Drive « Pointage – Documents des agents » (créé automatiquement) ; l'application seule y donne accès.

## Exports

Fiche de pointage (admin et chefs de groupe), Attachement, Facture — en **Excel** et **PDF**. Chaque document est composé dans un classeur Google temporaire (mise en forme, couleurs, formules) puis exporté par Google et mis à la corbeille. Logos : renseignez l'ID de fichier Drive dans le Setup.

## Développement et tests

`cd appscript && node --test dev/appscript.test.js` exécute les **vrais fichiers `.gs`** sur un simulateur de SpreadsheetApp / Drive / Cache / Mail : installation, rôles et accès Setup, création d'agents par le chef, pointage, situation du jour, flux complet des demandes groupées, documents, vidage, exports (attachement N°16 et facture de mai : mêmes chiffres que les documents d'exemple).
`node dev/server.js` lance l'interface complète sur ce simulateur (démo : `admin@demo.local` / `admin1234`, `madani@demo.local` et `lamine@demo.local` / `demo1234`).

## Limites à connaître

* Le code n'a **pas été exécuté sur de vrais services Google** depuis l'environnement de développement (réseau restreint) : la logique, les droits et l'interface sont testés sur simulateur ; les appels propres à Google (mise en forme du classeur, export PDF/Excel par URL, envoi d'e-mail, Drive) sont à valider lors de la première installation. Si un export ne ressemble pas à votre modèle, ajustez `Export.gs` (une fonction par document).
* Les sessions durent 6 h (cache Apps Script). Quotas Google : ~100 e-mails/jour sur un compte gratuit, durée d'exécution 6 min par appel.
* Chaque action recharge les onglets nécessaires : adapté à quelques dizaines d'agents sur quelques années de pointages.
