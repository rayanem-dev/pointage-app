const express = require('express');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { oauth2Client, getTokens } = require('../config/google');

const router = express.Router();

// Route de callback Google OAuth
router.post('/google', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Code manquant' });
    }

    // Obtenir les tokens
    const tokens = await getTokens(code);

    // Obtenir les infos utilisateur
    oauth2Client.setCredentials(tokens);
    const { data } = await oauth2Client.request({
      url: 'https://www.googleapis.com/oauth2/v2/userinfo'
    });

    // Chercher ou créer utilisateur
    let user = await User.findOne({ googleId: data.id });

    if (!user) {
      user = new User({
        googleId: data.id,
        email: data.email,
        name: data.name,
        profileImage: data.picture,
        googleTokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          expiry_date: tokens.expiry_date
        }
      });
      await user.save();
    } else {
      // Mettre à jour les tokens
      user.googleTokens = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || user.googleTokens.refresh_token,
        expiry_date: tokens.expiry_date
      };
      await user.save();
    }

    // Créer JWT
    const jwtToken = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      token: jwtToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        function: user.function
      }
    });

  } catch (error) {
    console.error('Erreur authentification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour obtenir le profil actuel
router.get('/me', async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout (côté client supprimer le token)
router.post('/logout', (req, res) => {
  res.json({ message: 'Déconnecté' });
});

module.exports = router;
