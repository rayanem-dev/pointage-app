import React, { useState } from 'react';
import { api } from '../api.js';
import { Msg, useAction } from '../components/ui.jsx';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { msg, busy, run } = useAction();
  const submit = async (e) => { e.preventDefault(); const r = await run(() => api('/auth/login', { method: 'POST', body: { email, password } })); if (r) onLogin(r); };
  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <h1>Pointage ACOSCO</h1>
        <p className="muted">Connectez-vous à votre espace</p>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus /></label>
        <label>Mot de passe<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        <Msg msg={msg} />
        <button className="primary" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
      </form>
    </div>
  );
}
