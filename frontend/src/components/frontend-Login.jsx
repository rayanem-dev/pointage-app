import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import api from '../utils/api';
import '../styles/Login.css';

export default function Login({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = async (credentialResponse) => {
    try {
      setLoading(true);
      setError('');

      const response = await api.post('/auth/google', {
        code: credentialResponse.credential
      });

      // Stocker token et infos utilisateur
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('userId', response.data.user.id);
      localStorage.setItem('userRole', response.data.user.role);

      onLoginSuccess(response.data.user);
    } catch (err) {
      setError('Erreur d\'authentification: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>📋 Pointage ACOSCO</h1>
          <p>Gestion des pointages - Authentification</p>
        </div>

        <div className="login-content">
          <h2>Bienvenue</h2>
          <p>Connectez-vous avec votre compte Google</p>

          <div className="google-login">
            <GoogleLogin
              onSuccess={handleGoogleLogin}
              onError={() => setError('Erreur de connexion Google')}
              text="signin"
              width="300"
            />
          </div>

          {error && <div className="error-message">{error}</div>}
          {loading && <div className="loading">Connexion en cours...</div>}
        </div>

        <div className="login-features">
          <h3>Fonctionnalités:</h3>
          <ul>
            <li>✓ Pointages simples (Travail/Congé/Absence)</li>
            <li>✓ Dashboard avec statistiques</li>
            <li>✓ Calendrier prévisionnel</li>
            <li>✓ États et rapports</li>
            <li>✓ Accès personnalisé par rôle</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
