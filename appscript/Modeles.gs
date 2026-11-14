/**
 * Documents RH préremplis : certificat de travail, attestation de travail, titre de congé.
 *  1) donnees : champs proposés d'après la fiche de l'agent, sa fiche RH, le contrat, la demande (dates du congé) et l'onglet Prestataire ;
 *  2) generer : met en page (HTML → PDF) avec les champs relus par l'utilisateur, puis range le PDF dans l'espace de l'agent (comme un dépôt).
 * Droit : l'administrateur, ou le responsable d'équipe à qui l'administrateur l'a accordé (case « documents RH » de sa fiche), pour les agents qu'il voit.
 * Les données de la fiche RH ne servent qu'à remplir le document : elles ne sont renvoyées qu'à ces personnes, pour cet agent.
 */
var Modeles = (function () {
  var TYPES = { certificat_travail: 'Certificat de Travail', attestation_travail: 'Attestation de Travail', titre_conge: 'Titre de congé' };
  var CHAMPS = {
    certificat_travail: ['numero', 'qualite', 'civilite', 'nom', 'prenom', 'date_naissance', 'lieu_naissance', 'nss', 'fonction', 'date_debut', 'date_fin', 'ville', 'date_doc', 'signataire'],
    attestation_travail: ['numero', 'civilite', 'nom', 'prenom', 'date_naissance', 'lieu_naissance', 'nss', 'fonction', 'date_debut', 'ville', 'date_doc', 'signataire'],
    titre_conge: ['numero', 'nom', 'prenom', 'fonction', 'destination', 'nature', 'jours', 'date_debut', 'date_fin', 'reprise', 'transport', 'ville', 'date_doc', 'signataire', 'derniere_reprise', 'jours_presence', 'droit', 'relicat', 'expiration']
  };
  var DATES = ['date_naissance', 'date_debut', 'date_fin', 'reprise', 'date_doc', 'derniere_reprise', 'expiration'];
  function peut(user) { return !!user && (user.role === 'admin' || (user.role === 'chef' && user.acces_rh === '1')); }
  function exiger(user) { if (!peut(user)) throw httpErr_('Réservé à l\'administrateur et aux responsables autorisés', 'FORBIDDEN'); }
  function agentDe(user, id) {
    var a = Agents.visibleTo(user).filter(function (x) { return x.id === id; })[0] || (user.role === 'admin' ? Agents.get(id) : null);
    if (!a) throw httpErr_("Cet agent n'est pas dans votre groupe", 'FORBIDDEN');
    if (a.type === 'vehicule') throw httpErr_("Un véhicule n'a pas de documents RH");
    return a;
  }
  function texte(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160); }
  function societe() {
    var p = Params.get(); var logo = '';
    try { logo = Params.logoView('prestataire').apercu || ''; } catch (e) { logo = ''; }
    return { nom: p.prestataire_nom || '', adresse: String(p.prestataire_adresse || '').replace(/\s*\n\s*/g, ' ').trim(), ville: p.prestataire_ville || '', employeur: p.prestataire_employeur || '', logo: logo };
  }
  // « ADNANE Abdelmoumen » : le premier mot est le NOM, la suite le prénom (convention de Sijil pour nommer les fichiers).
  function nomPrenom(nom) { var t = String(nom || '').trim().split(/\s+/); return { nom: (t.shift() || '').toUpperCase(), prenom: t.join(' ') }; }

  function donnees(user, o) {
    exiger(user); o = o || {};
    var type = TYPES[o.type] ? o.type : ''; if (!type) throw httpErr_('Type de document invalide');
    var a = agentDe(user, o.agent_id); var soc = societe(); var np = nomPrenom(a.nom);
    var f = Store.readTable('FichesRH').filter(function (x) { return x.agent_id === a.id; })[0] || {};
    var c = { numero: '', civilite: 'Monsieur', nom: np.nom, prenom: np.prenom, fonction: (a.fonction || '').toUpperCase(), ville: soc.ville, date_doc: Dates.today(), signataire: 'LA DIRECTION',
      date_naissance: f.date_naissance || '', lieu_naissance: (f.lieu_naissance || '').toUpperCase(), nss: f.nss || '', date_debut: Dates.isDate(a.date_entree) ? a.date_entree : '', date_fin: '', qualite: 'Gérant' };
    var manque = [];
    if (type !== 'titre_conge') { if (!c.date_naissance) manque.push('date de naissance'); if (!c.lieu_naissance) manque.push('lieu de naissance'); if (!c.nss) manque.push('n° de sécurité sociale'); if (!c.date_debut) manque.push("date d'entrée"); }
    if (type === 'titre_conge') {
      var d = o.demande_id ? Store.readTable('Demandes').filter(function (x) { return x.id === o.demande_id && x.agent_id === a.id; })[0] : null;
      var repos = Number(Agents.rotationParams(a, Params.get()).jours_repos) || 0;
      c.date_debut = d && Dates.isDate(d.date_debut) ? d.date_debut : ''; c.date_fin = d && Dates.isDate(d.date_fin) ? d.date_fin : '';
      if (c.date_debut && !c.date_fin && repos) c.date_fin = Dates.addDays(c.date_debut, repos - 1);
      c.reprise = c.date_fin ? Dates.addDays(c.date_fin, 1) : ''; c.jours = c.date_debut && c.date_fin ? String(Dates.diffDays(c.date_debut, c.date_fin) + 1) : (repos ? String(repos) : '');
      c.destination = ''; c.nature = 'Congé de récupération'; c.transport = 'Tous les moyens.';
      c.derniere_reprise = ''; c.jours_presence = ''; c.droit = ''; c.relicat = '';
      var ct = Contrats.contrats().filter(function (x) { return x.numero === a.contrat; })[0];
      c.expiration = ct ? Contrats.dateFin(ct.date_debut, ct.duree_mois) : '';
    }
    var out = {}; CHAMPS[type].forEach(function (k) { out[k] = c[k] == null ? '' : c[k]; });
    return { type: type, titre: TYPES[type], agent: { id: a.id, nom: a.nom }, champs: out, societe: { nom: soc.nom, adresse: soc.adresse, employeur: soc.employeur, logo: !!soc.logo }, manque: manque };
  }

  // ----- mise en page -----
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fr(iso, sep) { return Dates.isDate(iso) ? iso.slice(8, 10) + sep + iso.slice(5, 7) + sep + iso.slice(0, 4) : ''; }
  function ligne(lib, val, extra) { return '<tr><td class="l">' + esc(lib) + ' :</td><td class="v">' + esc(val) + (extra || '') + '</td></tr>'; }
  function entete(soc, numero, annee) {
    return '<div class="bandeau">' + esc(soc.nom) + (soc.adresse ? ' - ' + esc(soc.adresse) : '') + '</div>' +
      '<table class="tete"><tr><td class="logo">' + (soc.logo ? '<img src="' + soc.logo + '" style="max-height:70px;max-width:190px">' : '') + '</td><td class="ste"><b>' + esc(soc.nom) + '</b><br><b>' + esc(soc.adresse) + '</b>' +
      (soc.employeur ? '<br><b>N° D\'EMPLOYEUR : ' + esc(soc.employeur) + '</b>' : '') + '<br><span class="num">N° : ' + (numero ? esc(numero) : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/' + annee) + '</span></td></tr></table>';
  }
  function pied(c, titre) {
    return '<p class="fait">Fait à ' + esc(c.ville) + ' le : ' + fr(c.date_doc, c._sep) + '</p><p class="sign"><b><u>' + esc(c.signataire || 'LA DIRECTION') + '</u></b></p><div class="bas">' + esc(titre) + '</div>';
  }
  var CSS = 'body{font-family:"Times New Roman",Times,serif;font-size:13pt;color:#000;margin:28px 46px}.bandeau{font-size:9pt;border-bottom:1px solid #000;padding-bottom:3px;letter-spacing:1px}.tete{margin:10px auto 0 60px}.tete td{vertical-align:middle;padding:0 14px 0 0}.ste{font-size:12pt;line-height:1.35}.num{font-size:12pt}' +
    'h1{text-align:center;font-size:23pt;text-decoration:underline;margin:38px 0 34px}p{margin:10px 0;line-height:1.6}table.c{margin:6px 0 6px 0;border-collapse:collapse}table.c td{padding:5px 4px;font-size:13pt}td.l{text-align:right;width:300px}td.v{font-weight:bold}' +
    '.fait{margin:46px 0 4px 55%}.sign{margin:0 0 0 62%}.bas{position:fixed;bottom:18px;left:46px;right:46px;border-top:1px solid #000;font-size:9pt;padding:3px 0 0 40px}.cadre{border:1px solid #000;margin-top:26px;padding:6px 12px;font-size:11pt}.cadre td{padding:3px 4px;font-size:11pt}.imp{text-align:center;font-weight:bold;font-size:11pt;margin-top:14px}';
  function page(type, c, soc) {
    var annee = (c.date_doc || Dates.today()).slice(0, 4); var corps;
    if (type === 'titre_conge') {
      c._sep = '/';
      var n = function (v) { return v === '' || v == null || isNaN(Number(v)) ? null : Number(v); };
      var droit = n(c.droit), rel = n(c.relicat), dem = n(c.jours); var total = droit === null && rel === null ? null : (droit || 0) + (rel || 0); var reste = total === null || dem === null ? null : total - dem;
      var detail = [c.derniere_reprise, c.jours_presence, c.droit, c.relicat].some(function (x) { return x !== '' && x != null; });
      var dl = function (lib, v) { return '<tr><td style="text-align:right;width:200px">' + esc(lib) + ' :</td><td><b>' + esc(v == null ? '' : v) + '</b></td></tr>'; };
      corps = '<h1>Titre de congé</h1><table class="c">' + ligne('Nom & Prénom', (c.nom + ' ' + c.prenom).trim()) + ligne('Fonction', c.fonction) + ligne('Destination', c.destination) + ligne('Nature congé', c.nature) + ligne('Nombre de jours congé', c.jours) +
        ligne('Date de départ congé', fr(c.date_debut, '/'), '<span style="font-weight:normal;margin-left:110px">Au : </span>' + fr(c.date_fin, '/')) + ligne('Date de reprise', fr(c.reprise, '/')) + ligne('Moyen de transport', c.transport) + '</table>' + pied(c, 'Titre de congé') +
        '<div style="width:52%;margin-top:-34px;font-size:11pt">Observation<div style="border:1px solid #000;height:118px"></div></div><p class="imp">Important : Ce titre doit être remis à l\'administration après retour du congé.</p>' +
        (detail || c.expiration ? '<div class="cadre"><p style="text-align:center;margin:2px 0 6px"><b>Détail calcul du droit de congé</b></p><table style="width:100%"><tr><td style="vertical-align:top;width:50%"><table>' + (c.derniere_reprise ? dl('Dernière reprise', fr(c.derniere_reprise, '/')) : '') + (c.expiration ? dl('Expiration Contrat', fr(c.expiration, '/')) : '') + '</table></td><td style="vertical-align:top"><table>' +
          (detail ? dl('Jours présence', c.jours_presence) + dl('Droit au congé', c.droit) + dl('Relicat', c.relicat) + dl('Total droit', total) + dl('Congé demandé', c.jours) + dl('Reste', reste) : '') + '</table></td></tr></table></div>' : '');
    } else {
      c._sep = '-'; var cert = type === 'certificat_travail';
      corps = '<h1>' + (cert ? 'Certificat de Travail' : 'Attestation de Travail') + '</h1>' +
        '<p>Nous soussignés' + (cert ? ' ' + esc(c.qualite || 'Gérant') + ' de la' : '') + ' ' + esc(soc.nom) + (soc.adresse ? ' Sise à ' + esc(soc.adresse) : '') + (cert ? ', certifie par la présente que :' : ' atteste par la présente que :') + '</p><p>' + esc(c.civilite || 'Monsieur') + ' :</p>' +
        '<table class="c">' + ligne('Nom', c.nom) + ligne('Prénom', c.prenom) + ligne('Date de naissance', fr(c.date_naissance, '-')) + ligne('Lieu de naissance', c.lieu_naissance) + ligne('N° de Sécurité Sociale', c.nss) + '</table>' +
        '<p>' + (cert ? 'A été employé' + (c.civilite === 'Madame' ? 'e' : '') + ' au sein de notre société' : 'Est employé' + (c.civilite === 'Madame' ? 'e' : '') + ' au sein de notre société :') + '</p>' +
        '<table class="c">' + ligne('En qualité de', c.fonction) + ligne('Est ce depuis', fr(c.date_debut, '-'), cert ? '<span style="font-weight:normal;margin-left:80px">Au : </span>' + fr(c.date_fin, '-') : '<span style="font-weight:normal;margin-left:80px">à ce jour.</span>') + '</table>' +
        '<p>' + (cert ? 'Le présent certificat lui est délivré' : 'La présente attestation lui est délivrée') + ' pour servir et faire valoir ce que de droit.</p>' + pied(c, cert ? 'Certificat de travail' : 'Attestation de travail');
    }
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + CSS + '</style></head><body>' + entete(soc, c.numero, annee) + corps + '</body></html>';
  }
  // Champs relus par l'utilisateur : seuls ceux du type sont gardés, les dates sont vérifiées.
  function nettoyer(type, champs) {
    var c = {}; champs = champs || {};
    CHAMPS[type].forEach(function (k) { var v = texte(champs[k]); c[k] = DATES.indexOf(k) >= 0 ? (Dates.isDate(v) ? v : '') : v; });
    if (c.civilite !== undefined && c.civilite !== 'Madame') c.civilite = 'Monsieur';
    return c;
  }
  function verifier(type, c) {
    var m = [];
    if (!c.nom) m.push('nom'); if (!c.date_doc) m.push('date du document'); if (!c.ville) m.push('ville');
    if (type !== 'titre_conge') { if (!c.fonction) m.push('fonction'); if (!c.date_debut) m.push("date d'entrée"); if (type === 'certificat_travail' && !c.date_fin) m.push('date de fin'); if (c.date_fin && c.date_fin < c.date_debut) throw httpErr_('La date de fin précède la date de début'); }
    else { if (!c.date_debut) m.push('date de départ'); if (!c.date_fin) m.push('date de fin du congé'); if (c.date_fin && c.date_fin < c.date_debut) throw httpErr_('La date de fin précède la date de départ'); if (!c.reprise && c.date_fin) c.reprise = Dates.addDays(c.date_fin, 1); if (!c.jours && c.date_debut && c.date_fin) c.jours = String(Dates.diffDays(c.date_debut, c.date_fin) + 1); }
    if (m.length) throw httpErr_('À compléter : ' + m.join(', '));
  }
  function nomFichier(type, c) {
    var dt = type === 'titre_conge' ? c.date_debut : c.date_doc;
    return { certificat_travail: 'certificat de travail ', attestation_travail: 'attestation de travail ', titre_conge: 'titre de conge ' }[type] + dt + '.pdf';
  }
  function html(user, o) { exiger(user); o = o || {}; if (!TYPES[o.type]) throw httpErr_('Type de document invalide'); agentDe(user, o.agent_id); var c = nettoyer(o.type, o.champs); verifier(o.type, c); return { html: page(o.type, c, societe()) }; }
  function generer(user, o) {
    exiger(user); o = o || {};
    var type = TYPES[o.type] ? o.type : ''; if (!type) throw httpErr_('Type de document invalide');
    var a = agentDe(user, o.agent_id); var c = nettoyer(type, o.champs); verifier(type, c);
    var pdf = Utilities.newBlob(page(type, c, societe()), 'text/html', 'document.html').getAs('application/pdf');
    var doc = Documents.upload(user, { agent_id: a.id, type: type, nom: nomFichier(type, c), mime: 'application/pdf', base64: Utilities.base64Encode(pdf.getBytes()) });
    return { document: doc, agent: a.nom };
  }
  return { donnees: donnees, generer: generer, html: html, peut: peut, TYPES: TYPES, page: page };
})();
