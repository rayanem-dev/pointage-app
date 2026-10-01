# Pointage ACOSCO

> **Deux versions** : `appscript/` (Google Apps Script — **version recommandée**, 100 % Google, avec demandes groupées par thème, accès Setup au choix, champ Prestataire et coquille vide) et `backend/` + `frontend/` (Node.js + React, version initiale). Voir [`appscript/README.md`](appscript/README.md).


Application web de gestion des pointages du personnel détaché (rotation T / R), avec **Google Sheets comme base de données** et génération des documents à valider avec le client : **fiche de pointage, attachement, facture** (Excel et PDF).

## Les trois espaces

| Rôle | Ce qu'il voit |
|---|---|
| **Agent** | Accueil personnel : jours T / CR / ABS du mois, cumuls, **reliquat (+/−)**, cycle en cours (jour X sur 28, date du prochain changement), calendrier coloré avec **prévisions**. Envoi de demandes (congé, absence, attestation, fiche de paie…) au chef de groupe ou à l'admin. Accès à ses documents (fiches de paie, attestations de travail). |
| **Chef de groupe** | Tout l'espace agent + **formulaire de pointage** (liste déroulante des agents de son groupe, date ou période, T / R / ABS / Effacer), grille mensuelle de son groupe (clic sur une case pour la corriger), traitement des demandes reçues, dépôt de documents dans le compte des agents, export de la fiche. |
| **Admin** | Compte distinct : gestion des agents (métier, affectation, n° de contrat, chef de groupe), **paramètres** (jours de travail / repos du shift — 28 par défaut, modifiables —, couleurs, société), contrats / fonctions / prix, pointage global, **exports**. |

## Base de données Google Sheets

Un seul classeur (`SPREADSHEET_ID`), créé et rempli automatiquement :

| Onglet | Contenu |
|---|---|
| `2026-08`, `2026-09`… | **Un onglet par mois**, même format que la fiche ACOSCO : nom, fonction, jours 1-31 (T/R/ABS), T, CR, ABS (formules `COUNTIF`), TOT T, TOT CR, **Reliquat**. Couleurs appliquées par mise en forme conditionnelle. |
| `Global` | Vue de comptage : totaux T / CR / ABS, reliquat, statut actuel, jour dans le cycle, prochain changement — pour tout l'effectif. |
| `Agents`, `Contrats`, `Fonctions`, `Params`, `Attachements`, `Demandes`, `Documents` | Tables de l'application (modifiables à la main). |

Reliquat = cumul des T − cumul des CR depuis le début (même logique que la colonne *Reliquat* du fichier d'origine).

### Prévisions (jours « prévus »)

Quand un agent est pointé T, les jours suivants sont **T prévu** (vert très clair) jusqu'à la fin du shift (28 jours), puis **R prévu** (orange très clair) pendant 28 jours, et ainsi de suite. La série en cours se compte à travers les mois. Les jours déjà pointés passent en couleur pleine (vert / orange foncé / rouge). Les 5 couleurs et les durées se règlent dans *Paramètres*.

## Documents exportés (admin ; la fiche aussi pour les chefs de groupe)

* **Fiche de pointage** — calquée sur votre modèle (en-tête, grille colorée, totaux T / CR / ABS, signatures), option « inclure les jours prévus ».
* **Attachement N°…** — par contrat et par mois : positions (a), délai de mobilisation (b), quantité contrat (c)=(a)×(b), précédente, du mois, cumulée. Numéro et quantités précédentes sont calculés à partir d'un **mois de référence** (ex. août 2026 = attachement 16, cumul déjà facturé par fonction), à saisir une fois dans *Paramètres → Contrats*. Quantité du mois = positions × jours du mois, modifiable ligne par ligne ; le nombre de jours T réellement pointés est affiché à titre de contrôle.
* **Facture** — quantités de l'attachement × prix unitaires HT, total HT, montant arrêté en lettres, en-tête société.

Logos facultatifs : déposer `backend/assets/logo-client.png` et `backend/assets/logo-societe.png`.

## Installation

```bash
cd backend && npm install && cp .env.example .env     # puis renseigner .env
cd ../frontend && npm install
```

### 1. Compte de service Google (une fois)

1. Google Cloud Console → créer un projet → activer **Google Sheets API**.
2. *IAM → Comptes de service* → créer un compte → *Clés* → créer une clé **JSON**.
3. **Partager le classeur Google Sheets avec l'adresse e-mail du compte de service** (droit *Éditeur*).
4. Dans `backend/.env` : `SPREADSHEET_ID` (l'identifiant dans l'URL du classeur) et `GOOGLE_SERVICE_ACCOUNT_JSON` (contenu du JSON sur une ligne) ou `GOOGLE_APPLICATION_CREDENTIALS` (chemin du fichier). Définir aussi `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

### 2. Lancer

```bash
cd backend && npm run dev        # API sur :5000 — crée le compte admin au premier démarrage
cd frontend && npm run dev       # interface sur http://localhost:5173
```

Production mono-serveur : `cd frontend && npm run build`, puis `cd backend && npm start` (le backend sert `frontend/dist`).

### Démo sans Google

```bash
cd backend && STORAGE=local npm run seed && STORAGE=local npm start
```
Charge la fiche d'août 2026, le contrat et l'attachement N°16 d'exemple (stockage dans `backend/data/db.json`). Comptes : `madani@demo.local` (chef de groupe), `lamine@demo.local` (agent), mot de passe `demo1234`, admin : `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Tests

`cd backend && npm test` — moteur de cycles et prévisions, reliquats, nombres en lettres, API complète (rôles, pointage, demandes, documents) et exports ; l'attachement d'août 2026 et la facture de mai 2026 reproduisent les chiffres des documents d'exemple.

## Limites actuelles

* Les documents déposés (fiches de paie…) sont stockés sur le disque du serveur (`UPLOAD_DIR`). Sur un hébergement à disque éphémère, prévoir un volume persistant.
* Le pilote Google Sheets n'a pas pu être testé contre un vrai classeur dans l'environnement de développement (réseau restreint) : le reste est testé avec le pilote local, qui expose la même interface.
* Pointer sur un agent écrit tout l'onglet du mois (et des mois suivants pour les cumuls) : adapté à quelques dizaines d'agents.
