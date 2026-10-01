import React, { useState } from 'react';
import { api, download, qs } from '../api.js';
import { MonthNav, WEEK, useLoad, Msg, useAction } from './ui.jsx';

const signed = (n) => (n > 0 ? `+${n}` : String(n));

// Grille mensuelle de pointage (une ligne par agent) avec couleurs, prévisions et totaux.
export default function Grid({ month, onMonth, canEdit, exportable, contrat = '', refreshKey = 0 }) {
  const [prevu, setPrevu] = useState(true);
  const [menu, setMenu] = useState(null); // { agent, day, x, y }
  const { data, error, reload } = useLoad(() => api(`/pointage/grid?${qs({ month, contrat })}`), [month, contrat, refreshKey]);
  const act = useAction();

  const set = async (agent, day, statut) => {
    setMenu(null);
    const date = `${month}-${String(day).padStart(2, '0')}`;
    await act.run(() => api('/pointage', { method: 'POST', body: { agent_id: agent.id, date, statut } }));
    reload();
  };
  const exp = (format) => act.run(() => download(`/exports/fiche?${qs({ month, format, contrat, prevu: prevu ? '1' : '' })}`));

  return (
    <section className="card">
      <div className="toolbar">
        <MonthNav month={month} onChange={onMonth} />
        <label className="inline"><input type="checkbox" checked={prevu} onChange={(e) => setPrevu(e.target.checked)} /> Afficher les jours prévus</label>
        {exportable && <span className="grow right"><button onClick={() => exp('xlsx')}>Excel</button> <button onClick={() => exp('pdf')}>PDF</button></span>}
      </div>
      <Msg msg={act.msg} />
      {error && <p className="msg err">{error}</p>}
      {!data ? <p className="muted">Chargement…</p> : (
        <div className="gridwrap" onClick={() => setMenu(null)}>
          <table className="grid">
            <thead>
              <tr>
                <th className="sticky">Nom et prénom</th>
                {Array.from({ length: data.nd }, (_, i) => {
                  const wd = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, i + 1)).getUTCDay();
                  return <th key={i} className={wd === 5 ? 'fri' : ''}>{i + 1}<small>{WEEK[wd]}</small></th>;
                })}
                <th>T</th><th>CR</th><th>ABS</th><th title="Cumul T − CR depuis le début">Reliquat</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="sticky name"><b>{r.nom}</b><small>{r.fonction}</small></td>
                  {r.days.map((d, i) => {
                    const s = d.statut || (prevu ? d.prevu : '');
                    return (
                      <td key={i} className={`day ${s ? `st-${s}` : ''}${!d.statut && s ? ' prevu' : ''}`}
                        onClick={canEdit ? (e) => { e.stopPropagation(); setMenu({ agent: r, day: i + 1, x: e.clientX, y: e.clientY }); } : undefined}>{s}</td>
                    );
                  })}
                  <td className="num">{r.mois.T}</td><td className="num">{r.mois.R}</td><td className="num">{r.mois.ABS}</td>
                  <td className={`num ${r.cumul.reliquat < 0 ? 'neg' : 'pos'}`}>{signed(r.cumul.reliquat)}</td>
                </tr>
              ))}
              {!data.rows.length && <tr><td className="muted" colSpan={data.nd + 5}>Aucun agent.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="legend"><span className="chip st-T">T</span> travail <span className="chip st-R">R</span> repos / récupération <span className="chip st-ABS">ABS</span> absence <span className="chip st-T prevu">T</span> <span className="chip st-R prevu">R</span> prévus{canEdit && ' · cliquez sur une case pour la modifier'}</p>
      {menu && (
        <div className="popmenu" style={{ left: Math.min(menu.x, window.innerWidth - 190), top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <small>{menu.agent.nom} — {menu.day}/{month.slice(5)}</small>
          <div>{['T', 'R', 'ABS'].map((s) => <button key={s} className={`chip st-${s}`} onClick={() => set(menu.agent, menu.day, s)}>{s}</button>)}<button onClick={() => set(menu.agent, menu.day, '')}>✕</button></div>
        </div>
      )}
    </section>
  );
}
