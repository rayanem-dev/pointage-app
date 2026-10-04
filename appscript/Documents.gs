/**
 * Documents déposés dans le compte d'un agent (fiches de paie, titres de congé, contrats, attestations…).
 * Rangés dans Drive : « Documents » (à côté du classeur) / un dossier par agent. Le type, l'agent et les dates sont reconnus
 * (nom du fichier, sinon contenu par OCR) puis le fichier est renommé selon des règles fixes :
 *   TC_NOM_Prenom_2026-02-14 · NOM_Prenom_FDP_Mars2026 · NOM_Prenom_2026-04-04_Contrat · NOM_Prenom_AttestationCNAS_<n° ss>_2026-05-07
 *   NOM_Prenom_MAJCNAS_Janvier2026_Mars2026 · NOM_Prenom_AttestationTravail_2026-05-04 · NOM_Prenom_AttestationEmoluments_Janvier2026_Mars2026
 * Dépôt en vrac : les fichiers sont d'abord classés dans « À classer » avec une proposition ; rien n'est envoyé aux agents avant validation.
 */
var Documents = (function () {
  var CODES = { titre_conge: 'TC', fiche_emolument: 'FDP', contrat: 'CONTRAT', attestation_cnas: 'ACNAS', maj_cnas: 'MAJCNAS', attestation_travail: 'AT', attestation_emoluments: 'AE', ats: 'ATS', autre: 'DOC' };
  var MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  var MOIS_AFF = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
  var MOIS_RE = '(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)';
  // Champs obligatoires pour nommer chaque type ; « autre » n'en demande aucun.
  var REQUIS = { titre_conge: ['date'], fiche_emolument: ['mois'], contrat: ['date'], attestation_cnas: ['date'], maj_cnas: ['mois', 'mois2'], attestation_travail: ['date'], attestation_emoluments: ['mois', 'mois2'], ats: ['date'], autre: [] };
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
  function stagingFolder() { return childFolder(rootFolder(), 'À classer'); }

  // ----- dates et mois -----
  function frDot(iso) { return iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : ''; }
  function isoOf(d, m, y) { var iso = y + '-' + (Number(m) < 10 ? '0' : '') + Number(m) + '-' + (Number(d) < 10 ? '0' : '') + Number(d); return Dates.isDate(iso) ? iso : ''; }
  function moisKey(m, y) { return MOIS[Number(m) - 1] + y; }
  function moisLabel(k) { var m = /^([a-z]+)(20\d{2})$/.exec(String(k || '')); var i = m ? MOIS.indexOf(m[1]) : -1; return i < 0 ? '' : MOIS_AFF[i] + m[2]; }
  // Toutes les dates du texte normalisé, dans l'ordre : jj/mm/aaaa, jj-mm-aaaa, aaaa-mm-jj, « 14 fevrier 2026 ».
  function allDates(t) {
    var out = []; var re = new RegExp('(\\d{1,2})\\s*[\\/.\\-]\\s*(\\d{1,2})\\s*[\\/.\\-]\\s*(20\\d{2})|(20\\d{2})-(\\d{2})-(\\d{2})|(\\d{1,2})(?:er)?\\s+' + MOIS_RE + '\\s+(20\\d{2})', 'g'); var m;
    while ((m = re.exec(t))) {
      var iso = m[1] ? isoOf(m[1], m[2], m[3]) : m[4] ? isoOf(m[6], m[5], m[4]) : isoOf(m[7], MOIS.indexOf(m[8]) + 1, m[9]);
      if (iso) out.push({ iso: iso, i: m.index, len: m[0].length });
    }
    return out;
  }
  function dateAfter(t, re) { var m = re.exec(t); if (!m) return ''; var rest = t.slice(m.index + m[0].length, m.index + m[0].length + 40); var d = allDates(rest)[0]; return d && d.i < 25 ? d.iso : ''; }
  function moisOfIso(iso) { return iso ? moisKey(iso.slice(5, 7), iso.slice(0, 4)) : ''; }
  // Période de mois couverte : « du 01/01/2026 au 31/03/2026 », « de janvier 2026 à mars 2026 », « janvier à mars 2026 », « 01/2026 à 03/2026 ».
  function moisRange(t) {
    var ds = allDates(t); var du = /\bdu\b[^0-9a-z]{0,3}$/;
    for (var i = 0; i + 1 < ds.length; i += 1) {
      var between = t.slice(ds[i].i + ds[i].len, ds[i + 1].i);
      if (/^\s*(au|a|-|jusqu\s?au|jusqu a)\s*$/.test(between) && ds[i + 1].iso >= ds[i].iso) return { mois: moisOfIso(ds[i].iso), mois2: moisOfIso(ds[i + 1].iso) };
    }
    var r = new RegExp(MOIS_RE + '\\s*(20\\d{2})?\\s*(?:a|au|-|jusqu a|jusqu au|et)\\s*' + MOIS_RE + '\\s*(20\\d{2})').exec(t);
    if (r) return { mois: r[1] + (r[2] || r[4]), mois2: r[3] + r[4] };
    var s = /\b(0?[1-9]|1[0-2])\s*[\/.\-]\s*(20\d{2})\s*(?:a|au|-)\s*(0?[1-9]|1[0-2])\s*[\/.\-]\s*(20\d{2})\b/.exec(t);
    if (s) return { mois: moisKey(s[1], s[2]), mois2: moisKey(s[3], s[4]) };
    var one = new RegExp(MOIS_RE + '\\s*(?:de\\s*|du\\s*)?[-_]?\\s*(20\\d{2})').exec(t);
    if (one) return { mois: one[1] + one[2], mois2: one[1] + one[2] };
    return { mois: '', mois2: '' };
  }
  function moisSeul(t) {
    var m = new RegExp(MOIS_RE + '\\s*(?:de\\s*|du\\s*)?[-_]?\\s*(20\\d{2})').exec(t);
    if (m) return m[1] + m[2];
    var sansDates = t.replace(/\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*20\d{2}/g, ' ');
    var mm = /\b(0?[1-9]|1[0-2])\s*[\/.\-]\s*(20\d{2})\b/.exec(sansDates);
    if (mm) return moisKey(mm[1], mm[2]);
    var d = allDates(t)[0];
    return d ? moisOfIso(d.iso) : '';
  }
  function nssOf(t) {
    var m = /(?:immatriculation|securite sociale|n[°o]?\s*ss\b|nss|assure social|n[°o]\s*d.?assure)[^0-9]{0,40}(\d[\d\s]{8,16}\d)/.exec(t);
    var digits = m ? m[1].replace(/\s+/g, '') : '';
    if (digits.length >= 9 && digits.length <= 14) return digits;
    var any = /\b(\d{10,12})\b/.exec(t.replace(/(\d)\s(?=\d{3}\b)/g, '$1'));
    return any ? any[1] : '';
  }

  // ----- reconnaissance du type et des champs (t : texte normalisé : minuscules, sans accents) -----
  function detectType(t) {
    if (/\bats\b|attestation de travail et de salaire/.test(t)) return 'ats';
    if (/titre de conge|titre.?conge|\btc\b/.test(t)) return 'titre_conge';
    if (/(mise a jour|\bmaj\b).{0,40}(cnas|assurances? sociales?|affiliation)|(cnas|affiliation).{0,40}(mise a jour|\bmaj\b)/.test(t)) return 'maj_cnas';
    if (/attestation d.?affiliation|attestation.{0,10}cnas|\bcnas\b|caisse nationale des assurances sociales/.test(t)) return 'attestation_cnas';
    if (/attestations? (?:d|des|de)[^a-z]{0,3}emoluments?|attestations? de salaire/.test(t)) return 'attestation_emoluments';
    if (/fiche de paie|bulletin de paie|bulletin de salaire|fiche de salaire|fiche d.?emoluments?|\bfdp\b/.test(t)) return 'fiche_emolument';
    if (/attestation de travail|certificat de travail/.test(t)) return 'attestation_travail';
    if (/contrat de travail|contrat a duree|\bcontrat\b/.test(t)) return 'contrat';
    return '';
  }
  // Champs utiles au type : { date, mois, mois2, nss } (chaînes vides si non lus).
  function extract(type, t) {
    var f = { date: '', mois: '', mois2: '', nss: '' }; var first = allDates(t)[0]; first = first ? first.iso : '';
    if (type === 'titre_conge') f.date = dateAfter(t, /(a compter du|a partir du|depart le|debut(?: du conge)?\s*:?|du)\s*/) || first;
    else if (type === 'contrat') f.date = dateAfter(t, /(a compter du|prenant effet le|debut(?:ant)? le|date d.?effet|effet le|du)\s*/) || first;
    else if (type === 'attestation_travail') f.date = dateAfter(t, /(fait a [a-z ]{2,30},? le|delivree? le|etablie? le|alger,? le|le)\s*/) || first;
    else if (type === 'attestation_cnas') { f.date = dateAfter(t, /(fait a [a-z ]{2,30},? le|delivree? le|etablie? le|edition le|date d.?edition|le)\s*/) || first; f.nss = nssOf(t); }
    else if (type === 'ats') f.date = first;
    else if (type === 'fiche_emolument') f.mois = moisSeul(t);
    else if (type === 'maj_cnas' || type === 'attestation_emoluments') { var r = moisRange(t); f.mois = r.mois; f.mois2 = r.mois2; }
    return f;
  }
  function missing(type, f) { return (REQUIS[type] || []).filter(function (k) { return !f[k]; }); }
  function merge(a, b) { var o = {}; ['date', 'mois', 'mois2', 'nss'].forEach(function (k) { o[k] = a[k] || b[k] || ''; }); return o; }
  // « 1er mars → mois seul / période » : adapte les champs d'un type à l'autre (changement de type après coup).
  function adapt(type, f) {
    var o = merge(f, {});
    if (!o.mois && o.date) o.mois = moisOfIso(o.date);
    if (!o.mois2) o.mois2 = o.mois;
    if (!o.date && o.mois) { var m = /^([a-z]+)(20\d{2})$/.exec(o.mois); if (m) o.date = isoOf(1, MOIS.indexOf(m[1]) + 1, m[2]); }
    return o;
  }

  // ----- nom final : NOM_Prenom et règles par type -----
  function noAccents(s) { try { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { return String(s); } }
  function whoOf(a) {
    var toks = noAccents(a.nom || 'agent').trim().split(/\s+/).filter(Boolean);
    var nom = (toks.shift() || 'AGENT').toUpperCase();
    var pre = toks.map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1).toLowerCase(); }).join('-');
    return (nom + (pre ? '_' + pre : '')).replace(/[^A-Za-z0-9_-]/g, '');
  }
  function stemOf(nom) { return String(nom || '').replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9À-ÿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }
  function extOf(nom) { return ((/\.([a-z0-9]{1,8})$/i.exec(String(nom || '')) || [])[1] || '').toLowerCase(); }
  function nameFor(type, agent, f, stem) {
    var who = whoOf(agent); var today = Dates.today();
    var date = f.date || today; var m1 = moisLabel(f.mois) || moisLabel(moisOfIso(today)); var m2 = moisLabel(f.mois2) || m1;
    switch (type) {
      case 'titre_conge': return 'TC_' + who + '_' + date;
      case 'fiche_emolument': return who + '_FDP_' + m1;
      case 'contrat': return who + '_' + date + '_Contrat';
      case 'attestation_cnas': return who + '_AttestationCNAS_' + (f.nss ? f.nss + '_' : '') + date;
      case 'maj_cnas': return who + '_MAJCNAS_' + m1 + '_' + m2;
      case 'attestation_travail': return who + '_AttestationTravail_' + date;
      case 'attestation_emoluments': return who + '_AttestationEmoluments_' + m1 + '_' + m2;
      case 'ats': return who + '_ATS_' + date;
      default: return who + '_' + (stem || 'Document');
    }
  }
  function fileName(type, agent, f, ext, stem) { return nameFor(type, agent, f, stem) + (ext ? '.' + ext : ''); }
  // Texte affiché pour la période du document.
  function periodeOf(type, f) {
    if (type === 'fiche_emolument') return moisLabel(f.mois);
    if (type === 'maj_cnas' || type === 'attestation_emoluments') return moisLabel(f.mois) + (f.mois2 && f.mois2 !== f.mois ? ' → ' + moisLabel(f.mois2) : '');
    if (type === 'attestation_cnas') return (f.nss ? f.nss + ' · ' : '') + (f.date || '');
    return f.date || '';
  }
  function uniqueName(folder, name) {
    var ext = extOf(name); var base = ext ? name.slice(0, -(ext.length + 1)) : name; var k = 1; var cur = name;
    while (folder.getFilesByName(cur).hasNext()) { k += 1; cur = base + '_' + k + (ext ? '.' + ext : ''); }
    return cur;
  }
  // Période saisie à la main (correction) : lue selon le type.
  function parsePeriode(type, text) {
    var f = extract(type, n(text));
    if (type === 'fiche_emolument' && !f.mois) throw httpErr_('Période : indiquez un mois et une année (ex. mars 2026 ou 03/2026)');
    if ((type === 'maj_cnas' || type === 'attestation_emoluments') && !(f.mois && f.mois2)) throw httpErr_('Période : indiquez deux mois (ex. janvier 2026 à mars 2026)');
    if (REQUIS[type] && REQUIS[type].indexOf('date') >= 0 && !f.date) throw httpErr_('Date : jj/mm/aaaa');
    return f;
  }

  // ----- reconnaissance de l'agent concerné (parmi ceux que l'utilisateur peut voir) -----
  function findAgents(t, agents) {
    var words = {}; t.split(/[^a-z0-9]+/).forEach(function (w) { if (w) words[w] = true; });
    var scored = agents.map(function (a) {
      var toks = n(a.nom).split(' ').filter(function (x) { return x.length >= 2; });
      var hit = toks.filter(function (x) { return words[x]; }).length;
      return { a: a, toks: toks.length, hit: hit };
    }).filter(function (s) { return s.hit > 0 && s.hit === s.toks && s.toks >= 2; }); // nom ET prénom présents
    var partial = agents.filter(function (a) { var toks = n(a.nom).split(' '); return toks.length >= 2 && words[toks[0]] && !scored.some(function (s) { return s.a.id === a.id; }); });
    return scored.length ? scored.map(function (s) { return s.a; }) : partial;
  }

  // Type et champs d'un fichier : nom du fichier d'abord, contenu (OCR) seulement si nécessaire.
  function detect(data, chosen, agent, agents) {
    var base = String(data.nom || '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
    var tn = n(base); var type = chosen || detectType(tn); var source = chosen ? 'choix' : (type ? 'nom' : '');
    var f = type ? extract(type, tn) : { date: '', mois: '', mois2: '', nss: '' };
    var cands = agent ? [agent] : findAgents(tn, agents || []); var avert = [];
    var besoin = !type || missing(type, f).length > 0 || (!agent && cands.length !== 1);
    if (besoin) {
      var text = '';
      try { text = n(Bordereau.ocrText(data)).slice(0, 12000); } catch (e) { avert.push('Lecture automatique impossible (' + e.message + ').'); }
      if (text) {
        if (!type) { var tt = detectType(text); if (tt) { type = tt; source = 'contenu'; } }
        if (type) f = merge(f, extract(type, text));
        if (!agent && cands.length !== 1) { var byText = findAgents(text, agents || []); if (byText.length) cands = byText; }
        if (agent) {
          var autre = (agents || Agents.list()).filter(function (x) { return x.id !== agent.id && Agents.isPerson(x) && n(x.nom).indexOf(' ') > 0 && text.indexOf(n(x.nom)) >= 0; })[0];
          if (autre && text.indexOf(n(agent.nom)) < 0) avert.push('Ce document semble concerner ' + autre.nom + ', pas ' + agent.nom + '.');
        }
      }
    }
    if (!type) { type = 'autre'; source = 'defaut'; avert.push('Type non reconnu : classé « Autre » (corrigeable).'); }
    var manque = missing(type, f);
    if (manque.length) avert.push('À compléter : ' + manque.map(function (k) { return { date: 'date', mois: 'mois', mois2: 'mois de fin' }[k] || k; }).join(', ') + '.');
    if (type === 'attestation_cnas' && !f.nss) avert.push('N° de sécurité sociale non lu : à compléter si besoin.');
    return { type: type, source: source, champs: f, avertissement: avert.join(' '), candidats: cands };
  }

  // ----- API -----
  function canSee(user, agentId) {
    return user.role === 'admin' || user.id === agentId || Agents.visibleTo(user).some(function (a) { return a.id === agentId; });
  }
  function pub(d) { var o = {}; Object.keys(d).forEach(function (k) { if (k !== 'file_id' && k !== 'champs' && k !== 'empreinte') o[k] = d[k]; }); return o; }

  function list(user, agentId) {
    agentId = agentId || user.id;
    if (!canSee(user, agentId)) throw httpErr_('Accès refusé', 'FORBIDDEN');
    return Store.readTable('Documents').filter(function (d) { return d.agent_id === agentId; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(pub);
  }
  function readBytes(data) {
    if (!data.base64 || !data.nom) throw httpErr_('Fichier manquant');
    var bytes = Utilities.base64Decode(data.base64);
    if (bytes.length > CFG.MAX_UPLOAD_BYTES) throw httpErr_('Fichier trop volumineux (10 Mo maximum)');
    return bytes;
  }
  // ----- image → PDF : fabriqué ici (JPEG et PNG sans alpha), sans service externe ; l'orientation EXIF des photos est respectée -----
  // Les octets restent « signés » (comme les rend Utilities.base64Decode) : aucune copie du fichier, ni d'empilement d'arguments (plantage sur les grosses photos).
  function ascii(s) { var o = []; for (var i = 0; i < s.length; i += 1) { var c = s.charCodeAt(i) & 255; o.push(c > 127 ? c - 256 : c); } return o; }
  function jpegInfo(a) {
    var U = function (i) { return (a[i] + 256) % 256; }; var be16 = function (i) { return U(i) * 256 + U(i + 1); };
    if (U(0) !== 255 || U(1) !== 216) return null;
    var i = 2; var orient = 1; var info = null;
    while (i + 4 < a.length) {
      if (U(i) !== 255) { i += 1; continue; }
      var m = U(i + 1); if (m === 255) { i += 1; continue; }
      if (m === 216 || (m >= 208 && m <= 215) || m === 1) { i += 2; continue; }
      var len = be16(i + 2);
      if (m === 225 && U(i + 4) === 69 && U(i + 5) === 120 && U(i + 6) === 105 && U(i + 7) === 102) { // « Exif » : orientation de la photo
        try {
          var t = i + 10; var le = U(t) === 73; var r16 = function (p) { return le ? U(p) + U(p + 1) * 256 : U(p) * 256 + U(p + 1); };
          var r32 = function (p) { return le ? U(p) + U(p + 1) * 256 + U(p + 2) * 65536 + U(p + 3) * 16777216 : ((U(p) * 256 + U(p + 1)) * 256 + U(p + 2)) * 256 + U(p + 3); };
          var ifd = t + r32(t + 4); var cnt = r16(ifd);
          for (var k = 0; k < cnt && k < 60; k += 1) { var e = ifd + 2 + k * 12; if (r16(e) === 274) { orient = r16(e + 8); break; } }
        } catch (err) { orient = 1; }
      }
      if (m >= 192 && m <= 207 && m !== 196 && m !== 200 && m !== 204) { info = { bits: U(i + 4), h: be16(i + 5), w: be16(i + 7), comps: U(i + 9) }; break; }
      i += 2 + len;
    }
    if (!info || !info.w || !info.h || (info.comps !== 1 && info.comps !== 3) || info.bits !== 8) return null;
    info.orient = orient; return info;
  }
  function pngInfo(a) {
    var U = function (i) { return (a[i] + 256) % 256; }; var be32 = function (i) { return ((U(i) * 256 + U(i + 1)) * 256 + U(i + 2)) * 256 + U(i + 3); };
    var sig = [137, 80, 78, 71, 13, 10, 26, 10]; for (var s = 0; s < 8; s += 1) if (U(s) !== sig[s]) return null;
    var i = 8; var info = null; var parts = []; var plte = null;
    while (i + 8 <= a.length) {
      var len = be32(i); var type = String.fromCharCode(U(i + 4), U(i + 5), U(i + 6), U(i + 7)); var d = i + 8;
      if (type === 'IHDR') info = { w: be32(d), h: be32(d + 4), bits: U(d + 8), ctype: U(d + 9), interlace: U(d + 12) };
      else if (type === 'PLTE') plte = a.slice(d, d + len).map(function (v) { return (v + 256) % 256; });
      else if (type === 'IDAT') parts.push(a.slice(d, d + len));
      else if (type === 'IEND') break;
      i = d + len + 4;
    }
    if (!info || info.interlace || [0, 2, 3].indexOf(info.ctype) < 0 || !parts.length || (info.ctype === 3 && !plte)) return null; // alpha ou entrelacé : non géré
    info.idat = [].concat.apply([], parts); info.plte = plte; return info;
  }
  // Fabrique un PDF d'une page contenant l'image ; null si le format n'est pas pris en charge.
  function imageToPdf(a) {
    var j = jpegInfo(a); var p = j ? null : pngInfo(a);
    if (!j && !p) return null;
    var w = j ? j.w : p.w; var h = j ? j.h : p.h; var rot = j ? { 3: 180, 6: 90, 8: 270 }[j.orient] || 0 : 0;
    var scale = 842 / Math.max(w, h); var pw = Math.max(1, Math.round(w * scale * 100) / 100); var ph = Math.max(1, Math.round(h * scale * 100) / 100);
    var imgDict; var data;
    if (j) { imgDict = '/Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace ' + (j.comps === 1 ? '/DeviceGray' : '/DeviceRGB') + ' /BitsPerComponent 8 /Filter /DCTDecode'; data = a; }
    else {
      var cs = p.ctype === 0 ? '/DeviceGray' : p.ctype === 2 ? '/DeviceRGB' : (function () { var hex = ''; p.plte.forEach(function (v) { hex += ('0' + v.toString(16)).slice(-2); }); return '[/Indexed /DeviceRGB ' + (p.plte.length / 3 - 1) + ' <' + hex + '>]'; })();
      var colors = p.ctype === 2 ? 3 : 1;
      imgDict = '/Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace ' + cs + ' /BitsPerComponent ' + p.bits + ' /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ' + colors + ' /BitsPerComponent ' + p.bits + ' /Columns ' + w + ' >>';
      data = p.idat;
    }
    // assemblage par segments : en-tête, objets, image (le tableau d'origine est réutilisé tel quel), fin de fichier
    var segs = []; var pos = 0; var offs = [];
    function add(x) { var arr = typeof x === 'string' ? ascii(x) : x; segs.push(arr); pos += arr.length; }
    function obj(n, head, body, tail) { offs[n] = pos; add(n + ' 0 obj\n'); add(head); if (body) add(body); if (tail) add(tail); add('\nendobj\n'); }
    add('%PDF-1.5\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Rotate ' + rot + ' /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>');
    var content = 'q ' + pw + ' 0 0 ' + ph + ' 0 0 cm /Im0 Do Q';
    obj(4, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    obj(5, '<< ' + imgDict + ' /Length ' + data.length + ' >>\nstream\n', data, '\nendstream');
    var xref = pos; var tab = 'xref\n0 6\n0000000000 65535 f \n';
    for (var n = 1; n <= 5; n += 1) tab += ('0000000000' + offs[n]).slice(-10) + ' 00000 n \n';
    add(tab + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return [].concat.apply([], segs);
  }
  // Une image peut être convertie en PDF (option « convertir en PDF ») ; les autres formats restent tels quels. Le motif d'un échec est conservé pour être affiché.
  function maybePdf(data, bytes) {
    var ext = extOf(data.nom); var motif = '';
    if (data.pdf && ['jpg', 'jpeg', 'png', 'gif', 'bmp'].indexOf(ext) >= 0) {
      try { var pdf = imageToPdf(bytes); if (pdf) return { bytes: pdf, mime: 'application/pdf', ext: 'pdf', converti: true }; motif = 'format d\'image non géré (PNG avec transparence, GIF, BMP ou JPEG CMJN)'; } catch (e) { motif = e.message; Logger.log('Conversion PDF (interne) impossible : ' + e.message); }
      try { var b = Utilities.newBlob(bytes, data.mime || 'image/' + (ext === 'jpg' ? 'jpeg' : ext), data.nom).getAs('application/pdf'); return { bytes: b.getBytes(), mime: 'application/pdf', ext: 'pdf', converti: true }; } catch (e) { Logger.log('Conversion PDF (Google) impossible : ' + e.message); }
      return { bytes: bytes, mime: data.mime || 'application/octet-stream', ext: ext, converti: false, echec: motif || 'conversion indisponible' };
    }
    return { bytes: bytes, mime: data.mime || 'application/octet-stream', ext: ext, converti: false };
  }
  // Empreinte du fichier déposé (avant toute conversion) : sert à repérer un même fichier déposé deux fois.
  function hashOf(bytes) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
  function docRow(user, agent, type, f, name, file, empreinte) {
    var d = { id: newId_('G'), agent_id: agent.id, type: type, titre: name.replace(/\.[a-z0-9]{1,8}$/i, ''), file_id: file.getId(), nom_original: name, depose_par: user.nom, date: new Date().toISOString(), code: CODES[type], periode: periodeOf(type, f), dossier: 'Documents/' + label(agent), champs: JSON.stringify(f), empreinte: empreinte || '', nouveau: '1' };
    return d;
  }
  function upload(user, data) {
    if (user.role === 'agent') throw httpErr_('Accès refusé', 'FORBIDDEN');
    if (!Agents.visibleTo(user).some(function (a) { return a.id === data.agent_id; })) throw httpErr_("Cet agent n'est pas dans votre groupe", 'FORBIDDEN');
    var agent = Agents.get(data.agent_id);
    if (agent && agent.type === 'vehicule') throw httpErr_("Un véhicule n'a pas de dossier de documents");
    var chosen = CFG.TYPES_DOC[data.type] ? data.type : ''; // « auto » (ou vide) = reconnaissance automatique
    if (data.type && data.type !== 'auto' && !CFG.TYPES_DOC[data.type]) throw httpErr_('Type de document invalide');
    var bytes = readBytes(data);
    var info = detect(data, chosen, agent, null);
    var conv = maybePdf(data, bytes);
    var folder = agentFolder(agent);
    var name = uniqueName(folder, fileName(info.type, agent, info.champs, conv.ext, stemOf(data.nom)));
    var file = folder.createFile(Utilities.newBlob(conv.bytes, conv.mime, name));
    var emp = hashOf(bytes); var tous = Store.readTable('Documents');
    var d = docRow(user, agent, info.type, info.champs, name, file, emp);
    var meme = tous.filter(function (x) { return x.empreinte && x.empreinte === emp; })[0];
    var memeP = tous.filter(function (x) { return x.agent_id === agent.id && x.type === d.type && d.type !== 'autre' && x.periode && x.periode === d.periode; })[0];
    var alerte = (meme ? ' ⚠ Doublon : ce fichier est déjà classé (' + meme.nom_original + ').' : '') + (!meme && memeP ? ' ⚠ Un document du même type et de la même période est déjà classé (' + memeP.nom_original + ').' : '');
    Store.writeTable('Documents', tous.concat([d]));
    var mail = notifyAgent(user, agent, d);
    var out = pub(d); out.mail = mail; out.detecte = { type: info.type, source: info.source, avertissement: (info.avertissement + alerte).trim(), original: data.nom };
    return out;
  }
  // Prévient l'agent par e-mail qu'un nouveau document est dans son espace.
  function notifyAgent(user, agent, d) { return notifyMany(user, agent, [d]); }
  // Retourne { ok, raison } : la raison d'un e-mail non envoyé est montrée à celui qui dépose (adresse absente ou invalide, quota, refus de Google).
  function notifyMany(user, agent, docs) {
    if (!agent || !docs.length) return { ok: false, raison: 'agent introuvable' };
    if (agent.id === user.id) return { ok: false, raison: 'dépôt dans votre propre espace' };
    if (!/^\S+@\S+\.\S+$/.test(agent.email || '')) return { ok: false, raison: 'adresse e-mail absente ou invalide' };
    try {
      var noms = docs.map(function (d) { return d.nom_original; });
      MailApp.sendEmail({ to: agent.email, replyTo: user.email || undefined, subject: 'Nouveau document — ' + noms[0] + (noms.length > 1 ? ' (+' + (noms.length - 1) + ')' : ''),
        body: 'Bonjour ' + agent.nom + ',\n\n' + (noms.length > 1 ? 'Nouveaux documents dans votre espace Sijil :\n - ' + noms.join('\n - ') : 'Nouveau document dans votre espace Sijil : ' + noms[0]) + '\nDéposé par ' + user.nom + '.\n\nConnectez-vous, onglet « Mes documents », pour le télécharger.' });
      return { ok: true, raison: '' };
    } catch (e) { Logger.log('Document non notifié : ' + e.message); return { ok: false, raison: e.message }; }
  }
  // Correction après coup : type et/ou période → le fichier est renommé dans Drive.
  function update(user, id, data) {
    if (user.role === 'agent') throw httpErr_('Accès refusé', 'FORBIDDEN');
    var all = Store.readTable('Documents');
    var d = all.filter(function (x) { return x.id === id; })[0];
    if (!d || !canSee(user, d.agent_id)) throw httpErr_('Document introuvable', 'FORBIDDEN');
    var agent = Agents.get(d.agent_id);
    var type = data.type && CFG.TYPES_DOC[data.type] ? data.type : d.type;
    var f; try { f = JSON.parse(d.champs || ''); } catch (e) { f = null; }
    if (!f) f = extract(d.type, n(String(d.periode || '').replace(/\./g, '/')));
    if (data.periode !== undefined && String(data.periode).trim() !== '') f = parsePeriode(type, data.periode);
    else if (type !== d.type) f = adapt(type, f);
    var file = DriveApp.getFileById(d.file_id);
    var folder = agentFolder(agent);
    var who = whoOf(agent) + '_'; var reste = String(d.nom_original || '').replace(/\.[a-z0-9]{1,8}$/i, '');
    var name = fileName(type, agent, f, extOf(d.nom_original), reste.indexOf(who) === 0 ? reste.slice(who.length) : stemOf(reste));
    if (name !== d.nom_original) { name = uniqueName(folder, name); file.setName(name); }
    d.type = type; d.code = CODES[type]; d.periode = periodeOf(type, f); d.champs = JSON.stringify(f); d.nom_original = name; d.titre = name.replace(/\.[a-z0-9]{1,8}$/i, '');
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
  // L'agent a ouvert « Mes documents » : plus rien n'est « nouveau » pour lui (enregistré côté serveur, donc valable sur tous ses appareils).
  function marquerLus(user) {
    var all = Store.readTable('Documents'); var n = 0;
    all.forEach(function (d) { if (d.agent_id === user.id && d.nouveau === '1') { d.nouveau = ''; n += 1; } });
    if (n) Store.writeTable('Documents', all);
    return { lus: n };
  }
  function nouveaux(user) { return Store.readTable('Documents').filter(function (d) { return d.agent_id === user.id && d.nouveau === '1'; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 20).map(function (d) { return { date: d.date, nom: d.nom_original || d.titre }; }); }
  function count(agentId) { return Store.readTable('Documents').filter(function (d) { return d.agent_id === agentId; }).length; }
  // Vidage : corbeille de tous les fichiers déposés (rangés et en attente de classement).
  function purgeFiles() {
    Store.readTable('Documents').forEach(function (d) { try { DriveApp.getFileById(d.file_id).setTrashed(true); } catch (e) { /* ignore */ } });
    Store.readTable('Depots').forEach(function (d) { try { DriveApp.getFileById(d.file_id).setTrashed(true); } catch (e) { /* ignore */ } });
  }

  // ----- dépôt en vrac : analyse, vérification, puis envoi vers l'espace de chaque agent -----
  function visibles(user) { return Agents.visibleTo(user).filter(function (a) { return Agents.isPerson(a) && a.type !== 'vehicule'; }); }
  function champsOf(r) { try { return merge(JSON.parse(r.champs || '{}'), {}); } catch (e) { return merge({}, {}); } }
  // Doublons : même fichier (empreinte identique) déjà classé ou déjà dans la liste = « exact » ; même agent, même type, même période = « periode ».
  function ctxDepots() { return { docs: Store.readTable('Documents'), rows: Store.readTable('Depots') }; }
  function doublonsOf(r, ctx, byId) {
    var out = [];
    if (r.empreinte) {
      var d = ctx.docs.filter(function (x) { return x.empreinte && x.empreinte === r.empreinte; })[0];
      if (d) out.push({ niveau: 'exact', message: 'Fichier identique déjà classé' + (byId[d.agent_id] ? ' chez ' + byId[d.agent_id].nom : '') + ' : ' + (byId[d.agent_id] ? d.nom_original : '') });
      var q = ctx.rows.filter(function (x) { return x.id !== r.id && x.empreinte === r.empreinte; })[0];
      if (q) out.push({ niveau: 'exact', message: 'Fichier identique déjà dans la liste : ' + q.nom_original });
    }
    if (r.agent_id && r.type !== 'autre') {
      var per = periodeOf(r.type, champsOf(r));
      if (per) {
        var m = ctx.docs.filter(function (x) { return x.agent_id === r.agent_id && x.type === r.type && x.periode === per; })[0];
        if (m) out.push({ niveau: 'periode', message: 'Un document du même type et de la même période est déjà classé : ' + m.nom_original });
        var p = ctx.rows.filter(function (x) { return x.id !== r.id && x.agent_id === r.agent_id && x.type === r.type && periodeOf(x.type, champsOf(x)) === per; })[0];
        if (p) out.push({ niveau: 'periode', message: 'Un document du même type et de la même période est déjà dans la liste : ' + p.nom_original });
      }
    }
    return out;
  }
  function depotPub(r, byId, ctx) {
    var f = champsOf(r); var a = byId[r.agent_id] || null; var ids = []; try { ids = JSON.parse(r.candidats || '[]'); } catch (e) { ids = []; }
    var manque = missing(r.type, f); var ext = r.ext; var dbl = doublonsOf(r, ctx || ctxDepots(), byId);
    return { id: r.id, nom_original: r.nom_original, agent_id: r.agent_id, agent_nom: a ? a.nom : '', type: r.type, type_label: CFG.TYPES_DOC[r.type] || r.type, champs: f,
      nom_final: r.nom_force ? r.nom_force + (ext ? '.' + ext : '') : (a ? fileName(r.type, a, f, ext, stemOf(r.nom_original)) : ''), force: !!r.nom_force,
      avertissement: r.avert, source: r.source, candidats: ids.map(function (id) { return byId[id] ? { id: id, nom: byId[id].nom } : null; }).filter(Boolean),
      manque: manque, pret: !!a && !manque.length, date_depot: r.date_depot, doublons: dbl, doublon_exact: dbl.some(function (x) { return x.niveau === 'exact'; }) };
  }
  function depotRows(user) {
    var rows = Store.readTable('Depots');
    return user.role === 'admin' ? rows : rows.filter(function (r) { return r.depose_id === user.id; });
  }
  function depotList(user) {
    if (user.role === 'agent') throw httpErr_('Accès refusé', 'FORBIDDEN');
    var by = {}; visibles(user).forEach(function (a) { by[a.id] = a; });
    var ctx = ctxDepots();
    return depotRows(user).sort(function (a, b) { return a.date_depot < b.date_depot ? -1 : 1; }).map(function (r) { return depotPub(r, by, ctx); });
  }
  function depotAdd(user, data) {
    if (user.role === 'agent') throw httpErr_('Accès refusé', 'FORBIDDEN');
    var bytes = readBytes(data); var agents = visibles(user); var forced = null;
    if (data.agent_id) { forced = agents.filter(function (a) { return a.id === data.agent_id; })[0]; if (!forced) throw httpErr_("Cet agent n'est pas dans votre groupe", 'FORBIDDEN'); }
    var chosen = CFG.TYPES_DOC[data.type] ? data.type : '';
    var info = detect(data, chosen, forced, agents);
    var agent = forced || (info.candidats.length === 1 ? info.candidats[0] : null);
    if (!agent && info.candidats.length > 1) info.avertissement = (info.avertissement + ' Plusieurs agents possibles : choisissez.').trim();
    if (!agent && !info.candidats.length) info.avertissement = (info.avertissement + ' Agent non reconnu : choisissez-le.').trim();
    var conv = maybePdf(data, bytes);
    var file = stagingFolder().createFile(Utilities.newBlob(conv.bytes, conv.mime, String(data.nom)));
    var row = { id: newId_('Q'), nom_original: String(data.nom).slice(0, 120), file_id: file.getId(), ext: conv.ext, agent_id: agent ? agent.id : '', type: info.type, champs: JSON.stringify(info.champs), nom_force: '',
      source: info.source, avert: info.avertissement + (conv.converti ? ' (converti en PDF)' : '') + (conv.echec ? ' ⚠ Conversion PDF impossible (' + conv.echec + ') : fichier conservé tel quel.' : ''), depose_par: user.nom, depose_id: user.id, date_depot: new Date().toISOString(), candidats: JSON.stringify(info.candidats.map(function (a) { return a.id; })), empreinte: hashOf(bytes) };
    Store.writeTable('Depots', Store.readTable('Depots').concat([row]));
    var by = {}; agents.forEach(function (a) { by[a.id] = a; });
    return depotPub(row, by);
  }
  function depotUpdate(user, id, patch) {
    if (user.role === 'agent') throw httpErr_('Accès refusé', 'FORBIDDEN');
    patch = patch || {};
    var all = Store.readTable('Depots'); var r = depotRows(user).filter(function (x) { return x.id === id; })[0];
    if (!r) throw httpErr_('Document en attente introuvable');
    r = all.filter(function (x) { return x.id === id; })[0]; var agents = visibles(user);
    if (patch.agent_id !== undefined) { if (patch.agent_id && !agents.some(function (a) { return a.id === patch.agent_id; })) throw httpErr_("Cet agent n'est pas dans votre groupe", 'FORBIDDEN'); r.agent_id = patch.agent_id; }
    if (patch.type !== undefined) { if (!CFG.TYPES_DOC[patch.type]) throw httpErr_('Type de document invalide'); if (patch.type !== r.type) { r.champs = JSON.stringify(adapt(patch.type, champsOf(r))); r.type = patch.type; } }
    if (patch.champs) {
      var f = champsOf(r); var p = patch.champs;
      if (p.date !== undefined) { if (p.date && !Dates.isDate(p.date)) throw httpErr_('Date invalide'); f.date = p.date; }
      ['mois', 'mois2'].forEach(function (k) { if (p[k] !== undefined) { var v = String(p[k] || ''); if (v && !/^[a-z]+20\d{2}$/.test(v)) { var x = moisSeul(n(v)); if (!x) throw httpErr_('Mois invalide (ex. mars 2026)'); v = x; } f[k] = v; } });
      if (p.nss !== undefined) { var s = String(p.nss || '').replace(/\s+/g, ''); if (s && !/^\d{6,14}$/.test(s)) throw httpErr_('N° de sécurité sociale : chiffres uniquement'); f.nss = s; }
      r.champs = JSON.stringify(f);
    }
    if (patch.nom_force !== undefined) r.nom_force = String(patch.nom_force || '').replace(/\.[a-z0-9]{1,8}$/i, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
    Store.writeTable('Depots', all);
    var by = {}; agents.forEach(function (a) { by[a.id] = a; });
    return depotPub(r, by);
  }
  // Après vérification : chaque fichier est renommé et rangé dans le dossier de son agent, qui est prévenu (un e-mail par agent).
  function depotValider(user, ids, forcer) {
    if (user.role === 'agent') throw httpErr_('Accès refusé', 'FORBIDDEN');
    var all = Store.readTable('Depots'); var mine = depotRows(user); var agents = visibles(user); var by = {}; agents.forEach(function (a) { by[a.id] = a; });
    var docs = []; var done = {}; var erreurs = []; var parAgent = {}; var ctx = ctxDepots();
    (ids || []).filter(function (x, i, a) { return a.indexOf(x) === i; }).forEach(function (id) {
      var r = mine.filter(function (x) { return x.id === id; })[0]; if (!r) return;
      var pubr = depotPub(r, by, ctx);
      if (pubr.doublon_exact && !forcer) { erreurs.push({ id: id, nom: r.nom_original, message: 'Doublon exact : confirmez l\'envoi' }); return; }
      if (!pubr.pret) { erreurs.push({ id: id, nom: r.nom_original, message: !by[r.agent_id] ? 'Agent à choisir' : 'À compléter : ' + pubr.manque.join(', ') }); return; }
      try {
        var agent = by[r.agent_id]; var folder = agentFolder(agent); var file = DriveApp.getFileById(r.file_id);
        var name = uniqueName(folder, pubr.nom_final); file.setName(name); file.moveTo(folder);
        var d = docRow(user, agent, r.type, champsOf(r), name, file, r.empreinte); docs.push(d); done[id] = true;
        (parAgent[agent.id] = parAgent[agent.id] || { agent: agent, docs: [] }).docs.push(d);
      } catch (e) { erreurs.push({ id: id, nom: r.nom_original, message: e.message }); }
    });
    if (docs.length) Store.writeTable('Documents', Store.readTable('Documents').concat(docs));
    Store.writeTable('Depots', all.filter(function (x) { return !done[x.id]; }));
    var mails = Object.keys(parAgent).map(function (k) { var r = notifyMany(user, parAgent[k].agent, parAgent[k].docs); return { agent: parAgent[k].agent.nom, ok: r.ok, raison: r.raison }; });
    return { valides: docs.length, erreurs: erreurs, noms: docs.map(function (d) { return d.nom_original; }), mails: mails };
  }
  // Aperçu d'un fichier en attente (avant envoi à l'agent).
  function depotApercu(user, id) {
    if (user.role === 'agent') throw httpErr_('Accès refusé', 'FORBIDDEN');
    var r = depotRows(user).filter(function (x) { return x.id === id; })[0];
    if (!r) throw httpErr_('Document en attente introuvable');
    var blob = DriveApp.getFileById(r.file_id).getBlob();
    return { nom: r.nom_original, mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
  }
  function depotRejeter(user, ids) {
    if (user.role === 'agent') throw httpErr_('Accès refusé', 'FORBIDDEN');
    var mine = depotRows(user); var gone = {};
    (ids || []).forEach(function (id) { var r = mine.filter(function (x) { return x.id === id; })[0]; if (r) { try { DriveApp.getFileById(r.file_id).setTrashed(true); } catch (e) { /* déjà supprimé */ } gone[id] = true; } });
    Store.writeTable('Depots', Store.readTable('Depots').filter(function (x) { return !gone[x.id]; }));
    return { retires: Object.keys(gone).length };
  }
  return { marquerLus: marquerLus, nouveaux: nouveaux, list: list, upload: upload, update: update, download: download, remove: remove, count: count, purgeFiles: purgeFiles, analyse: function (t) { var ty = detectType(t); return { type: ty, champs: ty ? extract(ty, t) : null }; }, fileName: fileName, nameFor: nameFor, detectType: detectType, extract: extract,
    imageToPdf: imageToPdf, depotAdd: depotAdd, depotList: depotList, depotUpdate: depotUpdate, depotValider: depotValider, depotApercu: depotApercu, depotRejeter: depotRejeter};
})();
