const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const usersRoutes = require('./routes/users');
const reportsRoutes = require('./routes/reports');
const authMiddleware = require('./middleware/auth');

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pointage-app')
  .then(() => console.log('MongoDB connecté'))
  .catch(err => console.error('Erreur MongoDB:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', authMiddleware, attendanceRoutes);
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/reports', authMiddleware, reportsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
