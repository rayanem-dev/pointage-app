import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import '../styles/AttendanceCalendar.css';

export default function AttendanceCalendar({ month }) {
  const [attendances, setAttendances] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadAttendances();
  }, [month]);

  const loadAttendances = async () => {
    try {
      const response = await api.get(`/attendance?month=${month}-01`);
      setAttendances(response.data);
    } catch (error) {
      console.error('Erreur chargement pointages:', error);
    }
  };

  const getDaysInMonth = (dateStr) => {
    const [year, monthStr] = dateStr.split('-');
    return new Date(year, monthStr, 0).getDate();
  };

  const getStatusColor = (stat) => {
    switch (stat) {
      case 'T': return '#4CAF50'; // Vert - Travail
      case 'R': return '#2196F3'; // Bleu - Repos
      case 'ABS': return '#f44336'; // Rouge - Absence
      default: return '#e0e0e0'; // Gris - Non pointé
    }
  };

  const getStatusLabel = (stat) => {
    switch (stat) {
      case 'T': return 'Travail';
      case 'R': return 'Repos';
      case 'ABS': return 'Absence';
      default: return '-';
    }
  };

  const handleDayClick = (day) => {
    setSelectedDate(day);
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const date = new Date(month);
      date.setDate(selectedDate);

      await api.post('/attendance', {
        date: date.toISOString(),
        status: newStatus,
        userId: localStorage.getItem('userId')
      });

      setStatus(newStatus);
      loadAttendances();
    } catch (error) {
      console.error('Erreur mise à jour pointage:', error);
    }
  };

  const daysInMonth = getDaysInMonth(month);
  const days = [];

  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${month}-${String(i).padStart(2, '0')}`;
    const att = attendances.find(a => a.date.split('T')[0] === dateStr);
    days.push({
      day: i,
      status: att?.status || null,
      date: dateStr
    });
  }

  return (
    <div className="attendance-calendar">
      <h2>📅 Calendrier des Pointages</h2>

      <div className="calendar-grid">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
          <div key={day} className="calendar-header">{day}</div>
        ))}

        {days.map((dayObj, idx) => (
          <div
            key={idx}
            className="calendar-day"
            style={{ backgroundColor: getStatusColor(dayObj.status) }}
            onClick={() => handleDayClick(dayObj.day)}
          >
            <span className="day-number">{dayObj.day}</span>
            <span className="day-status">{getStatusLabel(dayObj.status)}</span>
          </div>
        ))}
      </div>

      {selectedDate && (
        <div className="day-details">
          <h3>Pointage du {selectedDate} {month}</h3>
          <div className="status-buttons">
            <button
              className="btn btn-work"
              onClick={() => handleStatusChange('T')}
            >
              ✓ Travail
            </button>
            <button
              className="btn btn-off"
              onClick={() => handleStatusChange('R')}
            >
              ☀️ Congé
            </button>
            <button
              className="btn btn-absence"
              onClick={() => handleStatusChange('ABS')}
            >
              ✗ Absence
            </button>
            <button
              className="btn btn-clear"
              onClick={() => handleStatusChange(null)}
            >
              - Annuler
            </button>
          </div>
        </div>
      )}

      <div className="legend">
        <h3>Légende:</h3>
        <div className="legend-items">
          <div className="legend-item" style={{ backgroundColor: '#4CAF50' }}>Travail</div>
          <div className="legend-item" style={{ backgroundColor: '#2196F3' }}>Congé</div>
          <div className="legend-item" style={{ backgroundColor: '#f44336' }}>Absence</div>
          <div className="legend-item" style={{ backgroundColor: '#e0e0e0' }}>Non pointé</div>
        </div>
      </div>
    </div>
  );
}
