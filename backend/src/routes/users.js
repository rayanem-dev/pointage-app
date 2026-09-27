const express = require('express');
const { User, Attendance } = require('../models');

const router = express.Router();

// GET tous les utilisateurs (admin seulement)
router.get('/', async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId);

    if (requester.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const users = await User.find().select('-googleTokens');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET utilisateur par ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-googleTokens');
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT mettre à jour utilisateur (admin seulement)
router.put('/:id', async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId);

    if (requester.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { role, function: func, department } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role, function: func, department },
      { new: true }
    );

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
