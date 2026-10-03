#!/bin/sh
# Publie le code ET met à jour le déploiement EXISTANT : l'adresse /exec ne change jamais.
#   ./deploy.sh        -> clasp push + nouvelle version du déploiement mémorisé (.deployment-id)
#   ./deploy.sh new    -> crée un nouveau déploiement (nouvelle adresse) et le mémorise
set -e
cd "$(dirname "$0")"
clasp push --force
if [ "$1" != "new" ] && [ -f .deployment-id ]; then
  clasp deploy --deploymentId "$(cat .deployment-id)" --description "${DESC:-mise a jour}"
else
  out=$(clasp deploy --description "${DESC:-mise a jour}"); echo "$out"
  id=$(echo "$out" | grep -o 'AKfy[A-Za-z0-9_-]*' | head -1); [ -n "$id" ] && echo "$id" > .deployment-id && echo "Déploiement mémorisé : $id"
fi
