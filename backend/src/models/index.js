const mongoose = require('mongoose');

// Schéma Utilisateur
const userSchema = new mongoose.Schema({
  googleId: String,
  email: String,
  name: String,
  function: String,
  role: {
    type: String,
    enum: ['admin', 'manager', 'agent'],
    default: 'agent'
  },
  department: String,
  googleTokens: {
    access_token: String,
    refresh_token: String,
    expiry_date: Number
  },
  profileImage: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schéma Pointage
const attendanceSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  date: Date,
  status: {
    type: String,
    enum: ['T', 'R', 'ABS', null],
    default: null
  },
  notes: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schéma Résumé Mensuel
const summarySchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  month: Date,
  daysWorked: Number,
  daysOff: Number,
  absences: Number,
  balance: Number,
  notes: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);
const Summary = mongoose.model('Summary', summarySchema);

module.exports = { User, Attendance, Summary };
