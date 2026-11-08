/**
 * _autodetect-renommage — reconnaissance et renommage de documents (PDF, images) : type, agent, dates, nom final.
 * Extrait de Sijil (Documents.gs, v3.43.0). Sans dépendance : navigateur, Node et Apps Script (fichier unique).
 *
 *   var r = AutoDetectDoc.detecter({ nom: 'titre de conge DUPONT Jean 2026-10-25.pdf' }, { agents: [{ id: 'A1', nom: 'DUPONT Jean' }] });
 *   // r = { type, source, champs: { date, mois, mois2, nss }, avertissement, candidats: [agents], flou }
 *   AutoDetectDoc.nomFinal(r.type, r.candidats[0], r.champs, 'pdf')   // → « TC_DUPONT_Jean_2026-10-25.pdf »
 *
 * Types : titre_conge, fiche_emolument, contrat, attestation_cnas, maj_cnas, attestation_travail, certificat_travail, attestation_emoluments, ats, autre.
 * Le contenu d'un scan est lu par une fonction FOURNIE par le projet (options.ocr(donnees) → texte) : ce module n'en impose aucune.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.AutoDetectDoc = api;
}(typeof self !== 'undefined' ? self : this, function () {
  function erreur_(m) { return new Error(m); }
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function isDate(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false; var d = new Date(s + 'T00:00:00Z'); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; }
  var _today = null;
  function today() { return _today || new Date().toISOString().slice(0, 10); }
  var Format = { norm: norm };
  var CODES = { titre_conge: 'TC', fiche_emolument: 'FDP', contrat: 'CONTRAT', attestation_cnas: 'ACNAS', maj_cnas: 'MAJCNAS', attestation_travail: 'AT', certificat_travail: 'CT', attestation_emoluments: 'AE', ats: 'ATS', autre: 'DOC' };
  var MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  var MOIS_AFF = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
  // Noms de mois acceptés : complets ou abrégés (janv, fevr, avr, juil, sept, dec…), année sur 4 ou 2 chiffres (« FEVR 26 » = février 2026).
  var MOIS_RE = '\\b(janvier|janv|jan|fevrier|fevr|fev|mars|mar|avril|avr|mai|juin|juillet|juil|aout|aou|septembre|sept|sep|octobre|oct|novembre|nov|decembre|dec)\\b\\.?';
  var ANNEE_RE = '(20\\d{2}|\\d{2})(?!\\d)';
  var ALIAS = { jan: 1, janv: 1, janvier: 1, fev: 2, fevr: 2, fevrier: 2, mar: 3, mars: 3, avr: 4, avril: 4, mai: 5, juin: 6, juil: 7, juillet: 7, aou: 8, aout: 8, sep: 9, sept: 9, septembre: 9, oct: 10, octobre: 10, nov: 11, novembre: 11, dec: 12, decembre: 12 };
  function an4(y) { return String(y).length === 2 ? '20' + y : String(y); }
  // Champs obligatoires pour nommer chaque type ; « autre » n'en demande aucun.
  var REQUIS = { titre_conge: ['date'], fiche_emolument: ['mois'], contrat: ['date'], attestation_cnas: ['date'], maj_cnas: ['mois', 'mois2'], attestation_travail: ['date'], certificat_travail: ['date'], attestation_emoluments: ['mois', 'mois2'], ats: ['date'], autre: [] };
  function n(s) { return norm(s); }
  function frDot(iso) { return iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : ''; }
  function isoOf(d, m, y) { var iso = y + '-' + (Number(m) < 10 ? '0' : '') + Number(m) + '-' + (Number(d) < 10 ? '0' : '') + Number(d); return isDate(iso) ? iso : ''; }
  function moisKey(m, y) { return MOIS[Number(m) - 1] + y; }
  function moisLabel(k) { var m = /^([a-z]+)(20\d{2})$/.exec(String(k || '')); var i = m ? MOIS.indexOf(m[1]) : -1; return i < 0 ? '' : MOIS_AFF[i] + m[2]; }
  // Toutes les dates du texte normalisé, dans l'ordre : jj/mm/aaaa, jj-mm-aaaa, aaaa-mm-jj, « 14 fevrier 2026 ».
  function allDates(t) {
    var out = []; var re = new RegExp('(\\d{1,2})\\s*[\\/.\\-]\\s*(\\d{1,2})\\s*[\\/.\\-]\\s*(20\\d{2})|(20\\d{2})-(\\d{2})-(\\d{2})|(\\d{1,2})(?:er)?\\s+' + MOIS_RE + '\\s+(20\\d{2})', 'g'); var m;
    while ((m = re.exec(t))) {
      var iso = m[1] ? isoOf(m[1], m[2], m[3]) : m[4] ? isoOf(m[6], m[5], m[4]) : isoOf(m[7], ALIAS[m[8]], an4(m[9]));
      if (iso) out.push({ iso: iso, i: m.index, len: m[0].length });
    }
    return out;
  }
  function dateAfter(t, re) { var m = re.exec(t); if (!m) return ''; var rest = t.slice(m.index + m[0].length, m.index + m[0].length + 40); var d = allDates(rest)[0]; return d && d.i < 25 ? d.iso : ''; }
  function dateEmission(t) {
    return dateAfter(t, /fait a [a-z ]{2,30},? le\s*:?\s*/) || dateAfter(t, /(delivree? le|etablie? le|edition le|date d.?edition|alger,? le)\s*:?\s*/) || dateAfter(t, /\ble\s*:?\s*/);
  }
  function moisOfIso(iso) { return iso ? moisKey(iso.slice(5, 7), iso.slice(0, 4)) : ''; }
  // Période de mois couverte : « du 01/01/2026 au 31/03/2026 », « de janvier 2026 à mars 2026 », « janv à mars 26 », « 01/2026 à 03/2026 ».
  function mk(nom, an) { return MOIS[ALIAS[nom] - 1] + an4(an); }
  function moisRange(t) {
    var ds = allDates(t);
    for (var i = 0; i + 1 < ds.length; i += 1) {
      var between = t.slice(ds[i].i + ds[i].len, ds[i + 1].i);
      if (/^\s*(au|a|-|jusqu\s?au|jusqu a)\s*$/.test(between) && ds[i + 1].iso >= ds[i].iso) return { mois: moisOfIso(ds[i].iso), mois2: moisOfIso(ds[i + 1].iso) };
    }
    var r = new RegExp(MOIS_RE + '\\s*(?:' + ANNEE_RE + ')?\\s*(?:a|au|-|jusqu a|jusqu au|et)\\s*' + MOIS_RE + '\\s*' + ANNEE_RE).exec(t);
    if (r) return { mois: mk(r[1], r[2] || r[4]), mois2: mk(r[3], r[4]) };
    var s2 = /\b(0?[1-9]|1[0-2])\s*[\/.\-]\s*(20\d{2})\s*(?:a|au|-)\s*(0?[1-9]|1[0-2])\s*[\/.\-]\s*(20\d{2})\b/.exec(t);
    if (s2) return { mois: moisKey(s2[1], s2[2]), mois2: moisKey(s2[3], s2[4]) };
    var one = moisSeul(t);
    return one ? { mois: one, mois2: one } : { mois: '', mois2: '' };
  }
  // Un seul mois : d'abord près d'un mot-clé (« période », « mois de »), sinon le plus récent trouvé ; abréviations et années sur 2 chiffres acceptées.
  function moisSeul(t) {
    var cle = new RegExp('(?:periode|mois d[eu]|mois|paie d[eu]|au titre d[eu])[^a-z0-9]{0,8}(?:d[eu]\\s*)?' + MOIS_RE + '\\s*[-_/.]?\\s*' + ANNEE_RE).exec(t);
    if (cle) return mk(cle[1], cle[2]);
    var all = []; var re = new RegExp(MOIS_RE + '\\s*(?:d[eu]\\s*)?[-_/.]?\\s*' + ANNEE_RE, 'g'); var m;
    while ((m = re.exec(t))) all.push(mk(m[1], m[2]));
    var sansDates = t.replace(/\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*20\d{2}/g, ' ');
    var re2 = /\b(0?[1-9]|1[0-2])\s*[\/.\-]\s*(20\d{2})\b/g; while ((m = re2.exec(sansDates))) all.push(moisKey(m[1], m[2]));
    if (!all.length) { var d = allDates(t)[0]; return d ? moisOfIso(d.iso) : ''; }
    var rang = function (k) { var x = /^([a-z]+)(20\d{2})$/.exec(k); return Number(x[2]) * 12 + MOIS.indexOf(x[1]); };
    return all.sort(function (p, q) { return rang(q) - rang(p); })[0]; // le plus récent
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
    if (/attestations?\s*(?:d|des|de)?[^a-z]{0,3}emoluments?|attestations?\s*de\s*salaire/.test(t)) return 'attestation_emoluments';
    if (/fiche\s*de\s*paie|bulletin\s*de\s*(?:paie|salaire)|fiche\s*de\s*salaire|fiche\s*d.?emoluments?|\bfdp\b/.test(t)) return 'fiche_emolument';
    if (/certificat\s*(?:de\s*)?travail/.test(t)) return 'certificat_travail';
    if (/attestation\s*(?:de\s*)?travail/.test(t)) return 'attestation_travail';
    if (/contrat de travail|contrat a duree|\bcontrat\b/.test(t)) return 'contrat';
    // Repli pour une lecture imparfaite d'un scan : « Certiticat de Travai1 », ou les phrases types d'un certificat de travail.
    if (/certi\w{2,8}\s*(?:de\s*)?trav\w{0,5}\b/.test(t) || (/certifie par la presente/.test(t) && /(?:a ete employe|est ce depuis|employe au sein)/.test(t))) return 'certificat_travail';
    return '';
  }
  // Champs utiles au type : { date, mois, mois2, nss } (chaînes vides si non lus).
  function extract(type, t) {
    var f = { date: '', mois: '', mois2: '', nss: '' }; var first = allDates(t)[0]; first = first ? first.iso : '';
    if (type === 'titre_conge') f.date = dateAfter(t, /(a compter du|a partir du|depart le|debut(?: du conge)?\s*:?|du)\s*/) || first;
    else if (type === 'contrat') f.date = dateAfter(t, /(a compter du|prenant effet le|debut(?:ant)? le|date d.?effet|effet le|du)\s*/) || first;
    else if (type === 'attestation_travail' || type === 'certificat_travail') f.date = dateEmission(t) || first;
    else if (type === 'attestation_cnas') { f.date = dateEmission(t) || first; f.nss = nssOf(t); }
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
    var toks = noAccents((a && a.nom) || 'agent').trim().split(/\s+/).filter(Boolean);
    var nom = (toks.shift() || 'AGENT').toUpperCase();
    var pre = toks.map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1).toLowerCase(); }).join('-');
    return (nom + (pre ? '_' + pre : '')).replace(/[^A-Za-z0-9_-]/g, '');
  }
  function stemOf(nom) { return String(nom || '').replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9À-ÿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }
  function extOf(nom) { return ((/\.([a-z0-9]{1,8})$/i.exec(String(nom || '')) || [])[1] || '').toLowerCase(); }
  function nameFor(type, agent, f, stem) {
    var who = whoOf(agent); var auj = today();
    var date = f.date || auj; var m1 = moisLabel(f.mois) || moisLabel(moisOfIso(auj)); var m2 = moisLabel(f.mois2) || m1;
    switch (type) {
      case 'titre_conge': return 'TC_' + who + '_' + date;
      case 'fiche_emolument': return who + '_FDP_' + m1;
      case 'contrat': return who + '_' + date + '_Contrat';
      case 'attestation_cnas': return who + '_AttestationCNAS_' + (f.nss ? f.nss + '_' : '') + date;
      case 'maj_cnas': return who + '_MAJCNAS_' + m1 + '_' + m2;
      case 'attestation_travail': return who + '_AttestationTravail_' + date;
      case 'certificat_travail': return who + '_CertificatTravail_' + date;
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
  function parsePeriode(type, text) {
    var f = extract(type, n(text));
    if (type === 'fiche_emolument' && !f.mois) throw erreur_('Période : indiquez un mois et une année (ex. mars 2026 ou 03/2026)');
    if ((type === 'maj_cnas' || type === 'attestation_emoluments') && !(f.mois && f.mois2)) throw erreur_('Période : indiquez deux mois (ex. janvier 2026 à mars 2026)');
    if (REQUIS[type] && REQUIS[type].indexOf('date') >= 0 && !f.date) throw erreur_('Date : jj/mm/aaaa');
    return f;
  }
  function findAgents(t, agents) {
    var words = {}; t.split(/[^a-z0-9]+/).forEach(function (w) { if (w) words[w] = true; });
    var scored = agents.map(function (a) {
      var toks = n(a.nom).split(/[^a-z0-9]+/).filter(function (x) { return x.length >= 2; });
      var hit = toks.filter(function (x) { return words[x]; }).length;
      return { a: a, toks: toks.length, hit: hit };
    }).filter(function (s) { return s.hit > 0 && s.hit === s.toks && s.toks >= 2; }); // nom ET prénom présents
    var partial = agents.filter(function (a) { var toks = n(a.nom).split(/[^a-z0-9]+/).filter(Boolean); return toks.length >= 2 && toks.some(function (x) { return x.length >= 4 && words[x]; }) && !scored.some(function (s) { return s.a.id === a.id; }); });
    var res = scored.length ? scored.map(function (s) { return s.a; }) : partial;
    if (res.length) return res;
    // Aucun nom exact : noms d'orthographe proche (une faute de frappe dans le nom du fichier : BEHEIN / BELHEINE) proposés à vérifier.
    var mots = Object.keys(words).filter(function (w) { return w.length >= 4 && !/^\d+$/.test(w); });
    var flou = agents.filter(function (a) { return n(a.nom).split(' ').some(function (tok) { return tok.length >= 4 && mots.some(function (w) { return distance(tok, w) <= (tok.length >= 7 ? 2 : 1) && w !== tok; }); }); });
    flou.flou = true; return flou;
  }
  // « Nom : DUPONT Prénom : Marc Antoine » (certificats, attestations) : nom lu dans le contenu, montré quand l'agent n'est pas reconnu.
  function nomLu(t) {
    var m = /\bnom\s*:?\s*([a-z'-]+(?: [a-z'-]+){0,2}?)\s+prenoms?\s*:?\s*([a-z'-]+(?: [a-z'-]+){0,3}?)\s+(?:date|lieu|ne le|nee le|n )/.exec(t);
    if (!m) return '';
    var cap = function (s) { return s.split(' ').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); };
    return m[1].toUpperCase() + ' ' + cap(m[2]);
  }
  function distance(a, b) {
    var prev = []; for (var j = 0; j <= b.length; j += 1) prev.push(j);
    for (var i = 1; i <= a.length; i += 1) { var cur = [i]; for (var k = 1; k <= b.length; k += 1) cur.push(Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1))); prev = cur; }
    return prev[b.length];
  }

  // Type et champs d'un fichier : nom du fichier d'abord, contenu (OCR) seulement si nécessaire.
  /**
   * Reconnaît le type, l'agent et les dates d'un fichier : d'abord par son NOM, puis (si besoin) par son CONTENU.
   * data : { nom, ... } (transmis tel quel à options.ocr) ; options : { type (choisi), agent (imposé), agents (liste à chercher), ocr: function (data) -> texte, aujourdhui: 'AAAA-MM-JJ' }
   */
  function detecter(data, options) {
    options = options || {}; var chosen = CODES[options.type] ? options.type : ''; var agent = options.agent || null; var agents = options.agents || [];
    if (options.aujourdhui) _today = options.aujourdhui;
    var base = String(data.nom || '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
    var tn = n(base); var type = chosen || detectType(tn); var source = chosen ? 'choix' : (type ? 'nom' : '');
    var f = type ? extract(type, tn) : { date: '', mois: '', mois2: '', nss: '' };
    var cands = agent ? [agent] : findAgents(tn, agents); var avert = [];
    var besoin = !type || missing(type, f).length > 0 || (!agent && cands.length !== 1);
    if (besoin) {
      var text = '';
      if (typeof options.ocr === 'function') { try { text = n(options.ocr(data) || '').slice(0, 12000); } catch (e) { avert.push('Lecture automatique impossible (' + e.message + ').'); } }
      if (!text && !avert.length && options.ocr && /\.(pdf|png|jpe?g|gif|bmp|tiff?)$/i.test(String(data.nom || ''))) avert.push('Aucun texte lu dans le document (scan trop pâle ?) : renseignez le type et l\'agent.');
      if (text) {
        if (!type) { var tt = detectType(text); if (tt) { type = tt; source = 'contenu'; } }
        if (type) { var avant = merge(f, {}); f = merge(f, extract(type, text)); if (['date', 'mois', 'mois2'].some(function (k) { return f[k] && !avant[k]; })) avert.push('Dates lues dans le contenu du document : à vérifier.'); }
        if (!agent && cands.length !== 1) { var byText = findAgents(text, agents); if (byText.length) cands = byText; }
        if (!agent && !cands.length) { var lu = nomLu(text); if (lu) avert.push('Nom lu dans le document : ' + lu + ' (aucun agent de ce nom : choisissez-le).'); }
        if (agent) {
          var autre = agents.filter(function (x) { return x.id !== agent.id && n(x.nom).indexOf(' ') > 0 && text.indexOf(n(x.nom)) >= 0; })[0];
          if (autre && text.indexOf(n(agent.nom)) < 0) avert.push('Ce document semble concerner ' + autre.nom + ', pas ' + agent.nom + '.');
        }
      }
    }
    if (!type) { type = 'autre'; source = 'defaut'; avert.push('Type non reconnu : classé « Autre » (corrigeable).'); }
    var manque = missing(type, f);
    if (manque.length) avert.push('À compléter : ' + manque.map(function (k) { return { date: 'date', mois: 'mois', mois2: 'mois de fin' }[k] || k; }).join(', ') + '.');
    if (type === 'attestation_cnas' && !f.nss) avert.push('N° de sécurité sociale non lu : à compléter si besoin.');
    return { type: type, source: source, champs: f, avertissement: avert.join(' '), candidats: cands, flou: !!cands.flou };
  }
  /** Nom final du fichier (sans collision : à gérer par le projet, par ex. ajouter _2, _3). */
  function nomFinal(type, agent, champs, ext, nomOriginal) { return fileName(type, agent, champs || {}, ext, stemOf(nomOriginal)); }
  /** Ajoute _2, _3… tant que le nom existe déjà dans « existants » (tableau de noms). */
  function nomUnique(nom, existants) {
    var ext = extOf(nom); var base = ext ? nom.slice(0, -(ext.length + 1)) : nom; var k = 1; var cur = nom; var pris = {}; (existants || []).forEach(function (x) { pris[x] = true; });
    while (pris[cur]) { k += 1; cur = base + '_' + k + (ext ? '.' + ext : ''); }
    return cur;
  }

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
  function convertible(bytes) { return !!(jpegInfo(bytes) || pngInfo(bytes)); }
  return {
    CODES: CODES, REQUIS: REQUIS, detecter: detecter, nomFinal: nomFinal, nomUnique: nomUnique, norm: norm,
    detectType: detectType, extract: extract, adapt: adapt, missing: missing, merge: merge, periodeOf: periodeOf, parsePeriode: parsePeriode, findAgents: findAgents, nomLu: nomLu, dateEmission: dateEmission,
    fileName: fileName, nameFor: nameFor, whoOf: whoOf, stemOf: stemOf, extOf: extOf, moisLabel: moisLabel, moisSeul: moisSeul, moisRange: moisRange, allDates: allDates,
    imageToPdf: imageToPdf, convertible: convertible
  };
}));
