import React, { useEffect, useState } from 'react';

export const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export const thisMonth = () => new Date().toISOString().slice(0, 7);
export const shiftMonth = (k, n) => { const [y, m] = k.split('-').map(Number); const t = y * 12 + m - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
export const monthLabel = (k) => `${MOIS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
export const frDate = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
export const frDateTime = (s) => (s ? new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
export const WEEK = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export function MonthNav({ month, onChange }) {
  return (
    <div className="monthnav">
      <button onClick={() => onChange(shiftMonth(month, -1))} aria-label="Mois précédent">‹</button>
      <input type="month" value={month} onChange={(e) => e.target.value && onChange(e.target.value)} />
      <button onClick={() => onChange(shiftMonth(month, 1))} aria-label="Mois suivant">›</button>
    </div>
  );
}

export function Msg({ msg }) {
  if (!msg) return null;
  return <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</p>;
}

// Petit hook : exécute une action async et expose un message de résultat.
export function useAction() {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn, okText) => {
    setBusy(true); setMsg(null);
    try { const r = await fn(); if (okText) setMsg({ ok: true, text: okText }); return r; } catch (e) { setMsg({ ok: false, text: e.message }); return undefined; } finally { setBusy(false); }
  };
  return { msg, busy, run, setMsg };
}

export function useLoad(fn, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [n, setN] = useState(0);
  useEffect(() => { let off = false; setError(''); fn().then((d) => !off && setData(d)).catch((e) => !off && setError(e.message)); return () => { off = true; }; }, [...deps, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, reload: () => setN((x) => x + 1), setData };
}

export const Chip = ({ s, prevu }) => <span className={`chip st-${s}${prevu ? ' prevu' : ''}`}>{s}</span>;
