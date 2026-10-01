import React, { useState } from 'react';
import { api, download } from '../api.js';
import { useApp } from '../App.jsx';
import { Msg, frDateTime, useAction, useLoad } from '../components/ui.jsx';

const TYPES = { conge: 'Congé', absence: 'Absence', attestation: 'Attestation', fiche_paie: 'Fiche de paie', autre: 'Autre' };
const STATUTS = { en_attente: 'En attente', acceptee: 'Acceptée', refusee: 'Refusée', traitee: 'Traitée' };
const DOC_TYPES = { fiche_paie: 'Fiche de paie', attestation_travail: 'Attestation de travail', autre: 'Autre' };

// Demandes / requêtes : l'agent les envoie à son chef de groupe ou à l'admin, qui les traitent.
export function Demandes() {
  const { user } = useApp();
  const { data, error, reload } = useLoad(() => api('/demandes'), []);
  const [f, setF] = useState({ type: 'conge', objet: '', message: '', destinataire: user.chef_id ? 'chef' : 'admin' });
  const act = useAction();
  const send = async (e) => {
    e.preventDefault();
    const r = await act.run(() => api('/demandes', { method: 'POST', body: f }), 'Demande envoyée');
    if (r) { setF({ ...f, objet: '', message: '' }); reload(); }
  };
  const mine = (data || []).filter((d) => d.agent_id === user.id);
  const toHandle = (data || []).filter((d) => d.agent_id !== user.id);
  return (
    <>
      {user.role !== 'admin' && (
        <form className="card" onSubmit={send}>
          <h2>Nouvelle demande</h2>
          <div className="row">
            <label>Type<select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Destinataire<select value={f.destinataire} onChange={(e) => setF({ ...f, destinataire: e.target.value })}>{user.chef_id && <option value="chef">Mon chef de groupe</option>}<option value="admin">Administration</option></select></label>
          </div>
          <label>Objet<input value={f.objet} onChange={(e) => setF({ ...f, objet: e.target.value })} required maxLength={120} /></label>
          <label>Message<textarea rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></label>
          <Msg msg={act.msg} /><button className="primary" disabled={act.busy}>Envoyer</button>
        </form>
      )}
      {error && <p className="msg err">{error}</p>}
      {user.role !== 'agent' && (
        <section className="card"><h2>Demandes à traiter</h2>
          {toHandle.length ? toHandle.map((d) => <Demande key={d.id} d={d} canHandle onDone={reload} />) : <p className="muted">Aucune demande.</p>}
        </section>
      )}
      {user.role !== 'admin' && (
        <section className="card"><h2>Mes demandes</h2>
          {mine.length ? mine.map((d) => <Demande key={d.id} d={d} />) : <p className="muted">Vous n'avez fait aucune demande.</p>}
        </section>
      )}
    </>
  );
}

function Demande({ d, canHandle, onDone }) {
  const [rep, setRep] = useState(d.reponse || '');
  const act = useAction();
  const handle = async (statut) => { if (await act.run(() => api(`/demandes/${d.id}`, { method: 'PUT', body: { statut, reponse: rep } }))) onDone(); };
  return (
    <article className="item">
      <header><b>{d.objet}</b> <span className={`badge ${d.statut}`}>{STATUTS[d.statut]}</span></header>
      <small className="muted">{TYPES[d.type]} · {canHandle && <>{d.agent_nom} · </>}{frDateTime(d.date_creation)} · pour {d.destinataire === 'chef' ? 'le chef de groupe' : "l'administration"}</small>
      {d.message && <p>{d.message}</p>}
      {d.reponse && !canHandle && <p className="reply">Réponse ({d.traite_par}) : {d.reponse}</p>}
      {canHandle && (
        <div className="handle">
          <input placeholder="Réponse (facultative)" value={rep} onChange={(e) => setRep(e.target.value)} />
          <button onClick={() => handle('acceptee')} disabled={act.busy}>Accepter</button>
          <button onClick={() => handle('refusee')} disabled={act.busy}>Refuser</button>
          <button onClick={() => handle('traitee')} disabled={act.busy}>Traitée</button>
          <Msg msg={act.msg} />
        </div>
      )}
    </article>
  );
}

// Documents : l'agent consulte les siens ; le chef / l'admin en déposent pour les agents.
export function Documents() {
  const { user } = useApp();
  const staff = user.role !== 'agent';
  const agents = useLoad(() => (staff ? api('/agents') : Promise.resolve([])), []);
  const [agentId, setAgentId] = useState('');
  const target = staff ? agentId || (agents.data && agents.data[0] && agents.data[0].id) || '' : user.id;
  const docs = useLoad(() => (target ? api(`/documents?agent_id=${target}`) : Promise.resolve([])), [target]);
  const [f, setF] = useState({ type: 'fiche_paie', titre: '' });
  const [file, setFile] = useState(null);
  const act = useAction();

  const upload = async (e) => {
    e.preventDefault();
    const form = new FormData();
    form.append('agent_id', target); form.append('type', f.type); form.append('titre', f.titre); form.append('fichier', file);
    const r = await act.run(() => api('/documents', { method: 'POST', form }), 'Document déposé');
    if (r) { setFile(null); setF({ ...f, titre: '' }); e.target.reset(); docs.reload(); }
  };
  const del = async (d) => { if (window.confirm(`Supprimer « ${d.titre} » ?`) && (await act.run(() => api(`/documents/${d.id}`, { method: 'DELETE' })))) docs.reload(); };

  return (
    <>
      {staff && (
        <form className="card" onSubmit={upload}>
          <h2>Déposer un document</h2>
          <div className="row">
            <label>Agent<select value={target} onChange={(e) => setAgentId(e.target.value)}>{(agents.data || []).map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select></label>
            <label>Type<select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <label>Titre<input value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} placeholder="ex. Fiche de paie août 2026" /></label>
          <label>Fichier (10 Mo max)<input type="file" onChange={(e) => setFile(e.target.files[0])} required /></label>
          <Msg msg={act.msg} /><button className="primary" disabled={act.busy || !target}>Déposer</button>
        </form>
      )}
      <section className="card">
        <h2>{staff ? 'Documents de l\'agent' : 'Mes documents'}</h2>
        {docs.error && <p className="msg err">{docs.error}</p>}
        {docs.data && docs.data.length ? (
          <ul className="docs">{docs.data.map((d) => (
            <li key={d.id}><div><b>{d.titre}</b><small>{DOC_TYPES[d.type]} · déposé par {d.depose_par} le {frDateTime(d.date)}</small></div>
              <span><button onClick={() => act.run(() => download(`/documents/${d.id}/file`, d.nom_original))}>Télécharger</button>{staff && <button className="danger" onClick={() => del(d)}>Supprimer</button>}</span></li>
          ))}</ul>
        ) : <p className="muted">Aucun document.</p>}
      </section>
    </>
  );
}
