# Application de Gestion des Pointages - Architecture

## 📋 Structure du Projet

```
pointage-app/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── google.js (Google OAuth & Sheets API)
│   │   │   └── database.js (MongoDB)
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Attendance.js
│   │   │   └── Summary.js
│   │   ├── routes/
│   │   │   ├── auth.js (Google OAuth)
│   │   │   ├── attendance.js (Pointages)
│   │   │   ├── users.js (Gestion utilisateurs)
│   │   │   └── reports.js (Rapports/États)
│   │   ├── middleware/
│   │   │   └── auth.js (Vérification JWT)
│   │   ├── controllers/
│   │   │   ├── attendanceController.js
│   │   │   └── reportController.js
│   │   └── server.js (Point d'entrée)
│   ├── .env (Variables d'environnement)
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx (Page d'accueil)
│   │   │   ├── AttendanceCalendar.jsx (Calendrier pointage)
│   │   │   ├── QuickCheck.jsx (Pointage rapide)
│   │   │   ├── Statistics.jsx (Statistiques)
│   │   │   ├── Reports.jsx (États)
│   │   │   └── UserProfile.jsx
│   │   ├── pages/
│   │   │   ├── HomePage.jsx
│   │   │   ├── AttendancePage.jsx
│   │   │   ├── ReportsPage.jsx
│   │   │   └── AdminPage.jsx
│   │   ├── context/
│   │   │   └── AuthContext.js (Contexte authentification)
│   │   ├── hooks/
│   │   │   └── useAuth.js
│   │   ├── utils/
│   │   │   ├── api.js (Appels API)
│   │   │   └── calculations.js (Calculs statistiques)
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
└── README.md
```

## 🔌 Intégrations

- **Google OAuth 2.0** : Authentification personnalisée
- **Google Sheets API** : Synchronisation des données
- **MongoDB** : Stockage des sessions et données
- **JWT** : Tokens sécurisés

## 📊 Données Gérées

- Pointages journaliers (T/R/ABS)
- Statistiques : jours travaillés, congés, reliquats
- Historique complet par personne
- Prévisions/calendrier couleur
- États par jour et par personne

## 👥 Rôles

- **Admin** : Gestion complète, accès tous les utilisateurs
- **Manager** : Consultation équipe
- **Agent** : Accès à ses données uniquement
