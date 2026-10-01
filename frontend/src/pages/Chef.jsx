import React, { useState } from 'react';
import { api } from '../api.js';
import Grid from '../components/Grid.jsx';
import { Msg, thisMonth, useAction, useLoad } from '../components/ui.jsx';
import { useApp } from '../App.jsx';

const today = () => new Date().toISOString().slice(0, 10);

// Formulaire de pointage : liste déroulante d'agents, date (ou période), T / R / ABS.
export function Pointer() {
  const { user } = useApp();
  const agents = useLoad(() => api('/agents'), []);
  const [f, setF] = useState({ agent_id: '', date: today(), date_fin: '', statut: 'T' });
  const [month, setMonth] = useState(thisMonth());
  const [tick, setTick] = useState(0);
  const act = useAction();
  const agentId = f.agent_id || (agents.data && agents.data[0] && agents.data[0].id) || '';

  const submit = async (e) => {
    e.preventDefault();
    const r = await act.run(() => api('/pointage', { method: 'POST', body: { agent_id: agentId, date: f.date, date_fin: f.date_fin || undefined, statut: f.statut } }));
    if (r) { act.setMsg({ ok: true, text: `${r.jours} jour${r.jours > 1 ? 's' : ''} pointé${r.jours > 1 ? 's' : ''}` }); setMonth(f.date.slice(0, 7)); setTick((t) => t + 1); }
  };
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <form className="card" onSubmit={submit}>
        <h2>Pointer un agent</h2>
        <div className="row">
          <label className="grow2">Agent<select value={agentId} onChange={upd('agent_id')}>{(agents.data || []).map((a) => <option key={a.id} value={a.id}>{a.nom}{a.fonction ? ` — ${a.fonction}` : ''}</option>)}</select></label>
          <label>Date<input type="date" value={f.date} onChange={upd('date')} required /></label>
          <label>Jusqu'au <small>(facultatif)</small><input type="date" value={f.date_fin} min={f.date} onChange={upd('date_fin')} /></label>
        </div>
        <div className="seg" role="radiogroup" aria-label="Statut">
          {[['T', 'T — Travail'], ['R', 'R — Repos / récup.'], ['ABS', 'ABS — Absence'], ['', 'Effacer']].map(([v, l]) => (
            <label key={v || 'x'} className={`segopt ${v ? `st-${v}` : ''}${f.statut === v ? ' on' : ''}`}><input type="radio" name="statut" checked={f.statut === v} onChange={() => setF({ ...f, statut: v })} />{l}</label>
          ))}
        </div>
        <Msg msg={act.msg} />
        <button className="primary" disabled={act.busy || !agentId}>Valider le pointage</button>
        {user.role === 'chef' && <small className="muted"> Vous pointez les agents de votre groupe.</small>}
      </form>
      <Grid month={month} onMonth={setMonth} canEdit refreshKey={tick} />
    </>
  );
}

export function Groupe() {
  const { user } = useApp();
  const [month, setMonth] = useState(thisMonth());
  const [contrat, setContrat] = useState('');
  const contrats = useLoad(() => (user.role === 'admin' ? api('/admin/contrats') : Promise.resolve({ contrats: [] })), []);
  return (
    <>
      {user.role === 'admin' && contrats.data && contrats.data.contrats.length > 1 && (
        <label className="inline">Contrat : <select value={contrat} onChange={(e) => setContrat(e.target.value)}><option value="">Tous</option>{contrats.data.contrats.map((c) => <option key={c.numero}>{c.numero}</option>)}</select></label>
      )}
      <Grid month={month} onMonth={setMonth} canEdit exportable contrat={contrat} />
    </>
  );
}
