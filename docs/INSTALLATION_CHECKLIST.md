# ⚡ Checklist Installation - Pas à Pas

## ✅ Phase 1: Préparation (5 min)

### 1. Obtenir Google OAuth Credentials
- [ ] Aller sur https://console.cloud.google.com/
- [ ] Créer un nouveau projet
- [ ] Activer Google Sheets API
- [ ] Créer OAuth 2.0 credentials
- [ ] Copier GOOGLE_CLIENT_ID
- [ ] Copier GOOGLE_CLIENT_SECRET

### 2. MongoDB
- [ ] Installer MongoDB local OU
- [ ] Créer un compte MongoDB Atlas
- [ ] Copier MONGODB_URI

---

## ✅ Phase 2: Backend Setup (5 min)

### 1. Créer dossier
```bash
mkdir pointage-app
cd pointage-app
```

### 2. Setup Backend
```bash
mkdir backend
cd backend

# Créer package.json avec le contenu de backend-package.json
# Créer .env avec le contenu de backend-.env
# Créer src/ folder structure

npm install
```

### 3. Remplir `.env`
```
GOOGLE_CLIENT_ID=VOTRE_ID
GOOGLE_CLIENT_SECRET=VOTRE_SECRET
MONGODB_URI=mongodb://localhost:27017/pointage-app
JWT_SECRET=une_clé_secrète_longue
PORT=5000
```

### 4. Créer structure
```
backend/
├── src/
│   ├── config/
│   │   ├── google.js (contenu: backend-google-config.js)
│   │   └── database.js (à créer)
│   ├── models/
│   │   └── index.js (contenu: backend-models.js)
│   ├── routes/
│   │   ├── auth.js (contenu: backend-auth-routes.js)
│   │   ├── attendance.js (contenu: backend-attendance-routes.js)
│   │   ├── users.js (contenu: backend-users-routes.js)
│   │   └── reports.js (contenu: backend-reports-routes.js)
│   ├── middleware/
│   │   └── auth.js (contenu: backend-auth-middleware.js)
│   └── server.js (contenu: backend-server.js)
├── .env
├── .gitignore
└── package.json
```

### 5. Tester Backend
```bash
npm run dev
# Doit afficher: "🚀 Serveur démarré sur le port 5000"
```

---

## ✅ Phase 3: Frontend Setup (5 min)

### 1. Setup Frontend
```bash
cd ../
mkdir frontend
cd frontend

# Créer package.json avec le contenu de frontend-package.json
# Créer .env avec le contenu de frontend-.env

npm install
```

### 2. Remplir `.env`
```
VITE_GOOGLE_CLIENT_ID=VOTRE_ID
VITE_API_URL=http://localhost:5000/api
```

### 3. Créer structure
```
frontend/
├── public/
├── src/
│   ├── components/
│   │   ├── Login.jsx (contenu: frontend-Login.jsx)
│   │   ├── Dashboard.jsx (contenu: frontend-Dashboard.jsx)
│   │   ├── AttendanceCalendar.jsx (contenu: frontend-AttendanceCalendar.jsx)
│   │   └── Reports.jsx (contenu: frontend-Reports.jsx)
│   ├── pages/
│   │   └── App.jsx (contenu: frontend-App.jsx)
│   ├── styles/
│   │   ├── global.css (contenu: frontend-global.css)
│   │   ├── Dashboard.css (contenu: frontend-Dashboard.css)
│   │   └── AttendanceCalendar.css (contenu: frontend-AttendanceCalendar.css)
│   ├── utils/
│   │   └── api.js (contenu: frontend-api-utils.js)
│   ├── main.jsx (contenu: frontend-main.jsx)
│   └── App.jsx (contenu: frontend-main-App.jsx)
├── index.html (contenu: frontend-index.html)
├── .env
├── .gitignore
├── package.json
└── vite.config.js (contenu: frontend-vite.config.js)
```

### 4. Tester Frontend
```bash
npm run dev
# Doit afficher: "VITE v4.0.0 ready in X ms"
# Accessible sur http://localhost:5173
```

---

## ✅ Phase 4: Test Complet (2 min)

### Terminal 1: MongoDB
```bash
mongod
# ou utiliser MongoDB Atlas (cloud)
```

### Terminal 2: Backend
```bash
cd backend
npm run dev
# Doit afficher: "🚀 Serveur démarré sur le port 5000"
```

### Terminal 3: Frontend
```bash
cd frontend
npm run dev
# Doit afficher: "Local: http://localhost:5173"
```

### Terminal 4: Navigateur
```
Ouvrir: http://localhost:5173
```

---

## ✅ Phase 5: Tester Fonctionnalités

### 1. Authentification
- [ ] Cliquer "Se connecter avec Google"
- [ ] Sélectionner votre compte
- [ ] Être redirigé vers Dashboard

### 2. Dashboard
- [ ] Voir les stats (jours travaillés, etc.)
- [ ] Changer le mois
- [ ] Stats changent

### 3. Calendrier
- [ ] Voir les jours du mois
- [ ] Cliquer sur un jour
- [ ] Modifier le statut (T/R/ABS)
- [ ] Voir la couleur changer

### 4. Rapports
- [ ] Voir ses pointages
- [ ] Exporter en CSV
- [ ] Voir totaux

---

## 🐛 Troubleshooting

### Backend ne démarre pas
```
✓ Vérifier Node.js: node -v
✓ Vérifier dépendances: npm install
✓ Vérifier .env rempli
✓ Vérifier MongoDB tourne
```

### Frontend ne démarre pas
```
✓ Vérifier Node.js: node -v
✓ Vérifier dépendances: npm install
✓ Vérifier .env rempli
✓ Port 5173 libre? (lsof -i :5173)
```

### Erreur Google OAuth
```
✓ Vérifier GOOGLE_CLIENT_ID
✓ Vérifier GOOGLE_CLIENT_SECRET
✓ Vérifier URIs autorisés sur Google Cloud
✓ Vérifier que le projet est activé
```

### Erreur MongoDB
```
✓ Vérifier MongoDB tourne: mongod
✓ Vérifier MONGODB_URI correct
✓ Vérifier credentials si Atlas
```

---

## 📋 Fichiers à Ne Pas Oublier

- [ ] `.env` backend rempli
- [ ] `.env` frontend rempli
- [ ] `.gitignore` (inclure .env)
- [ ] MongoDB configuré
- [ ] Google OAuth credentials

---

## 🎯 Prêt?

- [ ] Toutes les phases complétées
- [ ] Backend: http://localhost:5000/api/health = OK
- [ ] Frontend: http://localhost:5173 = Login visible
- [ ] Google OAuth credentials OK
- [ ] MongoDB connecté

**C'est parti! 🚀**
