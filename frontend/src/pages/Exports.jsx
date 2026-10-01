import React, { useState } from 'react';
import { api, download, qs } from '../api.js';
import { MonthNav, Msg, frDate, thisMonth, useAction, useLoad } from '../components/ui.jsx';

const money = (n) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Exports() {
  const cfg = useLoad(() => api('/admin/contrats'), []);
  const [month, setMonth] = useState(thisMonth());
  const [contrat, setContrat] = useState('');
  const [prevu, setPrevu] = useState(false);
  const [fac, setFac] = useState({ facture_numero: '', date: '' });
  const act = useAction();
  const contrats = (cfg.data && cfg.data.contrats) || [];
  const cur = contrat || (contrats[0] && contrats[0].numero) || '';
  const prev = useLoad(() => (cur ? api(`/exports/preview/attachement?${qs({ month, contrat: cur })}`) : Promise.resolve(null)), [month, cur]);
  const get = (doc, format, extra = {}) => act.run(() => download(`/exports/${doc}?${qs({ month, format, contrat: cur, ...extra })}`));
  const [edit, setEdit] = useState({});
  const saveQty = async (l) => {
    const v = edit[l.designation];
    await act.run(() => api('/admin/attachement-qte', { method: 'PUT', body: { contrat: cur, mois: month, designation: l.designation, qte_mois: v } }), 'Quantité enregistrée');
    setEdit({}); prev.reload();
  };
  const Buttons = ({ doc, extra }) => <span><button onClick={() => get(doc, 'xlsx', extra)}>Excel (.xlsx)</button> <button onClick={() => get(doc, 'pdf', extra)}>PDF</button></span>;

  return (
    <>
      <section className="card">
        <div className="toolbar"><MonthNav month={month} onChange={setMonth} />
          {contrats.length > 0 && <label className="inline">Contrat <select value={cur} onChange={(e) => setContrat(e.target.value)}>{contrats.map((c) => <option key={c.numero}>{c.numero}</option>)}</select></label>}
        </div>
        {!contrats.length && !cfg.error && <p className="msg err">Aucun contrat : créez-en un dans Paramètres.</p>}
        <Msg msg={act.msg} />
      </section>
      <section className="card">
        <h2>1. Fiche de pointage <small>(à valider avec le client)</small></h2>
        <label className="inline"><input type="checkbox" checked={prevu} onChange={(e) => setPrevu(e.target.checked)} /> Inclure les jours prévus</label>
        <p><Buttons doc="fiche" extra={{ prevu: prevu ? '1' : '' }} /></p>
      </section>
      <section className="card">
        <h2>2. Attachement{prev.data ? ` N° ${prev.data.numero}` : ''}</h2>
        {prev.error && <p className="msg err">{prev.error}</p>}
        {prev.data && (
          <>
            <p className="muted">Période du {frDate(prev.data.debut)} au {frDate(prev.data.fin)}. Quantité du mois = positions × jours du mois, modifiable ligne par ligne. « Pointés » = jours T réellement pointés (information).</p>
            <div className="gridwrap"><table className="table">
              <thead><tr><th>Désignation</th><th>Positions</th><th>Qté contrat</th><th>Précédente</th><th>Du mois</th><th>Cumulée</th><th>Pointés</th></tr></thead>
              <tbody>{prev.data.lines.map((l) => (
                <tr key={l.designation}><td>{l.designation}</td><td>{l.positions}</td><td>{l.contrat}</td><td>{l.precedente}</td>
                  <td><input className="qty" type="number" min={0} value={edit[l.designation] ?? l.mois} onChange={(e) => setEdit({ ...edit, [l.designation]: e.target.value })} />
                    {edit[l.designation] !== undefined && <button onClick={() => saveQty(l)}>OK</button>}{!l.auto && <small> modifié</small>}</td>
                  <td>{l.cumulee}</td><td>{l.pointes}</td></tr>))}</tbody>
            </table></div>
          </>
        )}
        <p><Buttons doc="attachement" /></p>
      </section>
      <section className="card">
        <h2>3. Facture</h2>
        {prev.data && <p className="muted">Total HT : <b>{money(prev.data.totalHT)} DA</b> (d'après l'attachement ci-dessus et les prix unitaires).</p>}
        <div className="row">
          <label>N° de facture<input value={fac.facture_numero} onChange={(e) => setFac({ ...fac, facture_numero: e.target.value })} placeholder="235/PS/2026" /></label>
          <label>Date de la facture<input type="date" value={fac.date} onChange={(e) => setFac({ ...fac, date: e.target.value })} /></label>
        </div>
        <p><Buttons doc="facture" extra={fac} /></p>
      </section>
    </>
  );
}
