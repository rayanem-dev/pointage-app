/**
 * Entreprise de démonstration « DEMO » : une société fictive que les visiteurs essaient avant de demander un essai (identifiant demo, mot de passe demo).
 * Quatre comptes, un par profil : demo (administrateur), demo-chef (responsable d'équipe), demo-agent (agent), demo-client (client en consultation).
 * Tout est fictif et remis à zéro chaque nuit (tâche planifiée) ou à la demande de l'éditeur (menu Clients → « Démonstration »).
 * Sécurité : aucun e-mail réel n'est envoyé depuis la démonstration, le mot de passe des comptes ne se change pas, le vidage et la restauration sont désactivés,
 * les fichiers déposés sont limités en taille et en nombre, et plus rien ne subsiste après la remise à zéro.
 */
var Demo = (function () {
  var CODE = 'DEMO';
  var DOMAIN = '@demo.sijil';
  var PASSWORD = 'demo';
  var SOCIETE = 'SARL HORIZON SERVICES (démo)';
  var CONTRAT = 'I/24/DEMO-SRV/2025';
  var PROFILS = {
    'demo': { role: 'admin', label: 'Administrateur' },
    'demo-chef': { role: 'chef', label: "Responsable d'équipe" },
    'demo-agent': { role: 'agent', label: 'Agent' },
    'demo-client': { role: 'client', label: 'Client' }
  };
  var BLOQUE = ['passwordOwn', 'agentPassword', 'vider', 'backupRestore', 'backupCreate'];
  var MAX_BYTES = 2 * 1024 * 1024; // 2 Mo par fichier déposé
  var MAX_DEPOTS = 60;             // dépôts par heure, tous visiteurs confondus

  function props() { return PropertiesService.getScriptProperties(); }
  function isDemo() { return Store.tenantCode() === CODE; }
  function emailOf(id) { return id + DOMAIN; }
  function registered() { var c = Tenants.find(CODE); return c && c.classeur_id && c.statut !== 'suspendu' ? c : null; }
  function available() { try { return !!registered(); } catch (e) { return false; } }
  function blocked(name) { return BLOQUE.indexOf(name) >= 0; }

  // « demo » (ou demo-chef…) sans code entreprise : ouvre la démonstration.
  function resolveLogin(identifier, code) {
    var id = String(identifier || '').trim().toLowerCase();
    if (!PROFILS[id]) return null;
    var c = String(code || '').trim().toUpperCase();
    if (c && c !== CODE) return null;
    if (!available()) return null;
    return { email: emailOf(id), code: CODE };
  }
  function profilOf(user) {
    var e = String(user && user.email || '').toLowerCase(); var found = '';
    Object.keys(PROFILS).forEach(function (k) { if (emailOf(k) === e) found = k; });
    return found;
  }
  function info(user) {
    if (!isDemo()) return null;
    return { profil: profilOf(user), profils: Object.keys(PROFILS).map(function (k) { return { id: k, label: PROFILS[k].label, role: PROFILS[k].role }; }) };
  }
  // Bascule d'un profil à l'autre sans ressaisir de mot de passe (démonstration seulement).
  function switchTo(profil) {
    if (!isDemo()) throw httpErr_('Réservé à la démonstration', 'FORBIDDEN');
    if (!PROFILS[profil]) throw httpErr_('Profil inconnu');
    var agent = Store.readTable('Agents').filter(function (a) { return a.email.toLowerCase() === emailOf(profil) && a.actif === '1'; })[0];
    if (!agent) throw httpErr_('Compte de démonstration introuvable : demandez la remise à zéro à l\'éditeur');
    return Auth.openSession(CODE, agent);
  }
  // Limites des dépôts de fichiers dans la démonstration.
  function checkUpload(bytes) {
    if (!isDemo()) return;
    if (bytes > MAX_BYTES) throw httpErr_('Démonstration : 2 Mo maximum par fichier');
    if (!Format.allow('DEMO_UPLOAD', MAX_DEPOTS, 3600)) throw httpErr_('Démonstration : trop de dépôts pour le moment, réessayez plus tard');
  }

  // ---------- fabrication des données fictives ----------
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  // PDF minimal et valide (texte ASCII) : document fictif déposé chez un agent.
  function pdfBase64(titre) {
    var content = 'BT /F1 16 Tf 40 130 Td (' + titre + ') Tj 0 -28 Td /F1 10 Tf (Document fictif - demonstration Sijil) Tj ET';
    var objs = ['', '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    var out = '%PDF-1.4\n'; var off = [];
    for (var i = 1; i <= 5; i += 1) { off[i] = out.length; out += i + ' 0 obj\n' + objs[i] + '\nendobj\n'; }
    var xref = out.length; out += 'xref\n0 6\n0000000000 65535 f \n';
    for (var j = 1; j <= 5; j += 1) out += ('0000000000' + off[j]).slice(-10) + ' 00000 n \n';
    out += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    return Utilities.base64Encode(out);
  }
  // « T8R21T2 » : alternance de jours de travail / repos, répétée à chaque mois à partir du 1er.
  function jours(plan, last) {
    var days = []; var m; var re = /([TR])(\d+)/g;
    while ((m = re.exec(plan))) for (var k = 0; k < Number(m[2]); k += 1) days.push(m[1]);
    while (days.length < 31) days.push('');
    return days.slice(0, 31).map(function (v, i) { return i < last ? v : ''; });
  }
  function setPassword(email, password) {
    var all = Agents.list(); var a = all.filter(function (x) { return x.email.toLowerCase() === email; })[0];
    if (!a) return;
    var cred = Auth.rawCredentials(password); a.password_hash = cred.password_hash; a.salt = cred.salt; Store.writeTable('Agents', all);
  }
  function essai(nom, fn) { try { return fn(); } catch (e) { Logger.log('Démonstration, ' + nom + ' : ' + e.message); return null; } }

  // Remplit l'entreprise courante (le classeur DEMO doit être le classeur actif, avec son administrateur).
  function seed() {
    var today = Dates.today(); var ym = today.slice(0, 7); var m1 = Dates.addMonths(ym, -1); var m2 = Dates.addMonths(ym, -2);
    var debut = Dates.addMonths(ym, -9) + '-01';
    var admin = Agents.list().filter(function (a) { return a.role === 'admin'; })[0];
    var adminEmail = emailOf('demo');
    // l'administrateur de la démonstration
    var all0 = Agents.list(); all0.forEach(function (a) { if (a.id === admin.id) { a.nom = 'Administrateur démo'; a.email = adminEmail; a.acces_setup = '1'; } }); Store.writeTable('Agents', all0);
    admin = Agents.get(admin.id);
    Params.set({ prestataire_nom: SOCIETE, prestataire_adresse: 'Zone d\'activité, Hassi Demo', prestataire_ville: 'Hassi Demo', prestataire_activite: 'Mise à disposition de personnel et de matériel', prestataire_capital: '10 000 000,00 DA',
      direction_email: '', client_nom: 'ENERGIE DU SUD', client_entete: 'DIRECTION RÉGIONALE\nHASSI DEMO', signature_client: 'P/ENERGIE DU SUD', signature_prestataire: 'P/SARL HORIZON SERVICES', jours_travail: '28', jours_repos: '28', contrat_strict: '1', attachement_pointage: '1', facturation: '1', chef_exports: 'tous' });
    Contrats.saveContrats([{ numero: CONTRAT, client: 'ENERGIE DU SUD Division Production Direction Régionale Hassi Demo', objet: 'Mise à disposition de personnel et de matériel pour les opérations de maintenance du site', date_contrat: '15/01/2025',
      ref_mois: m2, ref_attachement: 9, rep_prestataire: '', rep_client: 'DP DEMO', date_debut: debut, duree_mois: '24', client_email: emailOf('demo-client') }]);
    Contrats.saveFonctions([
      { contrat: CONTRAT, designation: 'Technicien Électricien', libelle: 'Technicien électricien', positions: 3, delai: 540, prix_unitaire: 14000, qte_precedente_ref: 600 },
      { contrat: CONTRAT, designation: 'Soudeur qualifié', libelle: 'Soudeur', positions: 3, delai: 540, prix_unitaire: 12500, qte_precedente_ref: 600 },
      { contrat: CONTRAT, designation: 'Chauffeur poids lourd', libelle: 'Chauffeur poids lourd', positions: 2, delai: 540, prix_unitaire: 12500, qte_precedente_ref: 300 },
      { contrat: CONTRAT, designation: 'Magasinier', libelle: 'Magasinier', positions: 2, delai: 540, prix_unitaire: 9500, qte_precedente_ref: 300 },
      { contrat: CONTRAT, designation: 'Camion 2,5 tonnes', libelle: 'Camion 2,5 T', positions: 3, delai: 540, prix_unitaire: 9500, qte_precedente_ref: 0, nature: 'vehicule' },
      { contrat: CONTRAT, designation: 'Rétrochargeur', libelle: 'Rétrochargeur', positions: 2, delai: 540, prix_unitaire: 16000, qte_precedente_ref: 0, nature: 'vehicule' },
      { contrat: CONTRAT, designation: 'Véhicule 4x4', libelle: 'Véhicule 4x4', positions: 3, delai: 540, prix_unitaire: 7500, qte_precedente_ref: 0, nature: 'vehicule' }]);
    Contrats.ensureClientAccounts(admin); // compte de consultation du client (demo-client)

    // responsable d'équipe, agents et matériel (créés par le responsable : il en devient le chef)
    var chef = Agents.create(admin, { nom: 'KARIM BENSALEM', email: emailOf('demo-chef'), role: 'chef', fonction: 'Magasinier', contrat: CONTRAT, affectation: 'Hassi Demo', password: PASSWORD + 'demo' }).agent;
    var chefU = Agents.get(chef.id);
    var gens = [['SAMIR HAMLAOUI', 'Technicien électricien', 'T8R21T2', 'demo-agent'], ['NADIR CHERIF', 'Technicien électricien', 'T22R9'], ['YACINE MEZIANE', 'Soudeur', 'T21R10'], ['AMINE BOUDIAF', 'Technicien électricien', 'T25R6'],
      ['WALID TEBBAL', 'Technicien électricien', 'T12R19'], ['SOFIANE LAKHDARI', 'Soudeur', 'R3T21R7'], ['RACHID BELKACEM', 'Soudeur', 'R18T13'], ['HOCINE AMRANI', 'Soudeur', 'R14T17'],
      ['FARID OUALI', 'Magasinier', 'R8T23'], ['LYES MAHDI', 'Chauffeur poids lourd', 'R18T13'], ['TAREK ZIANI', 'Chauffeur poids lourd', 'T15R16']];
    var materiel = [['2514 118 16 Isuzu', 'Camion 2,5 T', 'T31'], ['2514 227 16 Hyundai', 'Camion 2,5 T', 'T14R3T10R4'], ['0871 342 16 JCB', 'Rétrochargeur', 'T20R11'], ['1203 455 16 Hilux', 'Véhicule 4x4', 'T31'], ['1203 566 16 Cruiser', 'Véhicule 4x4', 'T9R2T20']];
    var ids = {}; var plans = [['KARIM BENSALEM', chef.id, 'R8T23']];
    gens.forEach(function (g, i) {
      var email = g[3] ? emailOf(g[3]) : 'agent' + (i + 1) + DOMAIN;
      var a = Agents.create(chefU, { nom: g[0], email: email, fonction: g[1], contrat: CONTRAT, affectation: 'Hassi Demo', password: PASSWORD + 'demo' }).agent;
      ids[g[0]] = a.id; plans.push([g[0], a.id, g[2]]);
    });
    materiel.forEach(function (g) {
      var v = Agents.create(chefU, { type: 'vehicule', nom: g[0], fonction: g[1], contrat: CONTRAT, affectation: 'Hassi Demo' }).agent;
      plans.push([g[0], v.id, g[2]]);
    });
    // mots de passe publics de la démonstration
    Object.keys(PROFILS).forEach(function (k) { setPassword(emailOf(k), PASSWORD); });

    // pointage réel : les deux mois précédents, puis le mois en cours jusqu'à hier (le reste s'affiche en « prévu »)
    var hier = Number(today.slice(8, 10)) - 1; var lignes = [];
    [[m2, 31], [m1, 31], [ym, hier]].forEach(function (m) {
      if (m[1] > 0) lignes.push({ key: m[0], lignes: plans.map(function (p) { return { id: p[1], jours: jours(p[2], m[1]) }; }) });
    });
    Pointage.importEntries(Pointage.loadAllMonths(), lignes, 'remplacer');

    // un type de demande personnalisé, des documents, des demandes à tous les stades, une remarque du client
    essai('types de demande', function () { Demandes.typesSave(admin, { builtin: {}, custom: [{ label: 'Certificat de travail', doc: 'certificat_travail', propose: true }] }); });
    var cert = ''; essai('type personnalisé', function () { (Demandes.typesConfig().custom || []).forEach(function (c) { if (/certificat/i.test(c.label)) cert = c.cle; }); });
    var docAmine = essai('document', function () {
      var d = Documents.depotAdd(admin, { nom: 'FDP_Boudiaf_Septembre.pdf', mime: 'application/pdf', base64: pdfBase64('FICHE DE PAIE'), agent_id: ids['AMINE BOUDIAF'], type: 'fiche_emolument' });
      Documents.depotUpdate(admin, d.id, { agent_id: ids['AMINE BOUDIAF'], type: 'fiche_emolument', champs: { mois: 'septembre ' + ym.slice(0, 4) } }); Documents.depotValider(admin, [d.id], true);
      var l = Documents.list(admin, ids['AMINE BOUDIAF']); return l && l[0] ? l[0].id : '';
    });
    var dep = Dates.addDays(today, 12);
    var dS = essai('demande', function () { return Demandes.create(Agents.get(ids['SAMIR HAMLAOUI']), { type: 'titre_conge', date_debut: dep, date_fin: Dates.addDays(dep, 27), message: 'Retour famille' }); });
    var dS2 = essai('demande', function () { return Demandes.create(Agents.get(ids['SAMIR HAMLAOUI']), { type: 'attestation_cnas', message: 'Pour mon dossier CNAS' }); });
    var dA = essai('demande', function () { return Demandes.create(Agents.get(ids['AMINE BOUDIAF']), { type: 'fiche_emolument', message: 'Septembre' }); });
    var dN = essai('demande', function () { return Demandes.create(Agents.get(ids['NADIR CHERIF']), { type: 'attestation_travail', message: 'Dossier bancaire' }); });
    var dC = cert ? ['WALID TEBBAL', 'SOFIANE LAKHDARI', 'RACHID BELKACEM'].map(function (n) { return essai('demande', function () { return Demandes.create(chefU, { type: cert, agent_id: ids[n], message: '' }); }); }) : [];
    essai('réponses', function () {
      if (dS2) Demandes.repondre(chefU, dS2.id, 'refusee', 'Dossier incomplet : joindre la photocopie de la carte Chaïfa.');
      var aEnvoyer = [dA, dN].concat(dC.slice(0, 2)).filter(Boolean);
      aEnvoyer.forEach(function (d) { Demandes.repondre(chefU, d.id, 'acceptee', ''); });
      var e1 = Demandes.envoyerDirection(chefU, [dA.id, dN.id], '');
      if (e1 && e1.envoi) Demandes.traiterEnvoi(admin, e1.envoi.id, 'acceptee', 'Documents prêts à retirer.');
      if (dA && docAmine) Demandes.cloturer(admin, dA.id, docAmine);
      var rest = dC.slice(0, 2).filter(Boolean).map(function (d) { return d.id; });
      if (rest.length) Demandes.envoyerDirection(chefU, rest, '');
    });
    essai('remarque du client', function () {
      var client = Agents.list().filter(function (a) { return a.role === 'client'; })[0];
      var jourRem = Dates.addDays(today, -4); if (jourRem.slice(0, 7) !== ym) jourRem = ym + '-01';
      Remarques.add(client, { agent_id: ids['FARID OUALI'], date: jourRem, texte: 'Merci de vérifier ce jour : le magasin était fermé.' });
    });
    return { agents: plans.length, mois: lignes.length };
  }

  // Création (première fois, éditeur) ou remise à zéro de l'entreprise de démonstration. Sans utilisateur : appel de la tâche planifiée (la société existe déjà).
  function reset(user) {
    var keep = { code: Store.tenantCode(), id: Store.tenantId() };
    var c = Tenants.find(CODE);
    if (!c || !c.classeur_id) {
      Tenants.requireOwner(user);
      Tenants.create(user, { code: CODE, nom: SOCIETE, admin_email: emailOf('demo'), admin_password: Utilities.getUuid().replace(/-/g, '').slice(0, 12), statut: 'essai', contact: 'Démonstration' });
    } else if (user) {
      Tenants.requireOwner(user);
    }
    Tenants.use(CODE);
    try {
      Setup.vider('tout', 'VIDER');
      var r = seed();
      props().setProperty('DEMO_LAST', Dates.today());
      try { Auto.ensureTrigger(); } catch (e) { /* tâche planifiée : voir autoPointageAutoriser */ }
      return { ok: true, agents: r.agents, lien: Tenants.lien(CODE), comptes: Object.keys(PROFILS).map(function (k) { return { identifiant: k, role: PROFILS[k].label }; }), motdepasse: PASSWORD };
    } finally { Store.setTenant(keep.code, keep.id); }
  }
  // Appelée par la tâche planifiée : remise à zéro une fois par jour, après 3 h (heure d'Alger).
  function tick() {
    if (!available()) return null;
    if (props().getProperty('DEMO_LAST') === Dates.today()) return null;
    if (Utilities.formatDate(new Date(), 'Africa/Algiers', 'HH:mm') < '03:00') return null;
    return reset(null);
  }
  function status() { var c = registered(); return { existe: !!c, lien: c ? Tenants.lien(CODE) : '', derniere: props().getProperty('DEMO_LAST') || '', comptes: Object.keys(PROFILS), motdepasse: PASSWORD }; }

  return { CODE: CODE, isDemo: isDemo, available: available, blocked: blocked, resolveLogin: resolveLogin, info: info, switchTo: switchTo, checkUpload: checkUpload, reset: reset, tick: tick, status: status, seed: seed };
})();
