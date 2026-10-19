# Suivre la version Apps Script (guide de mise à jour)

**Dernière version portée : 3.37.0** — commit Apps Script de référence : `d83632ce1ba47e64209baeb314664e58fb9d80f2`

## 1. Régénérer ce qui se déduit tout seul
```
node appscript/dev/gen-php.js
```
Met à jour : l'interface (`public/app.html`), la configuration (tables, rôles, types de demandes…, `src/Generated.php`), le journal des nouveautés, la charte et le schéma SQL (`schema.sql`).
Nouvelles colonnes : relancer `install.php` ne suffit pas (il ne modifie pas les tables existantes) ; ajoutez les colonnes avec `ALTER TABLE` indiqué dans les notes de version, ou exécutez `php -r 'require "src/bootstrap.php"; Setup::repairStructure();'` après avoir ajouté la colonne à `schema.sql`.

## 2. Voir ce qui a changé côté serveur
```
git diff --stat d83632ce1ba47e64209baeb314664e58fb9d80f2 -- appscript/*.gs
git diff d83632ce1ba47e64209baeb314664e58fb9d80f2 -- appscript/Demandes.gs        # par module
```
Correspondance des modules :

| Apps Script | PHP | Remarque |
|---|---|---|
| Main.gs (HANDLERS) | src/Rpc.php | mêmes noms d'appels, mêmes rôles |
| Store.gs | src/Store.php, Props.php, Cache.php | MySQL à la place de Sheets ; sessions et « propriétés » en base |
| Config.gs, Changelog.gs, Charte.gs | src/Generated.php (généré) | ne pas modifier à la main |
| Auth.gs, Agents.gs, Params.gs, Contrats.gs, Demandes.gs, Remarques.gs, Documents.gs, DocData.gs, Pointage.gs, Cycle.gs, Holidays.gs, Dates.gs, Format.gs, Mail.gs, Auto.gs, Setup.gs, Archive.gs, Import.gs, Bordereau.gs | src/<même nom>.php (Import.gs → PointageImport.php) | port ligne à ligne ; garder les mêmes messages d'erreur |
| Export.gs | src/Export.php, Sheet.php, Xlsx.php, SheetPdf.php | le document est décrit dans une `Sheet` puis écrit en .xlsx / .pdf |
| Tenants.gs, Prospects.gs, Installer.gs | (non repris) | pas de multi-clients ni de console éditeur |

## 3. Vérifier
```
SIJIL_CONFIG=/chemin/config-test.php sh php/tests/parity.sh
SIJIL_CONFIG=/chemin/config-test.php php php/tests/unit.php
```
Le test de parité rejoue le même scénario (`tests/scenario.js`) sur Apps Script (simulateur) et sur PHP et compare chaque réponse (identifiants et dates normalisés). Pour une nouvelle fonctionnalité, **ajoutez des pas au scénario** : un écart apparaît tout de suite.
Écarts volontaires : console éditeur (`me.owner`), lecture automatique des scans (OCR), tâche planifiée (cron.php).

## 4. Après la mise à jour
Mettez à jour la version et le commit de référence en tête de ce fichier.
