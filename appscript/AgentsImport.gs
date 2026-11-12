/**
 * Import d'agents depuis un fichier Excel ou CSV (« Fiche RH des agents ») — administrateur seulement.
 *  1) analyser : lit le fichier, reconnaît les colonnes, compare aux agents existants, propose la fonction du contrat ; rien n'est écrit ;
 *  2) appliquer : crée les agents cochés (compte + mot de passe provisoire) et enregistre leur fiche RH.
 * La fiche RH (téléphone, naissance, filiation, adresse, n° d'identité, sécurité sociale, CCP, situation familiale, nom en arabe)
 * est confidentielle : table FichesRH, lue et écrite par l'administrateur seulement.
 */
var AgentsImport = (function () {
  var FICHE = ['nom_ar', 'prenom_ar', 'telephone', 'date_naissance', 'lieu_naissance', 'pere', 'mere', 'adresse', 'nin', 'nss', 'ccp', 'situation'];
  var LIBELLES = { nom: 'Nom et prénom', prenom: 'Prénom', email: 'E-mail', fonction: 'Fonction', affectation: 'Affectation', date_entree: "Date d'entrée", nom_ar: 'Nom (arabe)', prenom_ar: 'Prénom (arabe)', telephone: 'Téléphone',
    date_naissance: 'Date de naissance', lieu_naissance: 'Lieu de naissance', pere: 'Père', mere: 'Mère', adresse: 'Adresse', nin: "N° carte d'identité / NIN", nss: 'N° sécurité sociale (CNAS)', ccp: 'N° CCP / RIB', situation: 'Situation familiale' };
  // Colonne reconnue d'après son en-tête (le plus précis d'abord : « Nom (arabe) » avant « Nom »).
  function classer(h) {
    var t = Format.norm(h); if (!t) return '';
    if (/arabe/.test(t)) return /prenom/.test(t) ? 'prenom_ar' : (/nom/.test(t) ? 'nom_ar' : '');
    if (/date.*naissance|ne\(?e?\)? le/.test(t)) return 'date_naissance';
    if (/lieu.*naissance/.test(t)) return 'lieu_naissance';
    if (/date.*(entree|recrutement|embauche)/.test(t)) return 'date_entree';
    if (/securite sociale|cnas|\bnss\b|assure/.test(t)) return 'nss';
    if (/identite|\bnin\b|\bcni\b/.test(t)) return 'nin';
    if (/\bccp\b|\brib\b|compte/.test(t)) return 'ccp';
    if (/mail|courriel/.test(t)) return 'email';
    if (/tel|mobile|portable/.test(t)) return 'telephone';
    if (/situation/.test(t)) return 'situation';
    if (/^pere|nom du pere|fils de/.test(t)) return 'pere';
    if (/^mere|nom de la mere/.test(t)) return 'mere';
    if (/adresse|domicile/.test(t)) return 'adresse';
    if (/fonction|poste|metier|qualification/.test(t)) return 'fonction';
    if (/affectation|site|chantier/.test(t)) return 'affectation';
    if (/^prenoms?$/.test(t)) return 'prenom';
    if (/nom/.test(t)) return 'nom';
    return '';
  }
  function texte(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200); }
  // Date : objet Date (Excel converti), n° de série Excel (30745), « jj/mm/aaaa » ou « aaaa-mm-jj » → « aaaa-mm-jj ».
  function dateIso(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : new Date(v.getTime() + 12 * 3600000).toISOString().slice(0, 10); // midi : pas de décalage d'un jour selon le fuseau
    var s = texte(v); if (!s) return '';
    if (/^\d{4,5}(\.\d+)?$/.test(s) && Number(s) > 3000 && Number(s) < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(Number(s)) * 86400000).toISOString().slice(0, 10);
    var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s); if (m) s = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    return Dates.isDate(s.slice(0, 10)) ? s.slice(0, 10) : '';
  }
  // Onglets du fichier : tableaux de cellules brutes (les dates restent des dates).
  function lire(o) {
    var name = String(o.nom || 'agents'); var ext = ((/\.([a-z0-9]+)$/i.exec(name) || [])[1] || '').toLowerCase();
    var bytes = Utilities.base64Decode(o.base64 || ''); Demo.checkUpload(bytes.length);
    if (!bytes.length) throw httpErr_('Fichier vide');
    if (bytes.length > CFG.MAX_UPLOAD_BYTES) throw httpErr_('Fichier trop volumineux (10 Mo maximum)');
    if (ext === 'csv') {
      var text = Utilities.newBlob(bytes).getDataAsString('UTF-8').replace(/^﻿/, '');
      var sep = text.indexOf(';') >= 0 ? ';' : text.indexOf('\t') >= 0 ? '\t' : ',';
      return [{ name: name, rows: text.split(/\r?\n/).map(function (l) { return l.split(sep).map(function (c) { return c.replace(/^"|"$/g, ''); }); }) }];
    }
    if (ext !== 'xlsx' && ext !== 'xls') throw httpErr_('Format non pris en charge (Excel .xlsx ou CSV)');
    var sid = Bordereau.driveConvert(bytes, o.mime || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name, 'application/vnd.google-apps.spreadsheet');
    try { return SpreadsheetApp.openById(sid).getSheets().filter(function (s) { return s.getLastRow() > 0; }).map(function (s) { return { name: s.getName(), rows: s.getDataRange().getValues() }; }); }
    finally { Bordereau.trash(sid); }
  }
  // Ligne d'en-tête : la première (parmi les 15 premières) qui contient une colonne « nom » et au moins deux autres colonnes reconnues.
  function entete(rows) {
    for (var i = 0; i < Math.min(rows.length, 15); i += 1) {
      var map = {}; var n = 0;
      rows[i].forEach(function (c, k) { var t = classer(c); if (t && map[t] === undefined) { map[t] = k; n += 1; } });
      if (map.nom !== undefined && n >= 3) return { ligne: i, map: map };
    }
    return null;
  }
  // Fonction du contrat la plus proche du libellé du fichier (« Ingénieur génie civil » → « Ingénieurs en Génie civil »).
  function mots(s) { return Format.norm(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(function (w) { return w.length >= 3; }).map(function (w) { return w.replace(/s$/, ''); }); }
  function proposerFonction(libelle, funcs) {
    var a = mots(libelle); if (!a.length) return '';
    var best = null;
    funcs.forEach(function (f) {
      var nom = f.libelle || f.designation; var b = mots(nom + ' ' + f.designation); if (!b.length) return;
      var communs = a.filter(function (w) { return b.indexOf(w) >= 0; }).length; var score = communs / Math.max(a.length, mots(nom).length || 1);
      if (Format.norm(nom) === Format.norm(libelle)) score = 2;
      if (communs && (!best || score > best.score)) best = { nom: nom, score: score };
    });
    return best && best.score >= 0.5 ? best.nom : '';
  }
  function fonctionsDe(contrat) { return Contrats.fonctions().filter(function (f) { return f.contrat === contrat && f.nature !== 'vehicule'; }); }

  function analyser(user, o) {
    o = o || {};
    var onglets = lire(o); var trouve = null; var feuille = '';
    onglets.forEach(function (s) { if (!trouve) { var e = entete(s.rows); if (e) { trouve = { e: e, rows: s.rows }; feuille = s.name; } } });
    if (!trouve) throw httpErr_('Aucun tableau d\'agents reconnu : il faut une ligne d\'en-tête avec « Nom et prénom » et au moins deux autres colonnes (e-mail, fonction, téléphone…)');
    var map = trouve.e.map; var enTete = trouve.rows[trouve.e.ligne];
    var contrat = texte(o.contrat); var funcs = contrat ? fonctionsDe(contrat) : [];
    var agents = Agents.list(); var parMail = {}; var parNom = {};
    agents.forEach(function (a) { if (a.email) parMail[a.email.toLowerCase()] = a; parNom[Format.norm(a.nom)] = a; });
    var vus = {}; var lignes = [];
    trouve.rows.slice(trouve.e.ligne + 1).forEach(function (r, i) {
      var val = function (k) { return map[k] === undefined ? '' : r[map[k]]; };
      var nom = texte(val('nom')); if (map.prenom !== undefined && texte(val('prenom'))) nom = (nom + ' ' + texte(val('prenom'))).trim();
      if (!nom || !/[A-Za-zÀ-ÿ؀-ۿ]{2}/.test(nom)) return;
      var email = texte(val('email')).toLowerCase(); var fiche = {};
      FICHE.forEach(function (k) { fiche[k] = k === 'date_naissance' ? dateIso(val(k)) : texte(val(k)); });
      var l = { ligne: trouve.e.ligne + 2 + i, nom: nom, email: email, fonction_lue: texte(val('fonction')), affectation: texte(val('affectation')), date_entree: dateIso(val('date_entree')), fiche: fiche, etat: 'nouveau', message: '', agent_id: '' };
      l.fonction = contrat ? proposerFonction(l.fonction_lue, funcs) : l.fonction_lue;
      var ex = (email && parMail[email]) || parNom[Format.norm(nom)];
      var memeNom = function (x) { var t = Format.norm(x.nom).split(' '); return Format.norm(nom).split(' ').some(function (w) { return w.length >= 4 && t.indexOf(w) >= 0; }); };
      if (ex && !memeNom(ex)) { l.etat = 'erreur'; l.message = 'Cette adresse e-mail appartient déjà à ' + ex.nom + '.'; }
      else if (ex) { l.etat = 'existant'; l.agent_id = ex.id; l.message = 'Déjà dans Sijil (' + ex.nom + ') : seule sa fiche RH sera complétée.'; }
      else if (!/^\S+@\S+\.\S+$/.test(email)) { l.etat = 'erreur'; l.message = 'Adresse e-mail absente ou invalide : elle sert d\'identifiant.'; }
      else if (vus[email]) { l.etat = 'erreur'; l.message = 'Adresse e-mail en double dans le fichier (ligne ' + vus[email] + ').'; }
      else if (contrat && funcs.length && !l.fonction) l.message = 'Fonction « ' + l.fonction_lue + ' » non trouvée au contrat : choisissez-la.';
      if (email && !vus[email]) vus[email] = l.ligne;
      if (map.date_naissance !== undefined && texte(val('date_naissance')) && !fiche.date_naissance) l.message = (l.message + ' Date de naissance illisible.').trim();
      lignes.push(l);
    });
    if (!lignes.length) throw httpErr_('Aucun agent dans ce fichier');
    if (lignes.length > 300) throw httpErr_('300 agents au maximum par fichier');
    var reconnues = Object.keys(map).map(function (k) { return { cle: k, libelle: LIBELLES[k], entete: texte(enTete[map[k]]) }; });
    var ignorees = enTete.map(texte).filter(function (h, k) { return h && !Object.keys(map).some(function (c) { return map[c] === k; }) && !/^n[°o]?$/i.test(h); });
    return { feuille: feuille, autres_feuilles: onglets.map(function (s) { return s.name; }).filter(function (n) { return n !== feuille; }), colonnes: reconnues, ignorees: ignorees, lignes: lignes, contrat: contrat,
      fonctions: funcs.map(function (f) { return f.libelle || f.designation; }), nouveaux: lignes.filter(function (l) { return l.etat === 'nouveau'; }).length, existants: lignes.filter(function (l) { return l.etat === 'existant'; }).length, erreurs: lignes.filter(function (l) { return l.etat === 'erreur'; }).length };
  }

  // ----- fiche RH (administrateur seulement) -----
  function exiger(user) { if (!user || user.role !== 'admin') throw httpErr_('Réservé à l\'administrateur', 'FORBIDDEN'); }
  function nettoyer(f) { var o = {}; FICHE.forEach(function (k) { o[k] = k === 'date_naissance' ? dateIso(f && f[k]) : texte(f && f[k]); }); return o; }
  function ficheGet(user, agentId) {
    exiger(user);
    var a = Agents.get(agentId); if (!a) throw httpErr_('Agent introuvable');
    var f = Store.readTable('FichesRH').filter(function (x) { return x.agent_id === agentId; })[0];
    var o = nettoyer(f || {}); o.agent_id = agentId; o.maj_le = f ? f.maj_le : ''; o.maj_par = f ? f.maj_par : '';
    return o;
  }
  // completer : ne remplace que les champs vides (import sur un agent existant) ; sinon remplace tout (saisie à la main).
  function ecrire(all, user, agentId, fiche, completer) {
    var f = nettoyer(fiche); var ex = all.filter(function (x) { return x.agent_id === agentId; })[0];
    if (!ex) { ex = { agent_id: agentId }; all.push(ex); completer = false; }
    FICHE.forEach(function (k) { if (!completer || !ex[k]) ex[k] = completer && !f[k] ? (ex[k] || '') : f[k]; });
    ex.maj_le = new Date().toISOString(); ex.maj_par = user.nom || '';
    return ex;
  }
  function ficheSave(user, agentId, fiche) {
    exiger(user);
    if (!Agents.get(agentId)) throw httpErr_('Agent introuvable');
    var all = Store.readTable('FichesRH'); ecrire(all, user, agentId, fiche, false);
    Store.writeTable('FichesRH', all);
    return ficheGet(user, agentId);
  }

  // o : { lignes: [{ nom, email, fonction, affectation, date_entree, fiche, agent_id }], contrat, chef_id, envoyer }
  function appliquer(user, o) {
    exiger(user); o = o || {};
    var lignes = Array.isArray(o.lignes) ? o.lignes : []; if (!lignes.length) throw httpErr_('Aucun agent à importer');
    if (lignes.length > 300) throw httpErr_('300 agents au maximum par fichier');
    var contrat = texte(o.contrat); var fiches = Store.readTable('FichesRH'); var crees = []; var completes = 0; var erreurs = [];
    lignes.forEach(function (l) {
      var nom = texte(l.nom);
      try {
        if (l.agent_id) { // déjà dans Sijil : la fiche RH est complétée, le compte n'est pas touché
          if (!Agents.get(l.agent_id)) throw httpErr_('Agent introuvable');
          ecrire(fiches, user, l.agent_id, l.fiche, true); completes += 1; return;
        }
        var r = Agents.create(user, { nom: nom, email: texte(l.email), role: 'agent', fonction: texte(l.fonction), contrat: contrat, affectation: texte(l.affectation), chef_id: texte(o.chef_id), date_entree: dateIso(l.date_entree) });
        ecrire(fiches, user, r.agent.id, l.fiche, false);
        crees.push({ id: r.agent.id, nom: r.agent.nom, email: r.agent.email, password: r.password, mail: '' });
      } catch (e) { erreurs.push({ nom: nom, message: e.message }); }
    });
    Store.writeTable('FichesRH', fiches);
    if (o.envoyer) crees.forEach(function (c) { try { Agents.sendAccess(user, c.id, c.password); c.mail = 'envoyé'; } catch (e) { c.mail = 'non envoyé : ' + e.message; } });
    return { crees: crees, completes: completes, erreurs: erreurs };
  }
  return { analyser: analyser, appliquer: appliquer, ficheGet: ficheGet, ficheSave: ficheSave, classer: classer, dateIso: dateIso, proposerFonction: proposerFonction, FICHE: FICHE, LIBELLES: LIBELLES };
})();
