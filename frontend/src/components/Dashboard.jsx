import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import '../styles/Dashboard.css';

export default function Dashboard() {
  const [stats, setStats] = useState({
    daysWorked: 0,
    daysOff: 0,
    absences: 0,
    balance: 0
  });
  const [user, setUser] = useState(null);
  const [month, setMonth] = useState(new Date().toISOString().split('T')[0].slice(0, 7));

  useEffect(() => {
    loadDashboard();
  }, [month]);

  const loadDashboard = async () => {
    try {
      const response = await api.get(`/attendance/stats/${localStorage.getItem('userId')}?month=${month}-01`);
      setStats(response.data);

      const userResponse = await api.get('/auth/me');
      setUser(userResponse.data);
    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>📊 Tableau de Bord - Pointages</h1>
        <div className="user-info">
          {user && (
            <>
              <img src={user.profileImage} alt={user.name} className="avatar" />
              <span>{user.name} - {user.function}</span>
            </>
          )}
        </div>
      </header>

      <div className="month-selector">
        <label>Mois: </label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>

      <div className="stats-grid">
        <div className="stat-card work">
          <div className="stat-number">{stats.daysWorked}</div>
          <div className="stat-label">Jours travaillés</div>
          <div className="stat-icon">💼</div>
        </div>

        <div className="stat-card off">
          <div className="stat-number">{stats.daysOff}</div>
          <div className="stat-label">Jours de congé</div>
          <div className="stat-icon">🏖️</div>
        </div>

        <div className="stat-card absence">
          <div className="stat-number">{stats.absences}</div>
          <div className="stat-label">Absences</div>
          <div className="stat-icon">❌</div>
        </div>

        <div className="stat-card balance">
          <div className="stat-number" style={{ color: stats.balance >= 0 ? '#4CAF50' : '#f44336' }}>
            {stats.balance > 0 ? '+' : ''}{stats.balance}
          </div>
          <div className="stat-label">Reliquat</div>
          <div className="stat-icon">⚖️</div>
        </div>
      </div>

      <div className="quick-actions">
        <h2>Actions rapides</h2>
        <div className="action-buttons">
          <button className="btn btn-work">✓ Marquer travaillé</button>
          <button className="btn btn-off">☀️ Jour de congé</button>
          <button className="btn btn-absence">✗ Absence</button>
        </div>
      </div>

      <div className="recent-activity">
        <h2>Résumé du mois</h2>
        <div className="activity-chart">
          {/* Graphique à ajouter */}
          <p>Calendrier avec prévisions des jours à venir</p>
        </div>
      </div>
    </div>
  );
}
