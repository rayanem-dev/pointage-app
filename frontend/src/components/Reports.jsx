import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import '../styles/Reports.css';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [month, setMonth] = useState(new Date().toISOString().split('T')[0].slice(0, 7));
  const [view, setView] = useState('personal'); // personal ou global

  useEffect(() => {
    loadReports();
  }, [month, view]);

  const loadReports = async () => {
    try {
      if (view === 'personal') {
        const response = await api.get(`/reports/monthly/${localStorage.getItem('userId')}?month=${month}-01`);
        setReports([response.data]);
      } else {
        const response = await api.get(`/reports/global/summary?month=${month}-01`);
        setReports(response.data);
      }
    } catch (error) {
      console.error('Erreur chargement rapports:', error);
    }
  };

  const exportToCSV = () => {
    if (!reports.length) return;

    let csv = 'Nom,Fonction,Jours Travaillés,Congés,Absences,Reliquat\n';

    reports.forEach(report => {
      csv += `${report.user?.name || 'N/A'},${report.user?.function || 'N/A'},${report.daysWorked},${report.daysOff},${report.absences},${report.balance || 0}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pointages_${month}.csv`;
    a.click();
  };

  return (
    <div className="reports">
      <header className="reports-header">
        <h1>📊 États et Rapports</h1>
      </header>

      <div className="reports-controls">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />

        <div className="view-toggle">
          <button
            className={view === 'personal' ? 'active' : ''}
            onClick={() => setView('personal')}
          >
            Mon Pointage
          </button>
          <button
            className={view === 'global' ? 'active' : ''}
            onClick={() => setView('global')}
          >
            Tous les Pointages
          </button>
        </div>

        <button className="btn btn-export" onClick={exportToCSV}>
          📥 Exporter CSV
        </button>
      </div>

      <div className="reports-table">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Fonction</th>
              <th>Jours Travaillés</th>
              <th>Congés</th>
              <th>Absences</th>
              <th>Reliquat</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report, idx) => (
              <tr key={idx}>
                <td>{report.user?.name || 'N/A'}</td>
                <td>{report.user?.function || 'N/A'}</td>
                <td className="work">{report.daysWorked}</td>
                <td className="off">{report.daysOff}</td>
                <td className="absence">{report.absences}</td>
                <td className={report.balance >= 0 ? 'positive' : 'negative'}>
                  {report.balance >= 0 ? '+' : ''}{report.balance || 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="reports-summary">
        <h3>Résumé du mois</h3>
        <div className="summary-stats">
          <div className="summary-item">
            <span>Total jours travaillés:</span>
            <strong>{reports.reduce((sum, r) => sum + r.daysWorked, 0)}</strong>
          </div>
          <div className="summary-item">
            <span>Total congés:</span>
            <strong>{reports.reduce((sum, r) => sum + r.daysOff, 0)}</strong>
          </div>
          <div className="summary-item">
            <span>Total absences:</span>
            <strong>{reports.reduce((sum, r) => sum + r.absences, 0)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
