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
    { key: 'logo_prestataire_id', label: 'Logo du prestataire', group: 'Prestataire', type: 'logo', def: '' },
    { key: 'jours_travail', label: 'Jours de travail par shift', group: 'Rotation', type: 'number', def: '28' },
    { key: 'jours_repos', label: 'Jours de repos / récupération par shift', group: 'Rotation', type: 'number', def: '28' },
    { key: 'feries_perso', label: 'Jours fériés : ajouts et corrections (une ligne par jour : « 2027-03-10 Aïd el-Fitr » ajoute, « - 2027-03-10 » retire). Les fêtes nationales sont fixes ; les fêtes religieuses sont estimées (écart possible d\'un jour selon la lune).', group: 'Rotation', type: 'area', def: '' },
    { key: 'contrat_strict', label: 'Limiter les effectifs aux postes prévus au contrat (postes × (travail + repos) ÷ travail)', group: 'Rotation', type: 'bool', def: '1' },
    { key: 'attachement_pointage', label: 'Quantité du mois de l\'attachement = jours T réellement pointés (sinon : base du contrat, nombre × jours du mois)', group: 'Attachement', type: 'bool', def: '1' },
    { key: 'couleur_T', label: 'Couleur T (travail)', group: 'Couleurs', type: 'color', def: '#4EA72E' },
    { key: 'couleur_R', label: 'Couleur R (repos / congé)', group: 'Couleurs', type: 'color', def: '#E97132' },
    { key: 'couleur_ABS', label: 'Couleur ABS (absence)', group: 'Couleurs', type: 'color', def: '#E53935' },
    { key: 'couleur_T_prevu', label: 'Couleur T prévu', group: 'Couleurs', type: 'color', def: '#D6F0CC' },
    { key: 'couleur_R_prevu', label: 'Couleur R prévu', group: 'Couleurs', type: 'color', def: '#FBDCC8' },
    { key: 'direction_nom', label: 'Direction du prestataire (destinataire des demandes groupées)', group: 'Direction du prestataire', type: 'text', def: '' },
    { key: 'direction_email', label: 'E-mails de la direction du prestataire (3 au maximum, séparés par une virgule)', group: 'Direction du prestataire', type: 'text', def: '' },
    { key: 'client_nom', label: 'Client (société cliente du contrat)', group: 'Client', type: 'text', def: '' },
    { key: 'client_entete', label: 'En-tête client (fiche de pointage, une ligne par ligne)', group: 'Client', type: 'area', def: '' },
    { key: 'client_adresse_facture', label: 'Adresse de facturation (« DOIT »)', group: 'Client', type: 'area', def: '' },
    { key: 'logo_client_id', label: 'Logo du client', group: 'Client', type: 'logo', def: '' },
    { key: 'signature_client', label: 'Signature client (fiche de pointage)', group: 'Client', type: 'text', def: '' },
    { key: 'signature_prestataire', label: 'Signature prestataire (fiche de pointage)', group: 'Prestataire', type: 'text', def: '' }
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
      if (k === 'direction_email') s = Format.emails(s, 'E-mails de la direction', 3).join(', ');
      if (def.type === 'bool') { s = (values[k] === true || s === '1' || s === 'true') ? '1' : '0'; }
      if (def.type === 'color' && !/^#[0-9a-fA-F]{6}$/.test(s)) throw httpErr_(def.label + ' : couleur #RRGGBB attendue');
      cur[k] = s;
    });
    Store.writeTable('Params', Object.keys(cur).map(function (k) { return { cle: k, valeur: cur[k] }; }));
    return cur;
  }
  // ----- Logos du prestataire et du client : image déposée (png, jpg ou gif), rangée dans Drive à côté du classeur, reprise sur les documents -----
  var LOGO_MAX = 1500000;
  function logoKey(qui) { if (qui !== 'prestataire' && qui !== 'client') throw httpErr_('Logo inconnu'); return 'logo_' + qui + '_id'; }
  function logoFolder() {
    var props = PropertiesService.getScriptProperties(); var pk = Store.propKey('LOGO_ROOT_ID'); var id = props.getProperty(pk);
    if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* dossier supprimé : on le recrée */ } }
    var parent = null;
    try { var pp = DriveApp.getFileById(Store.ss().getId()).getParents(); if (pp.hasNext()) parent = pp.next(); } catch (e) { /* classeur à la racine */ }
    var nom = 'Logos' + Store.folderSuffix(); var it = parent ? parent.getFoldersByName(nom) : null;
    var f = it && it.hasNext() ? it.next() : (parent ? parent.createFolder(nom) : DriveApp.createFolder(nom));
    props.setProperty(pk, f.getId());
    return f;
  }
  function trashOld(id) { if (!id) return; try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* déjà supprimé */ } }
  function logoUpload(o) {
    var key = logoKey(o.qui);
    if (!o.base64) throw httpErr_('Fichier manquant');
    if (!/^image\/(png|jpeg|gif)$/.test(String(o.mime || ''))) throw httpErr_('Format non pris en charge (PNG, JPG ou GIF)');
    var bytes = Utilities.base64Decode(o.base64);
    if (bytes.length > LOGO_MAX) throw httpErr_('Logo trop volumineux (1,5 Mo maximum)');
    var sig = bytes.slice(0, 4).map(function (b) { return (b + 256) % 256; }); var hex = sig.map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    var okSig = o.mime === 'image/png' ? hex === '89504e47' : o.mime === 'image/gif' ? hex.indexOf('47494638') === 0 : hex.slice(0, 4) === 'ffd8';
    if (!okSig) throw httpErr_('Le fichier n\'est pas une image valide');
    var ext = o.mime === 'image/png' ? 'png' : o.mime === 'image/gif' ? 'gif' : 'jpg';
    var file = logoFolder().createFile(Utilities.newBlob(bytes, o.mime, 'logo_' + o.qui + '.' + ext));
    var old = get()[key]; set(JSON.parse('{"' + key + '":"' + file.getId() + '"}')); trashOld(old);
    return { id: file.getId(), apercu: 'data:' + o.mime + ';base64,' + Utilities.base64Encode(bytes) };
  }
  function logoRemove(qui) { var key = logoKey(qui); var old = get()[key]; var v = {}; v[key] = ''; set(v); trashOld(old); return true; }
  function logoView(qui) {
    var id = get()[logoKey(qui)]; if (!id) return { apercu: '' };
    try { var b = DriveApp.getFileById(id).getBlob(); return { apercu: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) }; } catch (e) { return { apercu: '' }; }
  }
  function pub(p) {
    return {
      prestataire: p.prestataire_nom,
      jours_travail: Number(p.jours_travail), jours_repos: Number(p.jours_repos),
      colors: { T: p.couleur_T, R: p.couleur_R, ABS: p.couleur_ABS, T_prevu: p.couleur_T_prevu, R_prevu: p.couleur_R_prevu }
    };
  }
  // Onglet du Setup où s'affiche chaque groupe de champs.
  var TABS = { 'Prestataire': 'prestataire', 'Direction du prestataire': 'prestataire', 'Client': 'client', 'Rotation': 'rotation', 'Couleurs': 'rotation', 'Attachement': 'contrat' };
  function defsForClient() { return DEFS.map(function (d) { return { key: d.key, label: d.label, group: d.group, type: d.type, tab: TABS[d.group] || 'prestataire' }; }); }
  return { DEFS: DEFS, DEFAULTS: DEFAULTS, get: get, set: set, pub: pub, defsForClient: defsForClient, logoUpload: logoUpload, logoRemove: logoRemove, logoView: logoView };
})();
