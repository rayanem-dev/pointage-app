/** Paramètres modifiables dans l'onglet Setup. Valeurs par défaut neutres : l'application est une coquille vide, commercialisable. */
var Params = (function () {
  var DEFS = [
    { key: 'prestataire_nom', label: 'Prestataire (société qui utilise l\'application)', group: 'Prestataire', type: 'text', def: '' },
    { key: 'prestataire_adresse', label: 'Adresse', group: 'Prestataire', type: 'area', def: '' },
    { key: 'prestataire_activite', label: 'Activité', group: 'Prestataire', type: 'text', def: '' },
    { key: 'prestataire_capital', label: 'Capital social', group: 'Prestataire', type: 'text', def: '' },
    { key: 'prestataire_rc', label: 'RC N°', group: 'Prestataire', type: 'text', def: '' },
    { key: 'prestataire_nis', label: 'NIS N°', group: 'Prestataire', type: 'text', def: '' },
    { key: 'prestataire_nif', label: 'NIF N°', group: 'Prestataire', type: 'text', def: '' },
    { key: 'prestataire_ai', label: 'A.I N°', group: 'Prestataire', type: 'text', def: '' },
    { key: 'prestataire_rib', label: 'RIB N°', group: 'Prestataire', type: 'text', def: '' },
    { key: 'prestataire_banque', label: 'Banque', group: 'Prestataire', type: 'text', def: '' },
    { key: 'prestataire_contact', label: 'Tél / Fax / Email', group: 'Prestataire', type: 'text', def: '' },
    { key: 'prestataire_ville', label: 'Ville (« Fait à »)', group: 'Prestataire', type: 'text', def: '' },
    { key: 'logo_prestataire_id', label: 'Logo du prestataire (ID de fichier Google Drive)', group: 'Prestataire', type: 'text', def: '' },
    { key: 'jours_travail', label: 'Jours de travail par shift', group: 'Rotation', type: 'number', def: '28' },
    { key: 'jours_repos', label: 'Jours de repos / récupération par shift', group: 'Rotation', type: 'number', def: '28' },
    { key: 'couleur_T', label: 'Couleur T (travail)', group: 'Couleurs', type: 'color', def: '#4EA72E' },
    { key: 'couleur_R', label: 'Couleur R (repos / congé)', group: 'Couleurs', type: 'color', def: '#E97132' },
    { key: 'couleur_ABS', label: 'Couleur ABS (absence)', group: 'Couleurs', type: 'color', def: '#E53935' },
    { key: 'couleur_T_prevu', label: 'Couleur T prévu', group: 'Couleurs', type: 'color', def: '#D6F0CC' },
    { key: 'couleur_R_prevu', label: 'Couleur R prévu', group: 'Couleurs', type: 'color', def: '#FBDCC8' },
    { key: 'direction_nom', label: 'Direction (destinataire des demandes groupées)', group: 'Direction', type: 'text', def: '' },
    { key: 'direction_email', label: 'E-mail de la direction', group: 'Direction', type: 'text', def: '' },
    { key: 'client_entete', label: 'En-tête client (fiche de pointage, une ligne par ligne)', group: 'Documents', type: 'area', def: '' },
    { key: 'client_adresse_facture', label: 'Adresse de facturation (« DOIT »)', group: 'Documents', type: 'area', def: '' },
    { key: 'logo_client_id', label: 'Logo du client (ID de fichier Google Drive)', group: 'Documents', type: 'text', def: '' },
    { key: 'signature_client', label: 'Signature client (fiche de pointage)', group: 'Documents', type: 'text', def: '' },
    { key: 'signature_prestataire', label: 'Signature prestataire (fiche de pointage)', group: 'Documents', type: 'text', def: '' }
  ];
  var DEFAULTS = {};
  DEFS.forEach(function (d) { DEFAULTS[d.key] = d.def; });

  function get() {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) { out[k] = DEFAULTS[k]; });
    Store.readTable('Params').forEach(function (r) { out[r.cle] = r.valeur; });
    return out;
  }
  function set(values) {
    var cur = get();
    Object.keys(values || {}).forEach(function (k) {
      var def = DEFS.filter(function (d) { return d.key === k; })[0];
      if (!def) return;
      var s = String(values[k] == null ? '' : values[k]);
      if (def.type === 'number' && !(Number(s) >= 1 && Number(s) % 1 === 0)) throw httpErr_(def.label + ' : entier ≥ 1 attendu');
      if (def.type === 'color' && !/^#[0-9a-fA-F]{6}$/.test(s)) throw httpErr_(def.label + ' : couleur #RRGGBB attendue');
      cur[k] = s;
    });
    Store.writeTable('Params', Object.keys(cur).map(function (k) { return { cle: k, valeur: cur[k] }; }));
    return cur;
  }
  function pub(p) {
    return {
      prestataire: p.prestataire_nom,
      jours_travail: Number(p.jours_travail), jours_repos: Number(p.jours_repos),
      colors: { T: p.couleur_T, R: p.couleur_R, ABS: p.couleur_ABS, T_prevu: p.couleur_T_prevu, R_prevu: p.couleur_R_prevu }
    };
  }
  function defsForClient() { return DEFS.map(function (d) { return { key: d.key, label: d.label, group: d.group, type: d.type }; }); }
  return { DEFS: DEFS, DEFAULTS: DEFAULTS, get: get, set: set, pub: pub, defsForClient: defsForClient };
})();
