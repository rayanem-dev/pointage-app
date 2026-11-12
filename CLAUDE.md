# Sijil — consignes pour Claude

Répondre en français. Commit et push directement sur `main` (déploiement automatique Apps Script via `.github/workflows/deploy.yml` quand `appscript/**` change). Chaque version : `Config.gs` (VERSION), `Changelog.gs` (Nouveautés publiques ; `# ` = personnel, `§ ` = éditeur), puis `gen-changelog.js`, `gen-version.js`, `gen-i18n.js`, `gen-php.js`, et `node --test dev/*.test.js` dans `appscript/`.

## Le kit commercial comprend la vitrine JawlaDev

Le « kit com » n'est pas seulement le dossier `Kit-Sijil/`. Il a quatre parties, à tenir à jour ensemble à chaque évolution visible de Sijil :

1. **Sources** : `docs/build/` (`content.py` = texte du manuel, `build_manual.py`, `build_deck.py`), `mail/build_mails.py`, captures dans `docs/captures/` (entreprise fictive : `appscript/dev/server.js` fournit le jeu de démonstration, personnel et matériel).
2. **Documents produits** : `docs/Sijil-Manuel.{docx,pdf}`, `docs/Sijil-Presentation.pptx`, `mail/email-*.{html,txt}`.
3. **Copie à déposer dans Drive** : `Kit-Sijil/` (recopier les documents et les e-mails ci-dessus ; `Kit-Sijil/LISEZMOI.txt`).
4. **Vitrine JawlaDev** (dépôt `rayanem-dev/jawladev`, publié par GitHub Pages à chaque push sur `main`) : `assets/data.js` (fiche Sijil : `tagline`, `desc`, `pitch` en FR/EN/AR, `points`, `shots`, `releases`), `assets/img/sijil-*.jpg` (captures, 1100 px de large), `assets/docs/Sijil-Presentation.pptx` (copie de la présentation), `version.json` (à changer à chaque mise à jour, format `AAAA.MM.JJ.n`).

Captures : `cd appscript && SIJIL_DATE=2026-10-15T09:00:00 node -r ./dev/freeze-date.js dev/captures.js /tmp/cap` (jeu de démonstration de `dev/server.js`, date figée, Playwright) produit toutes les captures (écrans des 4 rôles, arabe, mode sombre, mobile, aide) ; puis `python3 docs/build/images.py /tmp/cap /home/user/jawladev` les range pour le manuel et la présentation (`docs/captures/`), les e-mails (`mail/img/`, servis par GitHub Pages : ils ne changent chez le lecteur qu'après push), l'aide intégrée (`help/`) et la vitrine. Ne jamais laisser d'anciennes captures : à chaque évolution visible, tout régénérer.

Mettre en avant TOUT ce que le logiciel sait faire (voir `FEATURES` dans `docs/build/content.py`, la diapositive « Tout ce que Sijil sait faire », les e-mails, la fiche JawlaDev) et tenir l'aide intégrée (`appscript/dev/help-data.json`) à jour, en français, anglais et arabe.

Procédure : modifier l'application → régénérer manuel (`python3 docs/build/build_manual.py`, puis PDF avec Chromium depuis `/tmp/manuel.html`), présentation (`build_deck.py`), e-mails (`mail/build_mails.py`) → recopier dans `Kit-Sijil/` → mettre à jour la fiche Sijil de JawlaDev (texte trilingue, captures, `.pptx`, note de version, `version.json`) → vérifier que `assets/data.js` se charge → pousser les deux dépôts.

Positionnement à reprendre partout : « Gestion du temps de travail qui prend en charge les rotations ; gère la mise à disposition du personnel et du matériel de prestation de services, de A à Z : du bordereau des prix jusqu'à l'attachement et à la facture. » La facturation est un module que l'administrateur active ou désactive (Setup → Contrat). Le matériel (camion 2,5 tonnes, rétrochargeur, véhicule 4x4…) est pointé comme le personnel.

## Documents : lecture et renommage sur le poste

- Le moteur de reconnaissance (`appscript/dev/autodetect-renommage.js`) est la copie telle quelle de la brique `rayanem-dev/lib` → `_autodetect-renommage` ; la lecture locale (pdf.js, Tesseract, renommage sur place, .zip) est `appscript/dev/local.js`. `node dev/gen-detecter.js` produit `Detecter.html` (inclus par `Index.html`, listé dans `files.json`). Toute correction de reconnaissance dans `Documents.gs` (et `php/src/Documents.php`) est reportée dans la brique `lib` (puis recopiée ici), pour que Sijil et le portail restent identiques.
- La case « Lire et renommer les fichiers sur mon PC » est cochée par défaut ; la case « Reconnaître l'agent automatiquement » envoie `auto_agent:false` à `depotAdd` quand elle est décochée. L'étape suivante est inchangée : liste « À vérifier avant envoi » puis envoi vers l'espace des agents.
- `showDirectoryPicker` est refusé dans l'iframe d'Apps Script : le renommage sur place peut échouer (message clair, repli sur l'archive .zip). Dans le bac à sable, pdf.js se teste en interceptant les URL cdnjs (voir `dev/e2e-demo.js`).

## Import des agents et fiche RH

- `appscript/AgentsImport.gs` (miroir `php/src/AgentsImport.php`) : `agentsImportAnalyser` (rien n'est écrit) puis `agentsImportAppliquer`, et `ficheRhGet` / `ficheRhSave`. Tout est réservé à l'administrateur (rôle vérifié dans le dispatcher ET dans le module).
- La fiche RH (table `FichesRH`) contient des données personnelles sensibles : jamais renvoyée par `agentsManage` ni par un autre appel, jamais dans un e-mail, jamais dans un jeu d'essai ou une capture (entreprise et personnes fictives uniquement). Un fichier RH envoyé par l'utilisateur ne va jamais dans le dépôt.
- Version PHP : une installation existante doit créer la table `FichesRH` (voir `php/schema.sql`).

## Démonstration (essai public) et parcours de test

- **Entreprise DEMO** (`appscript/Demo.gs`) : identifiant `demo`, mot de passe `demo` (comptes `demo-chef`, `demo-agent`, `demo-client`), données fictives relatives à la date du jour, remise à zéro chaque nuit par la tâche planifiée (`Auto.run` → `Demo.tick`). Créée / remise à zéro par l'éditeur : Clients → Démonstration. Protections : aucun e-mail réel (`Mail.send`), mot de passe, vidage et sauvegarde verrouillés (`Demo.blocked`), dépôts limités (`Demo.checkUpload`). Tout nouveau point d'entrée de fichier ou d'e-mail doit respecter ces règles. Lien d'essai : `https://rayanem-dev.github.io/pointage-app/?c=DEMO`.
- **Parcours complet dans un navigateur** : `cd appscript && SIJIL_DEMO=1 node dev/e2e-demo.js /tmp/e2e` (entre avec demo / demo, teste tous les onglets des 4 profils, relève erreurs JavaScript et appels refusés). À rejouer après toute évolution de l'interface ; corriger les défauts trouvés.
- **Captures de la démonstration** : `SIJIL_DEMO=1 SIJIL_DATE=… node -r ./dev/freeze-date.js dev/captures.js /tmp/cap` (écran d'essai, bandeau, aide), en plus des captures habituelles.
- Python : si `PIL` plante, `python3 -m pip install --target /tmp/pylibs pillow python-docx python-pptx` puis `PYTHONPATH=/tmp/pylibs`.
- Travailler sur la branche `main` (la branche de session peut contenir un ancien état).

## Version PHP / MySQL (`php/`)

Reflète la version Apps Script : après chaque changement de `appscript/`, régénérer (`node appscript/dev/gen-php.js`), reporter à la main la logique dans `php/src/` et rejouer la parité (`SIJIL_CONFIG=/tmp/sijil_test_config.php sh php/tests/parity.sh`, MariaDB local à démarrer).
