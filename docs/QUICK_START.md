# Installation Rapide - 10 minutes

## 🚀 Démarrer l'application en local

### 1. Cloner/Télécharger le projet
```bash
cd pointage-app
```

### 2. Backend (Terminal 1)
```bash
cd backend

# Installer dépendances
npm install

# Créer et remplir .env avec:
# - GOOGLE_CLIENT_ID=votre_id
# - GOOGLE_CLIENT_SECRET=votre_secret
# - MONGODB_URI=mongodb://localhost:27017/pointage-app
# - JWT_SECRET=your_secret_key

# Démarrer
npm run dev

# Serveur: http://localhost:5000
```

### 3. Frontend (Terminal 2)
```bash
cd frontend

# Installer dépendances
npm install

# Créer et remplir .env avec:
# - VITE_GOOGLE_CLIENT_ID=votre_id
# - VITE_API_URL=http://localhost:5000/api

# Démarrer
npm run dev

# App: http://localhost:5173
```

### 4. Base de données
```bash
# Terminal 3 - Démarrer MongoDB
mongod

# Ou utiliser MongoDB Atlas (cloud)
# Ajouter URI dans backend/.env
```

### 5. Utiliser l'app
1. Ouvrir http://localhost:5173
2. Cliquer "Se connecter avec Google"
3. Sélectionner votre compte
4. Accepter les permissions
5. Profit! 🎉

---

## 🔐 Obtenir Google OAuth Credentials (5 min)

1. Aller sur https://console.cloud.google.com/
2. Créer nouveau projet
3. Menu -> APIs & Services -> Credentials
4. Create Credentials -> OAuth 2.0 Client IDs
5. Type: Web application
6. Authorized redirect URIs:
   - `http://localhost:5000/api/auth/google/callback`
   - `http://localhost:5173`
7. Copier Client ID et Client Secret -> dans les .env

---

## ✨ Fonctionnalités Principales

### Dashboard 📊
- Voir jours travaillés/congés/absences/reliquat
- Sélectionner le mois
- Actions rapides pour pointage

### Calendrier 📅
- Grille visuelle du mois
- Cliquer jour pour modifier
- 4 statuts: Travail (🟢) | Congé (🔵) | Absence (🔴) | Non pointé (⚪)

### États 📈
- Vue personnelle: mes pointages
- Vue globale: tous les pointages (Admin/Manager)
- Exporter en CSV

### Rôles 👥
- **Agent**: Voir ses données
- **Manager**: Voir équipe
- **Admin**: Tout accès

---

## 🐛 Problèmes Courants

| Problème | Solution |
|----------|----------|
| "Cannot GET /" | Frontend pas lancé: `npm run dev` dans frontend/ |
| Erreur connexion Google | Vérifier GOOGLE_CLIENT_ID dans .env |
| Pas de données | MongoDB pas lancé ou URI mauvaise |
| API 401 | Vérifier token dans localStorage |

---

## 🎯 Architecture Simple

```
Frontend (React)
    ↓
Backend (Node.js/Express)
    ↓
┌───────────────────────┐
│ MongoDB + Google API  │
└───────────────────────┘
```

## 📱 Responsif

- ✅ Desktop
- ✅ Tablet
- ✅ Mobile

## 🔒 Sécurité

- ✅ JWT tokens
- ✅ Google OAuth
- ✅ CORS configuré
- ✅ Vérification rôles

---

## 🎓 Prochaines Étapes

1. **Customization**: Modifier couleurs/layout (CSS)
2. **Features**: Ajouter notifications, rapports avancés
3. **Deploy**: Heroku (backend) + Vercel (frontend)
4. **Intégration**: Connecter Google Sheets pour sync auto
