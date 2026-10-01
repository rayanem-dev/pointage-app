import React, { useState } from 'react';
import { api } from '../api.js';
import { Msg, useAction } from '../components/ui.jsx';

export default function Password() {
  const [f, setF] = useState({ current: '', next: '' });
  const { msg, busy, run } = useAction();
  const submit = async (e) => { e.preventDefault(); const r = await run(() => api('/auth/password', { method: 'POST', body: f }), 'Mot de passe modifié'); if (r) setF({ current: '', next: '' }); };
  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>Changer mon mot de passe</h2>
      <label>Mot de passe actuel<input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></label>
      <label>Nouveau mot de passe (6 caractères min.)<input type="password" minLength={6} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required /></label>
      <Msg msg={msg} /><button className="primary" disabled={busy}>Enregistrer</button>
    </form>
  );
}
