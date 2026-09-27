const express = require('express');
const { Attendance, Summary, User } = require('../models');
const { readSheetData, writeSheetData } = require('../config/google');

const router = express.Router();

// GET tous les pointages de l'utilisateur (ou équipe si manager/admin)
router.get('/', async (req, res) => {
  try {
    const { month, userId } = req.query;
    const user = await User.findById(req.user.userId);

    let filter = {};

    // Si admin, peut voir tous ; si manager, voir son équipe ; sinon juste lui-même
    if (user.role === 'agent') {
      filter.userId = req.user.userId;
    } else if (userId && user.role !== 'agent') {
      filter.userId = userId;
    }

    if (month) {
      const startDate = new Date(month);
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      filter.date = { $gte: startDate, $lte: endDate };
    }

    const attendances = await Attendance.find(filter).sort({ date: 1 });
    res.json(attendances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET statistiques utilisateur
router.get('/stats/:userId', async (req, res) => {
  try {
    const { month } = req.query;
    const userId = req.params.userId;

    // Vérifier les permissions
    const user = await User.findById(req.user.userId);
    if (user.role === 'agent' && userId !== req.user.userId) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    let filter = { userId };
    if (month) {
      const startDate = new Date(month);
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      filter.date = { $gte: startDate, $lte: endDate };
    }

    const attendances = await Attendance.find(filter);

    const stats = {
      daysWorked: attendances.filter(a => a.status === 'T').length,
      daysOff: attendances.filter(a => a.status === 'R').length,
      absences: attendances.filter(a => a.status === 'ABS').length,
      balance: 0 // À calculer selon votre logique
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST ajouter/modifier un pointage
router.post('/', async (req, res) => {
  try {
    const { date, status, userId } = req.body;
    const user = await User.findById(req.user.userId);

    // Vérifier permissions
    if (user.role === 'agent' && userId !== req.user.userId) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const existingAttendance = await Attendance.findOne({
      userId,
      date: new Date(date)
    });

    if (existingAttendance) {
      existingAttendance.status = status;
      await existingAttendance.save();
    } else {
      const attendance = new Attendance({
        userId,
        date: new Date(date),
        status
      });
      await attendance.save();
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
