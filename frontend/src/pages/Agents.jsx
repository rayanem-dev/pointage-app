import React, { useState } from 'react';
import { api } from '../api.js';
import { Msg, useAction, useLoad } from '../components/ui.jsx';

const EMPTY = { nom: '', email: '', role: 'agent', fonction: '', affectation: '', contrat: '', chef_id: '', password: '', actif: '1' };
const ROLES = { agent: 'Agent', chef: 'Chef de groupe', admin: 'Administrateur' };

export default function Agents() {
  const list = useLoad(() => api('/admin/agents'), []);
  const cfg = useLoad(() => api('/admin/contrats'), []);
  const [f, setF] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [created, setCreated] = useState(null);
  const act = useAction();
  const agents = list.data || [];
  const chefs = agents.filter((a) => a.role === 'chef' && a.actif === '1');
  const contrats = (cfg.data && cfg.data.contrats) || [];
  const fonctions = [...new Set(((cfg.data && cfg.data.fonctions) || []).map((x) => x.libelle || x.designation))];
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setCreated(null);
    const r = await act.run(() => (editing ? api(`/admin/agents/${editing}`, { method: 'PUT', body: f }) : api('/admin/agents', { method: 'POST', body: f })), editing ? 'Agent modifié' : '');
    if (!r) return;
    if (!editing) setCreated({ email: r.agent.email, password: r.password });
    setF(EMPTY); setEditing(null); list.reload();
  };
  const edit = (a) => { setEditing(a.id); setCreated(null); setF({ ...EMPTY, ...a, password: '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const toggle = (a) => act.run(() => api(`/admin/agents/${a.id}`, { method: 'PUT', body: { actif: a.actif !== '1' } })).then(() => list.reload());
  const reset = async (a) => {
    const pw = window.prompt(`Nouveau mot de passe pour ${a.nom} (6 caractères min.)`);
    if (pw) await act.run(() => api(`/admin/agents/${a.id}/password`, { method: 'POST', body: { password: pw } }), 'Mot de passe modifié');
  };

  return (
    <>
      <form className="card" onSubmit={submit}>
        <h2>{editing ? 'Modifier l\'agent' : 'Nouvel agent'}</h2>
        <div className="row">
          <label className="grow2">Nom et prénom<input value={f.nom} onChange={upd('nom')} required /></label>
          <label className="grow2">Email (identifiant)<input type="email" value={f.email} onChange={upd('email')} required /></label>
          <label>Rôle<select value={f.role} onChange={upd('role')}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        {f.role !== 'admin' && (
          <div className="row">
            <label>Métier / fonction<input list="fonctions" value={f.fonction} onChange={upd('fonction')} /><datalist id="fonctions">{fonctions.map((x) => <option key={x} value={x} />)}</datalist></label>
            <label>Affectation<input value={f.affectation} onChange={upd('affectation')} placeholder="ex. Rhourde Nouss" /></label>
            <label>N° contrat de prestation<select value={f.contrat} onChange={upd('contrat')}><option value="">—</option>{contrats.map((c) => <option key={c.numero} value={c.numero}>{c.numero} — {c.client}</option>)}</select></label>
            <label>Chef de groupe<select value={f.chef_id} onChange={upd('chef_id')}><option value="">—</option>{chefs.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></label>
          </div>
        )}
        {!editing && <label>Mot de passe initial <small>(généré si vide)</small><input value={f.password} onChange={upd('password')} minLength={6} /></label>}
        <Msg msg={act.msg} />
        {created && <p className="msg ok">Compte créé : <b>{created.email}</b> — mot de passe : <b>{created.password}</b> (à communiquer à l'agent)</p>}
        <button className="primary" disabled={act.busy}>{editing ? 'Enregistrer' : 'Créer l\'agent'}</button>
        {editing && <button type="button" onClick={() => { setEditing(null); setF(EMPTY); }}>Annuler</button>}
      </form>
      <section className="card">
        <h2>Personnel ({agents.filter((a) => a.actif === '1').length} actifs)</h2>
        {list.error && <p className="msg err">{list.error}</p>}
        <div className="gridwrap"><table className="table">
          <thead><tr><th>Nom</th><th>Rôle</th><th>Fonction</th><th>Affectation</th><th>Contrat</th><th>Chef</th><th /></tr></thead>
          <tbody>{agents.map((a) => (
            <tr key={a.id} className={a.actif !== '1' ? 'off' : ''}>
              <td><b>{a.nom}</b><small>{a.email}</small></td><td>{ROLES[a.role]}</td><td>{a.fonction}</td><td>{a.affectation}</td><td>{a.contrat}</td>
              <td>{(agents.find((c) => c.id === a.chef_id) || {}).nom || ''}</td>
              <td className="actions"><button onClick={() => edit(a)}>Modifier</button><button onClick={() => reset(a)}>Mot de passe</button><button onClick={() => toggle(a)}>{a.actif === '1' ? 'Désactiver' : 'Réactiver'}</button></td>
            </tr>))}</tbody>
        </table></div>
      </section>
    </>
  );
}
