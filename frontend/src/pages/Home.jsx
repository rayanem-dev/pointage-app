import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Chip, MonthNav, frDate, thisMonth, useLoad } from '../components/ui.jsx';

const signed = (n) => (n > 0 ? `+${n}` : String(n));

// Accueil de l'agent : statistiques de travail, cycle en cours, calendrier du mois.
export default function Home() {
  const [month, setMonth] = useState(thisMonth());
  const { data: o, error } = useLoad(() => api(`/me/overview?month=${month}`), [month]);
  if (error) return <p className="msg err">{error}</p>;
  if (!o) return <p className="muted">Chargement…</p>;
  const c = o.cycle;
  const pct = c && c.total ? Math.min(100, Math.round((c.run / c.total) * 100)) : 0;
  const offset = (new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, 1)).getUTCDay() + 6) % 7; // semaine commençant lundi
  const names = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  return (
    <>
      <section className="card hello">
        <h2>Bonjour {o.agent.nom}</h2>
        <p className="muted">{[o.agent.fonction, o.agent.affectation, o.agent.contrat && `Contrat ${o.agent.contrat}`, o.chef && `Chef de groupe : ${o.chef.nom}`].filter(Boolean).join(' · ')}</p>
      </section>
      <div className="stats">
        <Stat label="T ce mois" value={o.mois.T} cls="st-T" /><Stat label="CR ce mois" value={o.mois.R} cls="st-R" /><Stat label="ABS ce mois" value={o.mois.ABS} cls="st-ABS" />
        <Stat label="Total T" value={o.cumul.T} /><Stat label="Total CR" value={o.cumul.R} />
        <Stat label="Reliquat (T − CR)" value={signed(o.cumul.reliquat)} cls={o.cumul.reliquat < 0 ? 'neg' : 'pos'} />
      </div>
      <section className="card">
        <h3>Cycle en cours</h3>
        {c && c.run ? (
          <>
            <p><Chip s={c.status} /> jour <b>{c.run}</b> sur {c.total} {c.remaining > 0 ? <>— encore <b>{c.remaining}</b> jour{c.remaining > 1 ? 's' : ''}</> : <>— cycle terminé</>}</p>
            <div className="bar"><div className={`st-${c.status}`} style={{ width: `${pct}%` }} /></div>
            <p className="muted">Prochain changement : <b>{frDate(c.next)}</b> → <Chip s={c.nextStatus} prevu /> (rotation {o.rotation.travail} T / {o.rotation.repos} R)</p>
          </>
        ) : <p className="muted">Aucun pointage enregistré pour le moment.</p>}
      </section>
      <section className="card">
        <div className="toolbar"><h3>{o.label}</h3><MonthNav month={month} onChange={setMonth} /></div>
        <div className="cal">
          {names.map((n, i) => <b key={i} className="calh">{n}</b>)}
          {Array.from({ length: offset }, (_, i) => <span key={`o${i}`} />)}
          {o.grid.days.map((d, i) => {
            const s = d.statut || d.prevu;
            return <span key={i} className={`calday ${s ? `st-${s}` : ''}${!d.statut && s ? ' prevu' : ''}`}><small>{i + 1}</small>{s}</span>;
          })}
        </div>
        <p className="legend"><Chip s="T" /> travail <Chip s="R" /> repos <Chip s="ABS" /> absence <Chip s="T" prevu /> <Chip s="R" prevu /> prévus</p>
      </section>
      <div className="stats">
        <Link className="card tile" to="/demandes"><b>{o.demandes.en_attente}</b> demande(s) en attente<small>{o.demandes.total} au total · faire une demande</small></Link>
        <Link className="card tile" to="/documents"><b>{o.documents}</b> document(s)<small>Fiches de paie, attestations…</small></Link>
      </div>
    </>
  );
}

const Stat = ({ label, value, cls = '' }) => <div className={`card stat ${cls}`}><b>{value}</b><small>{label}</small></div>;
