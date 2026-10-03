/**
 * Documents déposés dans le compte d'un agent (fiches de paie, titres de congé, attestations, ATS…).
 * Rangés dans Drive : « Documents » (à côté du classeur) / un dossier par agent. Le type et la période sont reconnus
 * (nom du fichier, sinon contenu par OCR) puis le fichier est renommé : TC_Mahdi_01.03.2026, FDP_Mahdi_mars2026…
 */
var Documents = (function () {
  var CODES = { fiche_emolument: 'FDP', titre_conge: 'TC', attestation_travail: 'AT', ats: 'ATS', autre: 'DOC' };
  var MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  var MOIS_RE = '(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)';
  function n(s) { return Format.norm(s); }

  // ----- rangement : Documents/ à côté du classeur, puis un dossier par agent -----
  function childFolder(parent, name) {
    var it = parent.getFoldersByName(name);
    return it.hasNext() ? it.next() : parent.createFolder(name);
  }
  function rootFolder() {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty(Store.propKey('DOCS_ROOT_ID'));
    if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* dossier supprimé : on le recrée */ } }
    var parent = null;
    try { var p = DriveApp.getFileById(Store.ss().getId()).getParents(); if (p.hasNext()) parent = p.next(); } catch (e) { /* classeur à la racine */ }
    var f = parent ? childFolder(parent, 'Documents' + Store.folderSuffix()) : DriveApp.createFolder('Documents' + Store.folderSuffix());
    props.setProperty(Store.propKey('DOCS_ROOT_ID'), f.getId());
    return f;
  }
  function label(a) { return String(a.nom || '').trim().toLowerCase().replace(/(^|[\s'-])([a-zà-ÿ])/g, function (m, p, c) { return p + c.toUpperCase(); }); }
  function agentFolder(a) { return childFolder(rootFolder(), label(a).replace(/[\\/:*?"<>|]/g, '_') || 'Agent'); }

  // ----- reconnaissance du type et de la période -----
  function frDot(iso) { return iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : ''; }
  function isoOf(d, m, y) { var iso = y + '-' + (m < 10 ? '0' : '') + Number(m) + '-' + (d < 10 ? '0' : '') + Number(d); return Dates.isDate(iso) ? iso : ''; }
  // t : texte normalisé (minuscules, sans accents). Retourne { type, mois: 'mars2026', date: 'AAAA-MM-JJ' }.
  function analyse(t) {
    var out = { type: '', mois: '', date: '' };
    if (/\bats\b|attestation de travail et de salaire/.test(t)) out.type = 'ats';
    else if (/titre de conge|titre.?conge|\btc\b/.test(t)) out.type = 'titre_conge';
    else if (/fiche de paie|bulletin de paie|bulletin de salaire|fiche de salaire|fiche d.?emoluments?|\bfdp\b/.test(t)) out.type = 'fiche_emolument';
    else if (/attestation de travail|certificat de travail/.test(t)) out.type = 'attestation_travail';
    var d = /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})/.exec(t);
    if (d) out.date = isoOf(Number(d[1]), Number(d[2]), d[3]);
    var m = new RegExp(MOIS_RE + '\\s*(?:de\\s*|du\\s*)?[-_]?\\s*(20\\d{2})').exec(t);
    if (m) out.mois = m[1] + m[2];
    else {
      var sansDates = t.replace(/\d{1,2}[\/.\-]\d{1,2}[\/.\-]20\d{2}/g, ' ');
      var mm = /\b(0?[1-9]|1[0-2])[\/.\-](20\d{2})\b/.exec(sansDates);
      if (mm) out.mois = MOIS[Number(mm[1]) - 1] + mm[2];
      else if (out.date) out.mois = MOIS[Number(out.date.slice(5, 7)) - 1] + out.date.slice(0, 4); // « période du 01/03/2026… » : mois de la 1re date
    }
    return out;
  }
  function periodeLabel(type, mois, date) {
    if (type === 'fiche_emolument') return mois;
    return frDot(date);
  }
  function surname(a) { return (n(a.nom).split(' ')[0] || 'agent').replace(/[^a-z0-9]/g, '').replace(/^./, function (c) { return c.toUpperCase(); }); }
  function fileName(type, a, periode, ext, stem) {
    var base = (CODES[type] || 'DOC') + '_' + surname(a) + '_' + periode;
    if (type === 'autre' && stem) base += '_' + stem;
    return base + (ext ? '.' + ext : '');
  }
  function stemOf(nom) { return String(nom || '').replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9À-ÿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }
  function extOf(nom) { return ((/\.([a-z0-9]{1,8})$/i.exec(String(nom || '')) || [])[1] || '').toLowerCase(); }
  function uniqueName(folder, name) {
    var ext = extOf(name); var base = ext ? name.slice(0, -(ext.length + 1)) : name; var k = 1; var cur = name;
    while (folder.getFilesByName(cur).hasNext()) { k += 1; cur = base + '_' + k + (ext ? '.' + ext : ''); }
    return cur;
  }

  // Type et période d'un fichier déposé : nom du fichier d'abord, contenu (OCR) seulement si nécessaire.
  function detect(data, chosen, agent) {
    var fromName = analyse(n(String(data.nom || '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ')));
    var type = chosen || fromName.type; var source = chosen ? 'choix' : (fromName.type ? 'nom' : '');
    var mois = fromName.mois; var date = fromName.date; var avert = []; var text = '';
    var besoin = !type || (type === 'fiche_emolument' && !fromName.mois) || (type !== 'fiche_emolument' && !fromName.date);
    if (besoin) {
      try { text = n(Bordereau.ocrText(data)); } catch (e) { avert.push('Lecture automatique impossible (' + e.message + ').'); }
      if (text) {
        var fromText = analyse(text);
        if (!type && fromText.type) { type = fromText.type; source = 'contenu'; }
        if (!mois) mois = fromText.mois; if (!date) date = fromText.date;
        // le texte parle-t-il d'un autre agent que celui choisi ?
        var autre = Agents.list().filter(function (x) { return x.id !== agent.id && Agents.isPerson(x) && n(x.nom).indexOf(' ') > 0 && text.indexOf(n(x.nom)) >= 0; })[0];
        if (autre && text.indexOf(n(agent.nom)) < 0) avert.push('Ce document semble concerner ' + autre.nom + ', pas ' + agent.nom + '.');
      }
    }
    if (!type) { type = 'autre'; source = 'defaut'; avert.push('Type non reconnu : classé « Autre » (corrigeable).'); }
    var today = Dates.today();
    if (!mois) mois = MOIS[Number(today.slice(5, 7)) - 1] + today.slice(0, 4);
    if (!date) date = today;
    return { type: type, source: source, mois: mois, date: date, avertissement: avert.join(' ') };
  }

  // ----- API -----
  function canSee(user, agentId) {
    return user.role === 'admin' || user.id === agentId || Agents.visibleTo(user).some(function (a) { return a.id === agentId; });
  }
  function pub(d) { var o = {}; Object.keys(d).forEach(function (k) { if (k !== 'file_id') o[k] = d[k]; }); return o; }

  function list(user, agentId) {
    agentId = agentId || user.id;
    if (!canSee(user, agentId)) throw httpErr_('Accès refusé', 'FORBIDDEN');
    return Store.readTable('Documents').filter(function (d) { return d.agent_id === agentId; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(pub);
  }
  function upload(user, data) {
    if (user.role === 'agent') throw httpErr_('Accès refusé', 'FORBIDDEN');
    if (!Agents.visibleTo(user).some(function (a) { return a.id === data.agent_id; })) throw httpErr_("Cet agent n'est pas dans votre groupe", 'FORBIDDEN');
    var agent = Agents.get(data.agent_id);
    if (agent && agent.type === 'vehicule') throw httpErr_("Un véhicule n'a pas de dossier de documents");
    var chosen = CFG.TYPES_DOC[data.type] ? data.type : ''; // « auto » (ou vide) = reconnaissance automatique
    if (data.type && data.type !== 'auto' && !CFG.TYPES_DOC[data.type]) throw httpErr_('Type de document invalide');
    if (!data.base64 || !data.nom) throw httpErr_('Fichier manquant');
    var bytes = Utilities.base64Decode(data.base64);
    if (bytes.length > CFG.MAX_UPLOAD_BYTES) throw httpErr_('Fichier trop volumineux (6 Mo maximum)');
    var info = detect(data, chosen, agent);
    var periode = periodeLabel(info.type, info.mois, info.date);
    var folder = agentFolder(agent);
    var name = uniqueName(folder, fileName(info.type, agent, periode, extOf(data.nom), stemOf(data.nom)));
    var file = folder.createFile(Utilities.newBlob(bytes, data.mime || 'application/octet-stream', name));
    var d = { id: newId_('G'), agent_id: data.agent_id, type: info.type, titre: name.replace(/\.[a-z0-9]{1,8}$/i, ''), file_id: file.getId(), nom_original: name, depose_par: user.nom, date: new Date().toISOString(), code: CODES[info.type], periode: periode, dossier: 'Documents/' + label(agent) };
    Store.writeTable('Documents', Store.readTable('Documents').concat([d]));
    notifyAgent(user, agent, d);
    var out = pub(d); out.detecte = { type: info.type, source: info.source, avertissement: info.avertissement, original: data.nom };
    return out;
  }
  // Prévient l'agent par e-mail qu'un nouveau document est dans son espace.
  function notifyAgent(user, agent, d) {
    try {
      if (!agent || agent.id === user.id || !/^\S+@\S+\.\S+$/.test(agent.email || '')) return;
      MailApp.sendEmail({ to: agent.email, replyTo: user.email || undefined, subject: 'Nouveau document — ' + d.nom_original,
        body: 'Bonjour ' + agent.nom + ',\n\nNouveau document dans votre espace Sijil : ' + d.nom_original + '\nDéposé par ' + user.nom + '.\n\nConnectez-vous, onglet « Mes documents », pour le télécharger.' });
    } catch (e) { Logger.log('Document non notifié : ' + e.message); }
  }
  // Correction après coup : type et/ou période → le fichier est renommé dans Drive.
  function update(user, id, data) {
    if (user.role === 'agent') throw httpErr_('Accès refusé', 'FORBIDDEN');
    var all = Store.readTable('Documents');
    var d = all.filter(function (x) { return x.id === id; })[0];
    if (!d || !canSee(user, d.agent_id)) throw httpErr_('Document introuvable', 'FORBIDDEN');
    var agent = Agents.get(d.agent_id);
    var type = data.type && CFG.TYPES_DOC[data.type] ? data.type : d.type;
    var periode = d.periode;
    if (data.periode !== undefined && String(data.periode).trim() !== '') {
      var a = analyse(n(data.periode));
      var p = type === 'fiche_emolument' ? a.mois : frDot(a.date);
      if (!p) throw httpErr_(type === 'fiche_emolument' ? 'Période : indiquez un mois et une année (ex. mars 2026 ou 03/2026)' : 'Date : jj/mm/aaaa');
      periode = p;
    } else if (type !== d.type) { // changement de type : la période garde son sens (mois ↔ date)
      var m = n(d.periode); var asDate = /^\d{2}\.\d{2}\.\d{4}$/.test(d.periode);
      if (type === 'fiche_emolument' && asDate) periode = MOIS[Number(d.periode.slice(3, 5)) - 1] + d.periode.slice(6);
      else if (type !== 'fiche_emolument' && !asDate) { var mi = MOIS.indexOf(m.replace(/\d+/g, '')); periode = '01.' + (mi < 9 ? '0' : '') + (mi + 1) + '.' + m.replace(/\D+/g, ''); }
    }
    var file = DriveApp.getFileById(d.file_id);
    var folder = agentFolder(agent);
    var name = fileName(type, agent, periode, extOf(d.nom_original), '');
    if (name !== d.nom_original) { name = uniqueName(folder, name); file.setName(name); }
    d.type = type; d.code = CODES[type]; d.periode = periode; d.nom_original = name; d.titre = name.replace(/\.[a-z0-9]{1,8}$/i, '');
    Store.writeTable('Documents', all);
    return pub(d);
  }
  function download(user, id) {
    var d = Store.readTable('Documents').filter(function (x) { return x.id === id; })[0];
    if (!d || !canSee(user, d.agent_id)) throw httpErr_('Document introuvable', 'FORBIDDEN');
    var blob = DriveApp.getFileById(d.file_id).getBlob();
    return { nom: d.nom_original, mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
  }
  function remove(user, id) {
    var all = Store.readTable('Documents');
    var d = all.filter(function (x) { return x.id === id; })[0];
    if (user.role === 'agent' || !d || !canSee(user, d.agent_id)) throw httpErr_('Document introuvable', 'FORBIDDEN');
    try { DriveApp.getFileById(d.file_id).setTrashed(true); } catch (e) { /* déjà supprimé */ }
    Store.writeTable('Documents', all.filter(function (x) { return x.id !== id; }));
  }
  function count(agentId) { return Store.readTable('Documents').filter(function (d) { return d.agent_id === agentId; }).length; }
  // Vidage : corbeille de tous les fichiers déposés.
  function purgeFiles() {
    Store.readTable('Documents').forEach(function (d) { try { DriveApp.getFileById(d.file_id).setTrashed(true); } catch (e) { /* ignore */ } });
  }
  return { list: list, upload: upload, update: update, download: download, remove: remove, count: count, purgeFiles: purgeFiles, analyse: analyse, fileName: fileName };
})();
