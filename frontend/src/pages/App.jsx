import React, { useState, useEffect } from 'react';
import Dashboard from '../components/Dashboard';
import AttendanceCalendar from '../components/AttendanceCalendar';
import Reports from '../components/Reports';
import '../styles/App.css';

export default function App({ user, onLogout }) {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [month, setMonth] = useState(new Date().toISOString().split('T')[0].slice(0, 7));

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard month={month} />;
      case 'calendar':
        return <AttendanceCalendar month={month} />;
      case 'reports':
        return <Reports month={month} />;
      default:
        return <Dashboard month={month} />;
    }
  };

  return (
    <div className="app">
      <nav className="main-nav">
        <div className="nav-left">
          <h1 className="app-title">📋 Pointage ACOSCO</h1>
        </div>

        <div className="nav-center">
          <button
            className={currentPage === 'dashboard' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setCurrentPage('dashboard')}
          >
            📊 Tableau de Bord
          </button>
          <button
            className={currentPage === 'calendar' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setCurrentPage('calendar')}
          >
            📅 Calendrier
          </button>
          <button
            className={currentPage === 'reports' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setCurrentPage('reports')}
          >
            📈 États
          </button>
        </div>

        <div className="nav-right">
          <div className="user-menu">
            <span>{user?.name}</span>
            <button className="btn btn-logout" onClick={onLogout}>
              Déconnexion
            </button>
          </div>
        </div>
      </nav>

      <main className="main-content">
        {renderPage()}
      </main>

      <footer className="app-footer">
        <p>&copy; 2025 ACOSCO - Gestion des Pointages</p>
      </footer>
    </div>
  );
}
