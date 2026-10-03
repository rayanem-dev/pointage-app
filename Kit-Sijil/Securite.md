# Revue de sécurité de Sijil (v3.14)

Revue du code de l'application (serveur Apps Script, interface, page d'accueil). Les données de test sont fictives.

## Corrigé dans cette version
| Risque | Gravité | Correction |
|---|---|---|
| **Injection de formules** : un nom, un message ou une remarque commençant par `=` pouvait devenir une formule du classeur (par exemple `IMPORTDATA` envoyant des cellules, dont les empreintes de mots de passe, vers un site extérieur). | Élevée | Tout texte saisi est neutralisé avant écriture (classeur et exports Excel / PDF). Test automatique ajouté. |
| **Envois d'e-mails en masse** (demandes, remarques, codes de réinitialisation) pouvant épuiser le quota d'e-mails ou harceler un responsable d’équipe. | Moyenne | Plafonds par heure et par compte, plafond global pour les codes de réinitialisation. |
| **Fiche de contrôle** : un responsable d’équipe pouvait voir les noms d'agents d'autres groupes. | Faible | Limitée aux agents visibles par l'utilisateur. |
| **Texte libre sans limite** (messages, réponses, notes) | Faible | Longueurs limitées. |
| **Logo** : seul le type annoncé par le navigateur était vérifié. | Faible | Le contenu du fichier est vérifié (PNG, JPG, GIF réels). |

## Vérifié, sans anomalie
- Aucun `innerHTML` avec des données saisies : l'interface construit le texte par nœuds, aucun script injectable.
- Droits : chaque action serveur déclare les profils autorisés ; agent, chef, client et administrateur sont contrôlés côté serveur, y compris le périmètre (groupe, contrat). Console de l'éditeur réservée à l'administrateur du classeur principal.
- Mots de passe : empreinte salée ; blocage après 8 essais ; code de réinitialisation à 6 chiffres (30 min, 5 essais, réponse identique que l'adresse existe ou non) ; « Rester connecté » : empreinte seule conservée, 30 jours, 3 appareils, renouvelé à chaque usage, révoqué au changement de mot de passe.
- Isolation entre entreprises : un classeur par entreprise, session liée au code entreprise, licence vérifiée à chaque appel.
- Page d'accueil : adresses du déploiement validées par un motif strict ; messages entre cadres limités à la langue et au thème.

## Limites et recommandations (à votre main)
1. **Dépôt GitHub public** : l'installateur et `clasp` déploient le code de la branche `main`. Activez la validation en deux étapes sur le compte GitHub, protégez la branche `main`, et rendez le dépôt privé (l'historique ancien contient des données réelles).
2. **Compte Google propriétaire des classeurs** : validation en deux étapes obligatoire ; ne partagez pas le classeur principal ; renseignez la propriété de script `OWNER_EMAILS` (e-mails de l'éditeur).
3. **Empreinte des mots de passe** : SHA-256 itéré 300 fois, limité par Apps Script. Si le classeur fuitait, des mots de passe faibles pourraient être devinés : imposez des mots de passe longs (6 caractères minimum aujourd'hui, 10 recommandés).
4. **Blocage de compte** : 8 essais ratés bloquent un compte 15 minutes (un tiers peut donc gêner un utilisateur, sans jamais entrer).
5. **Adresse du déploiement** accessible à tous (nécessaire) : l'intégration en cadre est autorisée pour la page d'accueil. Apps Script ne permet pas d'ajouter des en-têtes de sécurité.
6. **Autorisations Google** larges (Drive, Sheets, e-mail, projets de script) : nécessaires au fonctionnement ; l'autorisation « projets de script » ne sert qu'à l'installateur automatique, vous pouvez la retirer si vous déployez avec clasp.
7. **Données personnelles** : documents RH dans Drive ; limitez le partage du dossier « Documents » et conservez la charte de confidentialité à jour.
