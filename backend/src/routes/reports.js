const express = require('express');
const { Attendance, User } = require('../models');

const router = express.Router();

// GET rapport mensuel par personne
router.get('/monthly/:userId', async (req, res) => {
  try {
    const { month } = req.query;
    const userId = req.params.userId;

    const requester = await User.findById(req.user.userId);
    if (requester.role === 'agent' && userId !== req.user.userId) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const startDate = new Date(month);
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);

    const attendances = await Attendance.find({
      userId,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 });

    const stats = {
      month: month,
      daysWorked: attendances.filter(a => a.status === 'T').length,
      daysOff: attendances.filter(a => a.status === 'R').length,
      absences: attendances.filter(a => a.status === 'ABS').length,
      total: attendances.length,
      details: attendances
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET rapport global (tous les utilisateurs) - admin seulement
router.get('/global/summary', async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId);
    if (requester.role !== 'admin' && requester.role !== 'manager') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { month } = req.query;
    const startDate = new Date(month);
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);

    const attendances = await Attendance.find({
      date: { $gte: startDate, $lte: endDate }
    }).populate('userId', 'name function');

    // Grouper par personne
    const grouped = {};
    attendances.forEach(att => {
      const userId = att.userId._id;
      if (!grouped[userId]) {
        grouped[userId] = {
          user: att.userId,
          daysWorked: 0,
          daysOff: 0,
          absences: 0
        };
      }
      if (att.status === 'T') grouped[userId].daysWorked++;
      if (att.status === 'R') grouped[userId].daysOff++;
      if (att.status === 'ABS') grouped[userId].absences++;
    });

    res.json(Object.values(grouped));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
