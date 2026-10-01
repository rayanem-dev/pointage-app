import React, { useState, useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Login from './components/Login';
import App from './pages/App';
import './styles/App.css';

function MainApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Vérifier si token existe
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
      setUser({
        id: localStorage.getItem('userId'),
        name: localStorage.getItem('userName'),
        role: localStorage.getItem('userRole')
      });
    }
    setLoading(false);
  }, []);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
    setUser(null);
  };

  if (loading) {
    return <div className="loading-spinner">Chargement...</div>;
  }

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      {isAuthenticated ? (
        <App user={user} onLogout={handleLogout} />
      ) : (
        <Login onLoginSuccess={handleLoginSuccess} />
      )}
    </GoogleOAuthProvider>
  );
}

export default MainApp;
