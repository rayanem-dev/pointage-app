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

## Version PHP / MySQL (`php/`)

Reflète la version Apps Script : après chaque changement de `appscript/`, régénérer (`node appscript/dev/gen-php.js`), reporter à la main la logique dans `php/src/` et rejouer la parité (`SIJIL_CONFIG=/tmp/sijil_test_config.php sh php/tests/parity.sh`, MariaDB local à démarrer).
