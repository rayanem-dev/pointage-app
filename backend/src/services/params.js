const store = require('../store');

// Définition des paramètres modifiables par l'admin (clé, libellé, groupe, type).
const DEFS = [
  { key: 'jours_travail', label: 'Jours de travail par shift', group: 'Rotation', type: 'number', def: '28' },
  { key: 'jours_repos', label: 'Jours de repos / récupération par shift', group: 'Rotation', type: 'number', def: '28' },
  { key: 'couleur_T', label: 'Couleur T (travail)', group: 'Couleurs', type: 'color', def: '#4EA72E' },
  { key: 'couleur_R', label: 'Couleur R (repos / récupération)', group: 'Couleurs', type: 'color', def: '#E97132' },
  { key: 'couleur_ABS', label: 'Couleur ABS (absence)', group: 'Couleurs', type: 'color', def: '#E53935' },
  { key: 'couleur_T_prevu', label: 'Couleur T prévu', group: 'Couleurs', type: 'color', def: '#D6F0CC' },
  { key: 'couleur_R_prevu', label: 'Couleur R prévu', group: 'Couleurs', type: 'color', def: '#FBDCC8' },
  { key: 'societe_nom', label: 'Société', group: 'Société (facture)', type: 'text', def: 'SARL ACOSCO' },
  { key: 'societe_adresse', label: 'Adresse', group: 'Société (facture)', type: 'text', def: 'ZONE INDUSTRIELLE BP 171\nIN AMENAS W. ILLIZI ALGERIE' },
  { key: 'societe_activite', label: 'Activité', group: 'Société (facture)', type: 'text', def: 'TRAVAUX PUBLICS - PRESTATIONS DE SERVICE - VENTES' },
  { key: 'societe_capital', label: 'Capital social', group: 'Société (facture)', type: 'text', def: '1 600 000 000,00 DA' },
  { key: 'societe_rc', label: 'RC N°', group: 'Société (facture)', type: 'text', def: '' },
  { key: 'societe_nis', label: 'NIS N°', group: 'Société (facture)', type: 'text', def: '' },
  { key: 'societe_nif', label: 'NIF N°', group: 'Société (facture)', type: 'text', def: '' },
  { key: 'societe_ai', label: 'A.I N°', group: 'Société (facture)', type: 'text', def: '' },
  { key: 'societe_rib', label: 'RIB N°', group: 'Société (facture)', type: 'text', def: '' },
  { key: 'societe_banque', label: 'Banque', group: 'Société (facture)', type: 'text', def: 'B.E.A AGENCE IN AMENAS' },
  { key: 'societe_contact', label: 'Tél / Fax / Email', group: 'Société (facture)', type: 'text', def: '' },
  { key: 'societe_ville', label: 'Ville (Fait à)', group: 'Société (facture)', type: 'text', def: 'In Amenas' },
  { key: 'client_entete', label: "En-tête client (fiche de pointage)", group: 'Documents', type: 'text', def: 'DIVISION PRODUCTION\nDIRECTION REGIONALE\nRHOURDE NOUSS\nDIVISION INFRASTRUCTURE\nSERVICE CONSTRUCTION' },
  { key: 'client_adresse_facture', label: 'Adresse de facturation (DOIT)', group: 'Documents', type: 'text', def: 'Sonatrach - Division Production - Direction\nRégionale de Rhourde Nouss - Division\nFinances.\nAdresse: BP 27 Hassi Messaoud - Ouargla' },
  { key: 'pointage_signature_client', label: 'Signature client (fiche)', group: 'Documents', type: 'text', def: 'P/SONATRACH-DP-RNS' },
  { key: 'pointage_signature_prestataire', label: 'Signature prestataire (fiche)', group: 'Documents', type: 'text', def: 'le prestataire SARL ACOSCO' },
];
const DEFAULTS = Object.fromEntries(DEFS.map((d) => [d.key, d.def]));

async function getParams() {
  const rows = await store.readTable('Params');
  return { ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.cle, r.valeur])) };
}

async function setParams(values) {
  return store.withLock(async () => {
    const cur = await getParams();
    for (const [k, v] of Object.entries(values || {})) {
      const def = DEFS.find((d) => d.key === k);
      if (!def) continue;
      const s = String(v ?? '');
      if (def.type === 'number' && !(Number(s) >= 1 && Number.isInteger(Number(s)))) throw Object.assign(new Error(`${def.label} : entier ≥ 1 attendu`), { status: 400 });
      if (def.type === 'color' && !/^#[0-9a-fA-F]{6}$/.test(s)) throw Object.assign(new Error(`${def.label} : couleur #RRGGBB attendue`), { status: 400 });
      cur[k] = s;
    }
    await store.writeTable('Params', Object.entries(cur).map(([cle, valeur]) => ({ cle, valeur })));
    return cur;
  });
}

const publicParams = (p) => ({
  jours_travail: Number(p.jours_travail),
  jours_repos: Number(p.jours_repos),
  colors: { T: p.couleur_T, R: p.couleur_R, ABS: p.couleur_ABS, T_prevu: p.couleur_T_prevu, R_prevu: p.couleur_R_prevu },
});

module.exports = { DEFS, getParams, setParams, publicParams };
