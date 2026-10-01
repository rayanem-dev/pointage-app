import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { Chip, Msg, useAction, useLoad } from '../components/ui.jsx';

export default function Parametres() {
  return (<><General /><Contrats /></>);
}

function General() {
  const { reloadParams } = useApp();
  const { data, error } = useLoad(() => api('/admin/params'), []);
  const [v, setV] = useState(null);
  const act = useAction();
  useEffect(() => { if (data) setV(data.values); }, [data]);
  if (error) return <p className="msg err">{error}</p>;
  if (!v) return <p className="muted">Chargement…</p>;
  const groups = [...new Set(data.defs.map((d) => d.group))];
  const save = async (e) => { e.preventDefault(); if (await act.run(() => api('/admin/params', { method: 'PUT', body: v }), 'Paramètres enregistrés')) reloadParams(); };
  return (
    <form className="card" onSubmit={save}>
      <h2>Paramètres généraux</h2>
      {groups.map((g) => (
        <fieldset key={g}><legend>{g}</legend>
          <div className="row wrap">
            {data.defs.filter((d) => d.group === g).map((d) => (
              <label key={d.key} className={d.type === 'text' ? 'grow2' : ''}>{d.label}
                {d.type === 'text' && d.lines > 1 ? <textarea rows={d.lines} value={v[d.key]} onChange={(e) => setV({ ...v, [d.key]: e.target.value })} />
                  : <input type={d.type === 'number' ? 'number' : d.type === 'color' ? 'color' : 'text'} min={1} value={v[d.key]} onChange={(e) => setV({ ...v, [d.key]: e.target.value })} />}
              </label>
            ))}
          </div>
          {g === 'Couleurs' && <p className="preview">Aperçu : <Chip s="T" /> <Chip s="R" /> <Chip s="ABS" /> <Chip s="T" prevu /> <Chip s="R" prevu /> <small className="muted">(T/R « prévus » = jours restants du shift en cours)</small></p>}
          {g === 'Rotation' && <p className="muted">Exemple : après un retour pointé T le 01, les jours suivants sont prévus T jusqu'au jour {v.jours_travail}, puis R pendant {v.jours_repos} jours, et ainsi de suite.</p>}
        </fieldset>
      ))}
      <Msg msg={act.msg} /><button className="primary" disabled={act.busy}>Enregistrer</button>
    </form>
  );
}

const NEW_C = { numero: '', client: '', objet: '', date_contrat: '', ref_mois: '', ref_attachement: '', rep_prestataire: '', rep_client: '' };
const NEW_F = (contrat) => ({ contrat, designation: '', libelle: '', positions: 1, delai: 540, prix_unitaire: 0, qte_precedente_ref: 0 });

function Contrats() {
  const { data, error } = useLoad(() => api('/admin/contrats'), []);
  const [c, setC] = useState(null);
  const [f, setF] = useState([]);
  const act = useAction();
  useEffect(() => { if (data) { setC(data.contrats); setF(data.fonctions); } }, [data]);
  if (error) return <p className="msg err">{error}</p>;
  if (!c) return null;
  const setCi = (i, k, val) => setC(c.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
  const setFi = (i, k, val) => setF(f.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
  const save = async (e) => { e.preventDefault(); await act.run(() => api('/admin/contrats', { method: 'PUT', body: { contrats: c, fonctions: f } }), 'Contrats enregistrés'); };
  return (
    <form className="card" onSubmit={save}>
      <h2>Contrats de prestation, fonctions et prix</h2>
      <p className="muted">Le numéro d'attachement et les quantités précédentes partent d'un mois de référence : indiquez le mois et le n° de l'attachement connus, et le cumul déjà facturé par fonction.</p>
      {c.map((x, i) => (
        <fieldset key={i}><legend>Contrat {x.numero || 'nouveau'}</legend>
          <div className="row wrap">
            <label>N° de contrat<input value={x.numero} onChange={(e) => setCi(i, 'numero', e.target.value)} required /></label>
            <label className="grow2">Client<input value={x.client} onChange={(e) => setCi(i, 'client', e.target.value)} /></label>
            <label>Date du contrat<input value={x.date_contrat} onChange={(e) => setCi(i, 'date_contrat', e.target.value)} placeholder="30/03/2025" /></label>
          </div>
          <label>Objet<textarea rows={2} value={x.objet} onChange={(e) => setCi(i, 'objet', e.target.value)} /></label>
          <div className="row wrap">
            <label>Mois de référence<input type="month" value={x.ref_mois} onChange={(e) => setCi(i, 'ref_mois', e.target.value)} /></label>
            <label>N° attachement de ce mois<input type="number" min={1} value={x.ref_attachement} onChange={(e) => setCi(i, 'ref_attachement', e.target.value)} /></label>
            <label>Représentant prestataire<input value={x.rep_prestataire} onChange={(e) => setCi(i, 'rep_prestataire', e.target.value)} /></label>
            <label>Représentant client<input value={x.rep_client} onChange={(e) => setCi(i, 'rep_client', e.target.value)} /></label>
          </div>
          <div className="gridwrap"><table className="table">
            <thead><tr><th>Désignation (attachement / facture)</th><th>Libellé sur la fiche</th><th>Positions (a)</th><th>Délai (b)</th><th>Prix unitaire HT</th><th>Qté cumulée avant le mois de réf.</th><th /></tr></thead>
            <tbody>{f.map((x2, j) => x2.contrat === x.numero && (
              <tr key={j}>
                <td><input value={x2.designation} onChange={(e) => setFi(j, 'designation', e.target.value)} required /></td>
                <td><input value={x2.libelle} onChange={(e) => setFi(j, 'libelle', e.target.value)} /></td>
                {['positions', 'delai', 'prix_unitaire', 'qte_precedente_ref'].map((k) => <td key={k}><input type="number" min={0} step="any" value={x2[k]} onChange={(e) => setFi(j, k, e.target.value)} /></td>)}
                <td><button type="button" className="danger" onClick={() => setF(f.filter((_, n) => n !== j))}>×</button></td>
              </tr>))}</tbody>
          </table></div>
          <button type="button" onClick={() => setF([...f, NEW_F(x.numero)])}>+ Fonction</button>
          <button type="button" className="danger" onClick={() => { if (window.confirm('Supprimer ce contrat et ses fonctions ?')) { setF(f.filter((y) => y.contrat !== x.numero)); setC(c.filter((_, n) => n !== i)); } }}>Supprimer le contrat</button>
        </fieldset>
      ))}
      <button type="button" onClick={() => setC([...c, NEW_C])}>+ Contrat</button>
      <Msg msg={act.msg} /><button className="primary" disabled={act.busy}>Enregistrer</button>
    </form>
  );
}
