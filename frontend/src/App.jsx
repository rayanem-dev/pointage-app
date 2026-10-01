import React, { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api, hasToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import { Demandes, Documents } from './pages/Espace.jsx';
import { Pointer, Groupe } from './pages/Chef.jsx';
import Agents from './pages/Agents.jsx';
import Parametres from './pages/Parametres.jsx';
import Exports from './pages/Exports.jsx';
import Password from './pages/Password.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const NAV = {
  agent: [['/', 'Accueil'], ['/demandes', 'Mes demandes'], ['/documents', 'Mes documents']],
  chef: [['/', 'Mon espace'], ['/pointer', 'Pointer'], ['/groupe', 'Mon groupe'], ['/demandes', 'Demandes'], ['/documents', 'Documents']],
  admin: [['/pointer', 'Pointer'], ['/groupe', 'Pointage global'], ['/agents', 'Agents'], ['/demandes', 'Demandes'], ['/documents', 'Documents'], ['/exports', 'Exports'], ['/parametres', 'Paramètres']],
};

export default function App() {
  const [user, setUser] = useState(null);
  const [params, setParams] = useState(null);
  const [ready, setReady] = useState(!hasToken());
  const nav = useNavigate();

  const loadParams = () => api('/me/params').then((p) => {
    setParams(p);
    Object.entries(p.colors).forEach(([k, v]) => document.documentElement.style.setProperty(`--c-${k}`, v));
  });
  useEffect(() => {
    if (!hasToken()) return;
    api('/auth/me').then(async (r) => { setUser(r.user); await loadParams(); }).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  const login = async (r) => { setToken(r.token); setUser(r.user); await loadParams(); nav('/'); };
  const logout = () => { setToken(null); setUser(null); nav('/login'); };

  if (!ready) return <p className="center muted">Chargement…</p>;
  if (!user) return <Routes><Route path="*" element={<Login onLogin={login} />} /></Routes>;

  const links = NAV[user.role];
  const home = user.role === 'admin' ? '/pointer' : '/';
  return (
    <Ctx.Provider value={{ user, params, reloadParams: loadParams }}>
      <header className="top">
        <strong className="brand">Pointage ACOSCO</strong>
        <nav>{links.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav>
        <span className="who">{user.nom} <small>({user.role === 'chef' ? 'chef de groupe' : user.role})</small>
          <NavLink to="/motdepasse">Mot de passe</NavLink><button className="link" onClick={logout}>Déconnexion</button></span>
      </header>
      <main>
        <Routes>
          <Route path="/" element={user.role === 'admin' ? <Navigate to={home} replace /> : <Home />} />
          <Route path="/demandes" element={<Demandes />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/motdepasse" element={<Password />} />
          {user.role !== 'agent' && <Route path="/pointer" element={<Pointer />} />}
          {user.role !== 'agent' && <Route path="/groupe" element={<Groupe />} />}
          {user.role === 'admin' && <Route path="/agents" element={<Agents />} />}
          {user.role === 'admin' && <Route path="/exports" element={<Exports />} />}
          {user.role === 'admin' && <Route path="/parametres" element={<Parametres />} />}
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </main>
    </Ctx.Provider>
  );
}
