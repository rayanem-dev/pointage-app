# Sijil — version PHP / MySQL

Même application que la version Google Apps Script (mêmes écrans, mêmes droits, mêmes règles), pour un hébergement classique :
**PHP 8.1+ et MySQL / MariaDB** (cPanel, o2switch, OVH, serveur dédié…). Une installation = une société.

L'interface (`public/app.html`) est **générée à partir de la version Apps Script** : elle parle à `api.php` avec exactement les mêmes appels (`login`, `pointer`, `demandesList`…) que sur Google. Le serveur est réécrit en PHP, module par module (un fichier `.gs` ↔ un fichier `.php`).

## Ce qui est disponible

| | PHP / MySQL |
|---|---|
| Connexion, « Rester connecté », mot de passe oublié (code par e-mail) | ✅ |
| Agents, véhicules, rôles, équipes, accès Setup / exports, comptes client et personnel administratif | ✅ |
| Pointage (T / R / ABS), prévisions par rotation, jours fériés, compléter, pointage automatique (cron) | ✅ |
| Demandes : création, acceptation, regroupement, envoi à la direction, réponse, clôture avec document | ✅ |
| Documents : dépôt en vrac, reconnaissance par nom du fichier, renommage, doublons, conversion image → PDF | ✅ |
| Lecture du contenu des scans (OCR) | ⚙️ si `pdftotext` / `tesseract` sont installés sur le serveur |
| Contrats, fonctions et prix, effectifs, attachements, validation, factures | ✅ |
| Exports Excel et PDF (fiche de pointage, attachement, facture) | ✅ (moteurs internes, sans bibliothèque) |
| Export / import d'un pointage Excel avec ses dépendances, lecture du bordereau (Excel, CSV, PDF/image si OCR) | ✅ |
| Remarques du client, nouveautés, charte, aide, 3 langues, mode sombre | ✅ |
| Sauvegarde / restauration (fichiers JSON dans `data/backups`), remise à zéro | ✅ |
| Console éditeur multi-clients, demandes d'essai, licences | ❌ (une installation = une société) |

## Installation (hébergement mutualisé, cPanel)

1. Créez une base MySQL et un utilisateur (cPanel → « Bases de données MySQL »).
2. Envoyez le dossier `php/` sur le serveur. Idéalement le domaine (ou sous-domaine) pointe sur `php/public/`.
   *Si vous ne pouvez publier que `public_html` :* mettez le contenu de `php/public/` dans `public_html/sijil/` et le reste (`src/`, `schema.sql`, `data/`, `config.php`) **à côté** de `public_html` ; créez alors `public_html/sijil/base.txt` contenant le chemin du dossier qui contient `src/` (ex. `/home/monuser/sijil`).
3. Copiez `config.sample.php` en `config.php` et renseignez : base de données, `app_url` (adresse publique, avec `/` final), `mail_from`, `cron_key`.
4. Ouvrez `https://votre-domaine/sijil/install.php` : création des tables et du compte administrateur. **Supprimez ensuite `install.php`.**
5. Tâche planifiée (cPanel → « Tâches cron », toutes les 30 minutes) : `php /home/monuser/sijil/cron.php`
   (ou, sans accès au cron : un service qui appelle `https://votre-domaine/sijil/cron.php?key=<cron_key>` toutes les 30 minutes).
6. Connectez-vous, puis renseignez Setup (prestataire, contrats, rotation) exactement comme sur Apps Script.

Dossiers d'écriture : `data/` (documents déposés, logos, sauvegardes) doit être inscriptible par PHP et **jamais publié** (il contient `.htaccess` qui refuse tout accès). `config.php` ne doit pas être lisible depuis le web.

Extensions PHP nécessaires : `pdo_mysql`, `mbstring`, `zip`, `gd`, `intl` (recommandée). E-mails : `mail()` du serveur ; le domaine de `mail_from` doit avoir des enregistrements SPF/DKIM pour éviter les spams.

## Mettre à jour depuis la version Apps Script

Quand la version Apps Script change, lisez **`PORT.md`** : régénération de l'interface, du schéma et de la configuration (`node appscript/dev/gen-php.js`), liste des `.gs` modifiés depuis la dernière version portée, puis test de parité (`tests/parity.sh`) qui rejoue ≈180 appels sur les deux versions et compare les réponses.

## Tests

```
SIJIL_CONFIG=/chemin/config-test.php sh tests/parity.sh        # parité avec Apps Script (base de TEST : elle est vidée)
SIJIL_CONFIG=/chemin/config-test.php php tests/unit.php        # tests propres à PHP (exports, cron, sauvegardes, mots de passe…)
```
