# 📋 Application de Gestion des Pointages - Guide Complet

## 🎯 Vue d'ensemble

Application web complète pour gérer les pointages du personnel ACOSCO avec :
- ✅ Authentification Google OAuth
- ✅ Dashboard avec statistiques (jours travaillés, congés, reliquats)
- ✅ Calendrier interactif pour pointage (T/R/ABS)
- ✅ Prévisions des jours en couleur
- ✅ États et rapports (par jour/personne)
- ✅ Gestion des rôles (Admin/Manager/Agent)
- ✅ Synchronisation avec Google Sheets
- ✅ Interface moderne et responsive

---

## 🏗️ Architecture Globale

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend React (Vite)                     │
│  - Authentification Google OAuth                              │
│  - Dashboard avec statistiques                                │
│  - Calendrier interactif                                      │
│  - États et rapports                                          │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTP/REST
┌──────────────────▼──────────────────────────────────────────┐
│               Backend Node.js/Express                         │
│  - Routes API sécurisées (JWT)                               │
│  - Authentification Google OAuth                              │
│  - Gestion des pointages                                      │
│  - Calcul des statistiques                                    │
│  - Rapports et exports                                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────┴─────────────┐
        │                        │
┌───────▼────────┐    ┌─────────▼──────────────┐
│    MongoDB     │    │ Google Sheets API      │
│  - Utilisateurs│    │ - Synchronisation      │
│  - Pointages   │    │ - Lecture/Écriture     │
│  - Résumés     │    │ - Export données       │
└────────────────┘    └────────────────────────┘
```

---

## 🚀 Installation et Configuration

### Prérequis

- Node.js 16+ 
- MongoDB (local ou Atlas)
- Google OAuth credentials
- Google Sheets API credentials

### 1️⃣ Configuration Google OAuth

**Étapes:**
1. Aller sur [Google Cloud Console](https://console.cloud.google.com/)
2. Créer un nouveau projet
3. Activer l'API Google Sheets et OAuth 2.0
4. Créer des identifiants OAuth 2.0 (type: application web)
5. Ajouter les URIs autorisés:
   - `http://localhost:3000` (dev frontend)
   - `http://localhost:5000` (dev backend)

**Récupérer:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`

### 2️⃣ Configuration MongoDB

```bash
# Option 1: Local
mongod

# Option 2: MongoDB Atlas
# Créer un cluster sur https://www.mongodb.com/cloud/atlas
# URI: mongodb+srv://username:password@cluster.mongodb.net/pointage-app
```

### 3️⃣ Setup Backend

```bash
cd backend
npm install

# Créer fichier .env
cp .env.example .env

# Remplir les variables:
# - GOOGLE_CLIENT_ID
# - GOOGLE_CLIENT_SECRET
# - MONGODB_URI
# - JWT_SECRET

npm run dev
# Serveur sur http://localhost:5000
```

### 4️⃣ Setup Frontend

```bash
cd frontend
npm install

# Créer fichier .env
cp .env.example .env

# Remplir les variables:
# - VITE_GOOGLE_CLIENT_ID
# - VITE_API_URL=http://localhost:5000/api

npm run dev
# App sur http://localhost:5173
```

---

## 📊 Utilisation

### Page de Connexion
- Cliquer sur "Se connecter avec Google"
- Sélectionner le compte Google
- Authentification automatique

### Tableau de Bord
Affiche les statistiques du mois en cours:
- 💼 Jours travaillés
- 🏖️ Jours de congé
- ❌ Absences
- ⚖️ Reliquat (balance)

### Calendrier des Pointages
- Voir tous les jours du mois
- Couleurs: 🟢 Travail | 🔵 Congé | 🔴 Absence | ⚪ Non pointé
- Cliquer sur un jour pour le modifier
- Boutons rapides: T (Travail) / R (Congé) / ABS (Absence)

### États et Rapports
**Vue personnelle:**
- Voir son pointage du mois
- Statistiques individuelles

**Vue globale (Admin/Manager):**
- Tous les pointages
- Comparer les équipes
- Exporter en CSV

### Rôles et Permissions

| Rôle | Dashboard | Calendrier | Mon Pointage | Tous Pointages | Gestion Utilisateurs |
|------|-----------|-----------|-------------|----------------|---------------------|
| **Agent** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Manager** | ✅ | ✅ | ✅ | ✅ (équipe) | ❌ |
| **Admin** | ✅ | ✅ | ✅ | ✅ (tous) | ✅ |

---

## 🔌 Intégration Google Sheets

L'application peut lire/écrire dans un Google Sheets existant.

### Configuration

1. Créer un fichier Google Sheets
2. Partager avec le compte de service Google
3. Ajouter l'ID du Sheets dans `.env`

```
GOOGLE_SPREADSHEET_ID=1y5OhWHPPt8VgXXov8HIJ0k1z5DrtB01WuCjGnWpTMao
```

### API Endpoints

```bash
# Authentification
POST /api/auth/google
GET  /api/auth/me

# Pointages
GET  /api/attendance?month=2025-05
GET  /api/attendance/stats/:userId
POST /api/attendance (ajouter/modifier)

# Rapports
GET /api/reports/monthly/:userId?month=2025-05
GET /api/reports/global/summary?month=2025-05

# Utilisateurs (Admin)
GET  /api/users
GET  /api/users/:id
PUT  /api/users/:id
```

---

## 🎨 Personnalisation

### Changer les couleurs

Modifier les fichiers CSS:
- `frontend/src/styles/Dashboard.css`
- `frontend/src/styles/AttendanceCalendar.css`

```css
.stat-card.work {
  background: linear-gradient(135deg, #4CAF50, #45a049);
}
```

### Ajouter des colonnes/données

1. Modifier le schéma MongoDB (`backend/src/models/index.js`)
2. Mettre à jour les routes API
3. Ajouter les champs dans les composants React

---

## 🐛 Dépannage

### "Token invalide"
- Vérifier que JWT_SECRET est défini
- Vérifier que le token n'a pas expiré
- Se reconnecter

### "Connexion MongoDB échouée"
- Vérifier que MongoDB tourne (`mongod`)
- Vérifier l'URI dans `.env`
- Vérifier les credentials MongoDB Atlas

### "Erreur Google OAuth"
- Vérifier GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET
- Vérifier les URIs autorisés sur Google Cloud
- Vérifier que le callback URL est correct

### Pas de données du Sheets
- Vérifier le GOOGLE_SPREADSHEET_ID
- Vérifier que le compte de service a accès
- Vérifier l'API Sheets est activée

---

## 📦 Déploiement Production

### Backend (Heroku)
```bash
cd backend
heroku create pointage-app-backend
heroku config:set GOOGLE_CLIENT_ID=...
heroku config:set GOOGLE_CLIENT_SECRET=...
heroku config:set MONGODB_URI=...
git push heroku main
```

### Frontend (Vercel)
```bash
cd frontend
vercel
# Ajouter variables d'environnement dans Vercel
```

---

## 📋 Checklist Déploiement

- [ ] MongoDB configuré et accessible
- [ ] Google OAuth credentials configurés
- [ ] Google Sheets API activée
- [ ] Variables d'environnement définies (.env)
- [ ] Backend teste: `npm run dev`
- [ ] Frontend teste: `npm run dev`
- [ ] Auth Google fonctionne
- [ ] Calendrier fonctionne
- [ ] États et rapports fonctionnent
- [ ] Export CSV fonctionne

---

## 📞 Support

Pour toute question ou problème:
1. Vérifier les logs (`console.log` ou `tail -f backend.log`)
2. Vérifier les variables d'environnement
3. Consulter la documentation officielle:
   - Google OAuth: https://developers.google.com/identity/protocols/oauth2
   - Google Sheets API: https://developers.google.com/sheets/api
   - MongoDB: https://docs.mongodb.com
