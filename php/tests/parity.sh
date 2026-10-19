#!/bin/sh
# Test de parité : le même scénario (≈180 appels : agents, pointage, demandes, documents, attachements…) est joué
# sur la version Apps Script (simulateur Node) et sur la version PHP / MySQL, puis les réponses sont comparées.
# Prérequis : node, php (pdo_mysql), une base MySQL/MariaDB VIDE et jetable (elle est effacée !), config de test :
#   SIJIL_CONFIG=/chemin/config-test.php sh php/tests/parity.sh
set -e
cd "$(dirname "$0")/.."
[ -n "$SIJIL_CONFIG" ] || { echo "Définissez SIJIL_CONFIG (config.php d'une base de TEST, elle sera vidée)"; exit 2; }
node tests/scenario.js
node tests/run-node.js /tmp/sijil-out-node.json
php tests/run-php.php /tmp/sijil-out-php.json
node tests/compare.js /tmp/sijil-out-node.json /tmp/sijil-out-php.json || { echo "Différences attendues : « me /owner » (pas de console éditeur en PHP), « lecture automatique » (OCR) et « declencheur » (cron)."; exit 1; }
