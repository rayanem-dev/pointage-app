# Pointage — version Google Apps Script

Application de pointage (agents / responsables d’équipe / admin, rotation T-R, prévisions, reliquats, exports), **100 % dans Google** : le classeur Google Sheets est la base de données, Apps Script est le serveur et l'interface est une application Web servie par Google. Aucun hébergement à payer.

## Ce que voit chaque rôle

* **Agent** — accueil personnel : **est-il aujourd'hui en travail ou en congé** (pointé ou prévu), **combien de jours il lui reste** (aujourd'hui compris) et la date du prochain changement, solde T − CR, cumuls, calendrier coloré. Il fait ses **demandes** : titre de congé, attestation de travail, ATS, fiche d'émoluments, prolongation de congé, prolongation de séjour, et consulte ses **documents** (déposés par son responsable d’équipe).
* **Responsable d’équipe** — pointe ses agents (liste déroulante + date ou période + T / R / ABS), voit la grille de son groupe, **crée les agents de son groupe**, dépose leurs documents. Toutes les demandes de son groupe arrivent chez lui, **regroupées par thème** : il coche ce qu'il transmet et envoie **une seule demande groupée à la direction** (e-mail + suivi dans l'application). Quand la direction répond, il enregistre la réponse en un clic : elle est appliquée à toutes les demandes de l'envoi et visible par chaque agent.
* **Admin** — tout ce qui précède + rôles, groupes, **accès à l'onglet Setup accordé chef par chef** (case à cocher dans la fiche du chef), exports Attachement / Facture, installation et remise à zéro.

## Installation (10 minutes)

### Option A — clasp (recommandé : envoi et mises à jour)

Voir « Alternative : clasp » plus bas (Windows PowerShell et macOS / Linux). C'est la méthode la plus fiable.

### Option B — copie automatique depuis GitHub (installateur)

> ⚠ Limite de Google : l'installateur écrit dans votre projet via l'API Apps Script, qui n'est pas activable sur le projet Cloud **par défaut** d'un script. Il ne fonctionne donc que si vous avez associé un projet Cloud standard (⚙ Paramètres du projet → *Projet Google Cloud Platform* → *Modifier le projet*) où l'« API Apps Script » est activée. Sinon, le message « Le projet Google Cloud de ce script n'a pas l'API Apps Script » s'affiche : utilisez clasp (option A).

1. Ouvrez le classeur Google Sheets → **Extensions → Apps Script**.
2. **Manifeste** : ⚙ *Paramètres du projet* → cochez « Afficher le fichier « appsscript.json » ». Ouvrez-le et remplacez tout son contenu par celui de [`appsscript.json`](appsscript.json) (il déclare les autorisations nécessaires).
3. **Installateur** : ouvrez `Code.gs`, effacez tout et collez le contenu de [`Installer.gs`](Installer.gs). Enregistrez (💾).
4. **Activez l'API Apps Script** (une fois) : <https://script.google.com/home/usersettings> → interrupteur « API Google Apps Script » (nécessaire aussi pour clasp), et vérifiez que le projet Cloud du script a cette API (voir l'encadré ci-dessus).
5. Dans l'éditeur, choisissez la fonction **`installerDepuisGitHub`** → ▶ **Exécuter** → acceptez les autorisations. Les 21 fichiers (listés dans [`files.json`](files.json) : 17 `.gs` dont l'installateur, 3 pages HTML, le manifeste) sont téléchargés depuis `raw.githubusercontent.com` et copiés automatiquement. Si GitHub répond « trop de demandes » (adresses partagées de Google), patientez quelques minutes et relancez.
6. **Rechargez le classeur** : le menu **Pointage** apparaît. **Pointage → Installer / mettre à jour la structure** : saisissez l'e-mail et le mot de passe de l'administrateur.
7. **Déployer → Nouveau déploiement → Application Web** — *Exécuter en tant que : moi* ; *Qui a accès : tout le monde* (l'accès est protégé par l'identifiant et le mot de passe de l'application). Copiez l'URL `/exec` : c'est l'adresse à donner aux agents (menu **Pointage → Ouvrir l'application** la rappelle).
8. Connectez-vous avec le compte admin → onglet **Setup** : **prestataire**, rotation (28 / 28 par défaut), couleurs, e-mail de la **direction**, puis **contrats**, fonctions et prix.

**Mises à jour** : avec clasp : `git pull` puis `clasp push --force`. Avec l'installateur (option B) : menu **Pointage → Mettre à jour le code depuis GitHub**. Dans les deux cas, ensuite *Déployer → Gérer les déploiements → Modifier → Nouvelle version*. Vos données (onglets du classeur) ne sont pas touchées ; pensez ensuite à **Pointage → Installer / mettre à jour la structure** si de nouvelles colonnes ont été ajoutées.

**Nouveau fichier dans `appscript/`** : l'ajouter aussi à `files.json` (un test le vérifie).

*Dépôt privé ?* Ajoutez dans ⚙ *Paramètres du projet → Propriétés du script* la propriété `GITHUB_TOKEN` (jeton GitHub en lecture sur le dépôt).
*Autres fichiers du projet* : ceux qui ne figurent pas dans le dépôt sont conservés ; seule l'ébauche `Code.gs` est remplacée.

### Alternative : clasp (en ligne de commande)

Pour développer ou si vous êtes à l'aise avec un terminal. Prérequis : Node.js, et l'API Apps Script activée (<https://script.google.com/home/usersettings>).

**Windows (PowerShell)** — pas de `&&` (anciennes versions) et `echo > fichier` écrit en UTF-16, que clasp ne sait pas lire (`JSON5: invalid character '�'`) :

```powershell
npm install -g @google/clasp
clasp login
git clone https://github.com/rayanem-dev/pointage-app      # (ou « git pull » si déjà cloné)
cd pointage-app\appscript                                    # le fichier .clasp.json doit être DANS ce dossier
[System.IO.File]::WriteAllText("$PWD\.clasp.json", '{"scriptId":"<ID_DU_SCRIPT>","rootDir":"."}')
clasp push --force
```

**macOS / Linux** :

```bash
npm install -g @google/clasp
clasp login
git clone https://github.com/rayanem-dev/pointage-app && cd pointage-app/appscript
echo '{"scriptId":"<ID_DU_SCRIPT>","rootDir":"."}' > .clasp.json
clasp push --force
```

ID du script : Apps Script → ⚙ Paramètres du projet → « ID de script ». `--force` accepte l'écrasement du manifeste.

N'utilisez pas `clasp clone` ici : il écraserait les fichiers du dossier par ceux (vides) du projet. `.claspignore` exclut `dev/`, `README.md` et `files.json` ; `.clasp.json` n'est pas versionné.
Mises à jour : `git pull && clasp push`.

### Alternative : copie manuelle

Créez dans l'éditeur chaque fichier de ce dossier (`*.gs` en script, `*.html` en HTML) et collez son contenu.

## Prévisions : les « ombres »

Dès le **premier pointage T ou R** d'un agent, les jours suivants se calculent **automatiquement** (couleurs claires) : **+28 jours T, +28 jours R, +28 jours T…** (durées réglables dans Setup). Règles :

* Une prévision **ne remplace jamais un pointage réel** : les jours pointés restent tels quels.
* Si le calcul rencontre un pointage réel **qui diffère** de la prévision — même pile à 28 jours, là où elle aurait basculé — **ce pointage devient le nouveau repère** : le comptage repart de lui, et ainsi de suite.
* Un pointage réel **conforme** à la prévision ne relance pas le comptage.
* Les jours non pointés **entre deux pointages** sont comblés par la prévision (plus de « trous »).
* Une **absence (ABS)** fait avancer le calendrier sans arrêter les prévisions.
* Sans pointage T/R : aucune prévision (la grille l'indique). Un véhicule n'a pas de prévision (pas de rotation).

L'accueil de l'agent (« en travail / en congé aujourd'hui, N jours restants ») utilise ces mêmes prévisions.

## Contrat → agents / VH → attachement → facture

Tout est lié : **le contrat est la source**.

1. **Déposer le bordereau des prix** (**Setup → Contrat**) : une zone visible « Déposer le bordereau des prix du contrat ici » (glisser-déposer ou *Choisir un fichier* : **PDF scanné, photo, Excel ou CSV**). La lecture est **automatique** (pas de bouton « analyser ») : Google lit le document, l'application détecte *Désignation | Nombre | Tarif journalier | Délai de mobilisation | Montant*, déduit les **postes** (`Montant ÷ (Tarif × Délai)` : 15 120 000 ÷ (14 000 × 540) = 2), **contrôle le total** annoncé et reconnaît le **n° de contrat** (même si l'OCR lit « 1/24 » pour « I/24 »). Vous relisez le tableau (lignes douteuses « ⚠ à vérifier » décochées, texte lu par Google consultable), puis **un seul bouton : « Enregistrer dans le contrat »** — le contrat est créé ou mis à jour (sans doublon, libellés de fiche conservés), sans autre étape. La lecture ne dépend pas de la mise en page rendue par l'OCR : si aucun tableau n'est reconnu, elle cherche dans le texte les groupes de nombres vérifiant `Nombre × Tarif × Délai = Montant` et ignore le bruit. *La lecture d'un scan dépend de sa netteté : relisez toujours.*
2. **Voir le contrat** (menu **Contrats**, responsables d’équipe compris, sans les prix pour eux) : fonctions, nombres, délais, prix et montant contractuel, **effectif affecté / nécessaire** par fonction (avec les noms), quantités **déjà facturées**, liste des attachements (statut, facture).
3. **Agents et véhicules** : pour un agent ou un VH rattaché au contrat, la fonction se choisit **uniquement parmi les désignations du contrat** (avec l'effectif : `2 postes · 4/4 affectés · complet`). Effectif d'une fonction de personnel = **postes × (travail + repos) ÷ travail** (2 postes en 28/28 = 4 personnes) ; véhicule = quantité. Au-delà, la saisie est refusée (règle désactivable dans Setup). Les personnes se comptent en **Nombre**, les véhicules mis à disposition en **Quantité** (nature *Personne / Véhicule (VH)* ; un VH se pointe comme un agent, sans compte ni prévision de rotation).
4. **Attachement** (Exports, ou bouton « Préparer l'attachement de … » du contrat) : brouillon calculé d'après le contrat (nombre × jours du mois, modifiable). **« Valider l'attachement »** le **fige** (copie) : modifier ensuite le contrat, les prix ou les agents ne le change plus. Les mois se valident **dans l'ordre** (la quantité précédente reprend le cumul validé). Réouverture possible tant qu'il n'est pas facturé.
5. **Facture** : disponible **seulement à partir d'un attachement validé** ; elle reprend ses lignes (mêmes quantités et prix), avec le n° et la date de facture que vous saisissez ; l'attachement passe à *Facturé*.

**Représentant prestataire** (attachement) : par défaut le **responsable d’équipe** du contrat (suivi automatiquement s'il change) ; sinon un autre responsable, une autre personne (saisie libre), ou **aucun** (laissé vide).

## Commercialiser : la coquille vide

* **Prestataire** : champ du Setup (nom, adresse, RC/NIS/NIF/AI/RIB, ville, logo). Il apparaît dans l'en-tête, les e-mails et tous les documents ; aucune donnée d'un client n'est codée en dur.
* Pour livrer à un nouveau prestataire : **Fichier → Créer une copie** du classeur, puis **Pointage → Vider les données** (réponse *Oui* = coquille vide complète : agents, pointages, demandes, documents, contrats, paramètres ; seul le compte admin est conservé) ou, dans l'application, **Setup → Maintenance → Remise à zéro** (confirmation « VIDER »). Le nouveau client lance ensuite **Installer**, déploie sa propre application et saisit son Setup.
* **Réparer / mettre à jour la structure** : recrée les tables manquantes et ajoute les nouvelles colonnes sans perdre de données (utile après une mise à jour du code).

## Base de données (classeur)

| Onglet | Contenu |
|---|---|
| `AAAA-MM` | un onglet par mois au format de la fiche HORIZON : jours 1-31 (T / R / ABS), T, CR, ABS (formules), TOT T, TOT CR, **Reliquat** ; couleurs par mise en forme conditionnelle |
| `Global` | comptage de tout l'effectif : totaux, reliquat, statut du jour, jours restants, prochain changement |
| `Agents`, `Params`, `Contrats`, `Fonctions`, `Attachements`, `Demandes`, `Envois`, `Documents` | tables de l'application (mots de passe hachés et salés, colonnes techniques masquées) |

### Documents des agents : rangement et renommage automatiques

Le responsable d’équipe (ou l'admin) dépose un fichier dans le compte d'un agent ; l'application **reconnaît le document, le renomme et le range dans Google Drive** : dossier **`Documents`, créé à côté du classeur**, puis **un sous-dossier par agent** (`Documents/Mezroua Abdeldjalil/`).

| Document reconnu | Nom donné | Exemple |
|---|---|---|
| Fiche de paie / d'émoluments | `FDP_<Nom>_<mois><année>` | `FDP_Mezroua_mars2026.pdf` |
| Titre de congé | `TC_<Nom>_<jj.mm.aaaa>` (début du congé) | `TC_Mezroua_01.03.2026.pdf` |
| Attestation de travail | `AT_<Nom>_<jj.mm.aaaa>` | `AT_Mezroua_12.02.2026.pdf` |
| Attestation de travail et de salaire | `ATS_<Nom>_<jj.mm.aaaa>` | `ATS_Mezroua_12.02.2026.pdf` |
| Autre | `DOC_<Nom>_<jj.mm.aaaa>_<nom d'origine>` | `DOC_Mezroua_01.10.2026_photo.jpg` |

Reconnaissance : d'abord le **nom du fichier** (ex. « fiche de paie mars 2026 », « TC 01-03-2026 ») ; si le type ou la période n'y sont pas, le **contenu** est lu (OCR Google, PDF et images) pour trouver le type et la date / le mois. Le type peut aussi être choisi à la main. Sans date lisible, la date du dépôt est utilisée. Un doublon reçoit un suffixe (`_2`). Si le texte du document cite un autre agent que celui choisi, un **avertissement** s'affiche. Le résultat est annoncé (« Classé : … d'après le contenu ») et le bouton **Corriger** reclasse / renomme après coup (type et période) — le fichier est aussi renommé dans Drive. Les documents déposés avant la version 1.4 restent où ils sont (ils restent accessibles dans l'application).

## Exports

Fiche de pointage (admin et responsables d’équipe), Attachement, Facture — en **Excel** et **PDF**. Chaque document est composé dans un classeur Google temporaire (mise en forme, couleurs, formules) puis exporté par Google et mis à la corbeille. Logos : renseignez l'ID de fichier Drive dans le Setup.

## Développement et tests

`cd appscript && node --test dev/*.test.js` exécute les **vrais fichiers `.gs`** sur un simulateur de SpreadsheetApp / Drive / Cache / Mail : installation, rôles et accès Setup, création d'agents par le chef, pointage, situation du jour, flux complet des demandes groupées, documents, vidage, exports (attachement N°16 et facture de mai : mêmes chiffres que les documents d'exemple) installateur GitHub (fichiers, types, erreurs), import du bordereau des prix (tableau, texte, CSV, OCR simulé — sur le vrai bordereau des prix du contrat), effectifs bornés par le contrat et véhicules.
`node dev/server.js` lance l'interface complète sur ce simulateur (démo : `admin@demo.local` / `admin1234`, `karim@demo.local` et `hamlaoui@demo.local` / `demo1234`).

## Limites à connaître

* Le code n'a **pas été exécuté sur de vrais services Google** depuis l'environnement de développement (réseau restreint) : la logique, les droits et l'interface sont testés sur simulateur ; les appels propres à Google (mise en forme du classeur, export PDF/Excel par URL, envoi d'e-mail, Drive) sont à valider lors de la première installation. Si un export ne ressemble pas à votre modèle, ajustez `Export.gs` (une fonction par document).
* Les sessions durent 6 h (cache Apps Script). Quotas Google : ~100 e-mails/jour sur un compte gratuit, durée d'exécution 6 min par appel.
* Chaque action recharge les onglets nécessaires : adapté à quelques dizaines d'agents sur quelques années de pointages.

## Organisation du Setup (v1.5)

Cinq onglets : **Contrat** (dépôt du bordereau des prix, synthèse effectifs / facturé / attachements, modification manuelle — le menu « Contrats » disparaît pour qui a accès au Setup), **Prestataire** (société, RC/NIS/NIF/AI/RIB, logo, signature, *direction du prestataire* destinataire des demandes groupées), **Client** (nom, en-tête, adresse de facturation, logo, signature), **Rotation** (jours T/R, effectifs limités au contrat, couleurs), **Maintenance** (admin : réparer la structure, **sauvegarde / restauration**, remise à zéro).
À la lecture du bordereau des prix, le **prestataire** et le **client** lus dans l'en-tête sont proposés puis écrits dans leurs onglets (champs vides seulement). Sauvegarde = copie du classeur dans Drive / `Sauvegardes` ; la restauration (confirmation « RESTAURER ») fait d'abord une sauvegarde de sécurité.

## Rotations et modification groupée (v1.6)

* **Rotation par défaut** : Setup → Rotation, liste de choix (28/28 par défaut, 14/14, 21/21, 42/14, 7/7, 6/2, 3/3, 5/2) ou « Autre rotation… ».
* **Rotation par agent** : champ « Rotation » de la fiche de l'agent (vide = rotation par défaut). Les prévisions « ombres », les jours restants et l'accueil de l'agent utilisent sa propre rotation. Le calcul des effectifs du contrat reste basé sur la rotation par défaut.
* **Modification groupée** : dans la liste des agents, cochez plusieurs lignes ; une barre apparaît en bas pour changer en une fois l'affectation, la rotation, le contrat, le chef (admin) ou le statut. Seuls les champs renseignés sont modifiés ; tout ou rien en cas d'erreur.

## Base de l'attachement (v1.6.1)

Setup → Contrat → « Base de l'attachement » : par défaut la **quantité du mois = jours T réellement pointés** par les agents/VH de la fonction (les jours « prévus » ne comptent pas). Décocher pour revenir à la base du contrat (nombre × jours du mois). Une quantité saisie à la main reste prioritaire.

## Historique des attachements et factures (v1.7)

Setup → Contrat, sous chaque contrat : liste des attachements et factures validés (admin : boutons **Attachement PDF** et **Facture PDF**, rendus à partir de la copie figée) et **tableau récapitulatif par fonction** (précédente, du mois, cumulée, reste à facturer, montant), avec en grisé le brouillon du mois suivant à titre indicatif. Les chefs voient les quantités, sans montants ni brouillon.

## Compte client — veille (v1.8)

Rôle **Client (consultation seule)**, créé par l'administrateur (Agents → Nouvel agent → Rôle). Le **n° de contrat** de la fiche limite ce que le client voit (vide = tout). Il accède à **Pointage** (grille, jours prévus, fiche PDF/Excel) et **Contrat et attachements** (effectifs, quantités, prix et montants, historique, PDF des attachements validés et des factures établies). Il ne voit jamais un brouillon, ne peut rien modifier, et n'a accès ni au Setup, ni aux demandes, ni aux documents des agents. Le compte client n'est pas compté dans le personnel.

## Import d'un pointage Excel (v1.9)

Setup → Maintenance → **Importer un pointage** (admin) : déposez un classeur Excel (.xlsx/.xls) ou CSV, un onglet par mois. Le mois est lu dans le titre « Mois de : Mai 2025 » (ou le nom de l'onglet : `2025-05`, `Mai25`…), les noms dans la colonne « Nom Et Prenom », les jours 1 à 31 ensuite ; T, R/CR et ABS/AB sont reconnus ; les onglets « Cumul » et autres sont ignorés. Les écritures différentes d'un même nom sont regroupées, chaque personne est rapprochée d'un agent existant (proposé si le nom est proche), à créer, ou ignorée. Modes : **compléter** (aucun pointage existant n'est remplacé) ou **remplacer** (le fichier l'emporte ; ses cases vides n'effacent rien) ; période limitable. Les agents créés ont un e-mail provisoire `…@a-completer.invalid`, sans contrat : complétez-les dans Agents (modification groupée).

## Plusieurs clients sur un seul déploiement (v2.0)

* **Annuaire** : onglet `Clients` du classeur principal (code, société, classeur, statut, fin de licence, contact). Tant qu'il est vide, l'application se comporte comme avant (pas de code).
* **Création d'un client** (Clients → Nouveau client, réservé à l'éditeur = administrateur du classeur principal ; pour restreindre : propriété de script `OWNER_EMAILS`, liste d'e-mails) : un classeur vierge est créé dans Drive / `Clients`, avec son administrateur et un mot de passe provisoire ; le message de bienvenue (lien `…/?c=CODE`, code, identifiant) est prêt à envoyer. Dossiers `Documents CODE` et `Sauvegardes CODE` séparés. Au premier client créé, le classeur principal devient lui-même un client de l'annuaire.
* **Connexion** : champ « Code entreprise » (prérempli par le lien d'invitation ou mémorisé). Le même e-mail peut exister chez deux clients. Les sessions portent le client ; suspendre un client ou laisser expirer sa licence bloque ses connexions et sessions ouvertes immédiatement. Les codes inconnus sont limités en essais.
* **PWA** : la page d'accueil demande le code entreprise (ou lit `?c=CODE`) et ouvre le déploiement commun défini par `APP_URL` dans `index.html`.
* **Charte de confidentialité** (texte type, à faire valider juridiquement) : lien « Confidentialité » en bas de chaque page ; source `Charte.gs`, page statique `confidentialite.html` régénérée par `node dev/gen-charte.js`.
* **Un seul champ pour l'utilisateur : le code entreprise** (v2.0.3). L'adresse `/exec` du déploiement est dans `index.html` (`APP_URL`) ; le lien d'invitation `…/pointage-app/?c=CODE` préremplit le code. Si la page affiche « Impossible d'ouvrir le fichier » (Google Drive), le déploiement n'est pas partagé : Déployer → Gérer les déploiements → Modifier → Exécuter en tant que **Moi**, Qui a accès **Tout le monde** → Nouvelle version.
* **Accès aux classeurs créés** : le script les ouvre avec le compte de l'éditeur (aucun partage requis pour l'application) ; les e-mails de `OWNER_EMAILS` y sont ajoutés comme éditeurs ; partage au client en lecture seulement sur demande (case à cocher), car le classeur contient les empreintes des mots de passe.

## Adresse du déploiement : une seule, permanente (v2.3)

Principe : **un seul déploiement permanent**. Un « nouveau build » est une *nouvelle version du même déploiement* : l'adresse `/exec` ne change jamais.
* **Publier** : `.\deploy.ps1` (Windows) ou `./deploy.sh` poussent le code puis mettent à jour le déploiement mémorisé dans `.deployment-id` (créé au premier `.\deploy.ps1 -New`). Ne créez pas d'autre déploiement : archivez les anciens (Déployer → Gérer les déploiements). Réglage du déploiement : exécuter en tant que **Moi**, accès **Tout le monde**.
* **Page d'accueil** (`index.html`, GitHub Pages) : point d'entrée fixe de l'application installée. Elle lit l'adresse dans `exec.json` (à la racine du dépôt ; secours : `APP_URL` dans `index.html`), interroge l'annuaire (`?resolve=CODE`, adresse dédiée éventuelle d'un client) puis ouvre l'application en plein écran. Si l'adresse du déploiement change un jour, il suffit de modifier `exec.json` (et `APP_URL`) : aucune écriture automatique, aucun jeton.
* **Si l'application n'apparaît pas** : vérifiez que `exec.json` pointe sur le déploiement actuel et que celui-ci est ouvert à « Tout le monde ». La page d'accueil n'attend plus de réponse préalable (le démarrage à froid d'Apps Script, de plusieurs secondes, la faisait échouer à tort) et ne s'affiche plus en même temps que l'application.
* L'application s'affiche dans un cadre plein écran de la page d'accueil (l'application installée reste dans sa fenêtre). `?direct` ouvre l'adresse /exec en navigation directe, `?change` rouvre le choix du code, `?reset` oublie code et adresse personnalisée.
* **Annuaire** : le code entreprise ne change pas l'adresse affichée ; l'application retrouve le classeur du client côté serveur. Un client « dédié » (colonne *Adresse /exec dédiée* de la console Clients) a son propre déploiement. « Tester l'accès » (console Clients) vérifie que le script ouvre le classeur du client.
* **Fonctionnement de l'annuaire** (v2.2) : le code entreprise ne change pas l'adresse affichée dans le navigateur. La page d'accueil ouvre toujours l'adresse `/exec` du déploiement, puis l'application utilise le code pour retrouver le classeur du client **côté serveur** (l'identifiant du classeur n'est jamais dans une adresse). Un client « dédié » (colonne *Adresse /exec dédiée* de la console Clients) a son propre déploiement : la page d'accueil interroge l'annuaire (`?resolve=CODE`, qui ne renvoie que le nom et cette adresse) et redirige. « Tester l'accès » (console Clients) vérifie que le script ouvre bien le classeur du client.

## Console de l'éditeur et « À propos » (v2.4)

* **Console** : connectez-vous avec le code entreprise réservé **ADMIN** (lien `…/pointage-app/?c=ADMIN`, ou `#c=ADMIN` après l'adresse `/exec`) et l'e-mail / mot de passe d'un administrateur du classeur principal (restreint à `OWNER_EMAILS` s'il est renseigné). Une seule vue : **Clients** — créer, supprimer (confirmation par le code ; classeur à la corbeille Drive, récupérable 30 jours), suspendre, fin de licence, adresse dédiée, test d'accès, **Gérant : e-mail / mot de passe** (e-mail, nom, nouveau mot de passe ou réinitialisation avec mot de passe provisoire du gérant de l'entreprise), et **Mon contact** (nom, e-mail, téléphone montrés aux clients). Le classeur principal ne se supprime ni ne se suspend pas. Le code ADMIN n'est pas utilisable comme code client.
* **Espace d'un client** : pas d'onglet « Clients ». L'administrateur du client a un onglet **À propos** : statut et fin de licence (alerte à 30 jours), contact de l'éditeur, formulaire de commentaire envoyé par e-mail à l'éditeur (en *reply-to* : l'e-mail de l'utilisateur ; 5 messages par heure).
* **Accès aux comptes en essai** (v2.4.1) : le bouton « Entrer (essai) » ouvre l'espace d'un client dont le statut est *Essai* avec la session de son administrateur (sans mot de passe) ; bannière « Retour à l'administration ». Impossible pour un client « Actif » ou « Suspendu ».

## Export de pointage avec dépendances (v2.5)

* **Exporter** : Setup → Maintenance → *Exporter un pointage (Excel)*. Choisir un contrat (ou « aucun » : tous les agents, pointage seul), une période facultative, et d'inclure ou non les dépendances. Le classeur contient : `Lisez-moi`, `Contrat`, `Fonctions` (désignations, postes, délais, prix), `Agents` (fonction, affectation, contrat, e-mail, rotation, statut…), `Attachements` (quantités saisies), `AttachementsValides` (copies figées et n° de facture), `Params`, puis un onglet `AAAA-MM` par mois pointé. **Aucun mot de passe n'est exporté.**
* **Importer** : le même écran lit cet export en entier. Cases à cocher : contrat/fonctions/prix, quantités saisies, attachements validés et factures (un attachement déjà facturé dans la destination est conservé), paramètres. Les agents créés par l'import reprennent leur fonction, contrat (s'il existe), rotation, affectation, date d'entrée et e-mail ; un mot de passe provisoire est généré et affiché une seule fois.
