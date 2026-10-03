/**
 * Import du bordereau du contrat : lecture d'un PDF / image (OCR Google Drive), d'un Excel ou d'un CSV,
 * détection des lignes (désignation, unité, quantité, prix unitaire) et proposition de fonctions à vérifier.
 * Rien n'est enregistré ici : l'utilisateur relit et corrige avant d'ajouter les lignes au contrat.
 */
var Bordereau = (function () {
  var noAcc = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); };
  var clean = function (s) { return String(s == null ? '' : s).replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim(); };

  // Nombre au format français : « 14 000,00 », « 14.000,00 », « 1080 », « 12 500.00 ».
  function toNumber(v) {
    var s = clean(v).replace(/\s/g, '').replace(/(da|dzd|dinars?)$/i, '');
    if (!/^-?[\d.,]+$/.test(s)) return NaN;
    var dot = s.indexOf('.'); var com = s.indexOf(',');
    if (dot >= 0 && com >= 0) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (com >= 0) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    else if (dot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  // Type de colonne d'après son en-tête.
  function classify(h) {
    var t = noAcc(h);
    if (!t) return '';
    if (/position|nbre.*poste|nombre.*poste|nb.*poste/.test(t)) return 'positions';
    if (/delai|duree|mobilisation/.test(t)) return 'delai';
    if (/prix|p\.? ?u\b|unitaire|tarif/.test(t)) return 'prix';
    if (/montant|total/.test(t)) return 'montant';
    if (/nombre|nbre|\bnb\b/.test(t)) return 'nombre';
    if (/quantite|qte|\bqt\b/.test(t)) return 'quantite';
    if (/^(u\.?\/?m\.?|unite|u)$|unite/.test(t)) return 'unite';
    if (/designation|libelle|intitule|poste|fonction|description|prestation|nature|ressource/.test(t)) return 'designation';
    return '';
  }
  // Désignations de véhicules / engins (comptés en « Quantité » et pointés comme du personnel).
  var VH = /vehicule|\bvh\b|pick.?up|4 ?x ?4|camion|voiture|engin|minibus|\bbus\b|ambulance|fourgon|camionnette|\bmoto|tracteur|grue/;
  var SKIP = /^(total|montant total|sous.?total|arret|tva|ttc|t\.v\.a|net a payer|somme|fait a|lu et)/;

  function mapHeader(row) {
    var map = {}; var hits = 0;
    row.forEach(function (c, i) { var k = classify(c); if (k && map[k] === undefined) { map[k] = i; hits += 1; } });
    return map.designation !== undefined && (map.prix !== undefined || map.quantite !== undefined || map.positions !== undefined || map.nombre !== undefined) && hits >= 2 ? map : null;
  }

  function rowFromMap(cells, map) {
    var d = clean(cells[map.designation]);
    if (!/[a-zà-ÿ]{3}/i.test(d) || SKIP.test(noAcc(d))) return null;
    var num = function (k) { return map[k] === undefined ? NaN : toNumber(cells[map[k]]); };
    return { designation: d, unite: map.unite === undefined ? '' : clean(cells[map.unite]), quantite: num('quantite'), prix_unitaire: num('prix'), montant: num('montant'), positions: num('positions') > 0 ? num('positions') : num('nombre'), delai: num('delai'), mapped: true };
  }

  // Sans en-tête exploitable : première cellule « texte » = désignation, nombres qui suivent = quantité, prix, montant.
  function rowHeuristic(cells) {
    var di = -1;
    cells.forEach(function (c, i) { if (di < 0 && /[a-zà-ÿ]{3}/i.test(clean(c)) && isNaN(toNumber(c))) di = i; });
    if (di < 0) return null;
    var d = clean(cells[di]);
    if (SKIP.test(noAcc(d))) return null;
    var nums = cells.slice(di + 1).map(toNumber).filter(function (n) { return !isNaN(n); });
    if (!nums.length) return null;
    var r = { designation: d, unite: '', quantite: NaN, prix_unitaire: NaN, montant: NaN, positions: NaN, delai: NaN, mapped: false };
    var words = cells.slice(di + 1).filter(function (c) { return /^(jours?|j|mois|h|u|ens|forfait|unit[eé])$/i.test(clean(c)); })[0];
    if (words) r.unite = clean(words);
    if (nums.length >= 4) { // « 2  14 000,00  540  15 120 000,00 » : nombre × tarif × délai = montant (rôles par ordre de grandeur)
      var t = [nums[0], nums[1], nums[2]].sort(function (a, b) { return a - b; });
      if (Math.abs(t[0] * t[1] * t[2] - nums[3]) <= Math.max(1, nums[3] * 0.01)) { r.positions = t[0]; r.delai = t[1]; r.prix_unitaire = t[2]; r.montant = nums[3]; return r; }
    }
    if (nums.length >= 3 && Math.abs(nums[0] * nums[1] - nums[2]) <= Math.max(1, nums[2] * 0.01)) { r.quantite = nums[0]; r.prix_unitaire = nums[1]; r.montant = nums[2]; }
    else if (nums.length >= 2) { r.quantite = nums[0]; r.prix_unitaire = nums[1]; }
    else r.prix_unitaire = nums[0];
    return r;
  }

  // rows : tableau de lignes (tableaux de cellules) -> lignes détectées
  function parseRows(rows) {
    var out = []; var map = null;
    rows.forEach(function (cells) {
      cells = cells.map(clean);
      if (!cells.some(Boolean)) return;
      var header = mapHeader(cells);
      if (header) { map = header; return; }
      var r = map ? rowFromMap(cells, map) : rowHeuristic(cells);
      if (!r && map) r = null;
      if (r) out.push(r);
    });
    return out;
  }

  // Texte brut (une ligne par ligne) : « Technicien électricien 2 14 000,00 540 15 120 000,00 »
  var NUM = /\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g;
  function splitLine(l) {
    l = String(l).replace(/[\u00a0\u202f]/g, ' ').trim().replace(/^\d{1,3}\s*[.)-]?\s+(?=[A-Za-zÀ-ÿ])/, ''); // retire le n° de ligne
    var m = /^([A-Za-zÀ-ÿ][^\d]*?)\s+(\d[\s\S]*)$/.exec(l);
    if (!m) return null;
    var unit = (/\b(jours?|mois|forfait|ens|u)\b/i.exec(m[2]) || [])[1];
    return [clean(m[1])].concat(unit ? [unit] : []).concat(m[2].match(NUM) || []);
  }
  function parseText(text) {
    var rows = String(text || '').split(/\r?\n/).map(function (l) {
      var cells = l.split(/\t| {3,}/).map(clean).filter(Boolean);
      return cells.length >= 3 ? cells : (splitLine(l) || []);
    });
    return parseRows(rows.filter(function (r) { return r.length; })).filter(function (l) { return l.montant > 0; });
  }

  function decodeEntities(s) {
    return s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(Number(n)); }).replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); }).replace(/&amp;/g, '&');
  }
  function htmlRows(html) {
    var rows = [];
    (String(html || '').match(/<tr[\s\S]*?<\/tr>/gi) || []).forEach(function (tr) {
      var cells = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(function (c) { return clean(decodeEntities(c.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))); });
      if (cells.some(Boolean)) rows.push(cells);
    });
    return rows;
  }

  // Délai de mobilisation / durée en jours mentionné dans le document (« délai : 540 jours »).
  function detectDelai(text) {
    var m = /(?:d[ée]lai|dur[ée]e|mobilisation)[^\d]{0,40}(\d{2,4})\s*(?:jours?|j\b)/i.exec(String(text || ''));
    return m ? Number(m[1]) : 0;
  }

  // ---------- lecture « par contraintes » : indépendante de la mise en page de l'OCR ----------
  // Un scan n'est pas toujours rendu en tableau (cellules sur des lignes séparées, colonnes les unes après les autres...).
  // On cherche donc dans tout le texte les groupes de nombres qui vérifient  nombre × tarif × délai = montant,
  // puis on associe à chacun la désignation qui le précède (ou, si les colonnes sont séparées, dans l'ordre).
  var HEADER_WORDS = /designation|nombre|tarif|journalier|delai|mobilisation|montant|quantite|unite|prix|total|annexe|bordereau|arrete|^contrat\b|n°|\bpage\b|hors taxes|dinars|^\(?da\)?$|^\(?jours?\)?$|^\(?ht\)?$/;
  function numberTokens(text) {
    var out = []; var re = new RegExp(NUM.source, 'g'); var m;
    while ((m = re.exec(text)) !== null) { var v = toNumber(m[0]); if (!isNaN(v)) out.push({ pos: m.index, v: v }); }
    return out;
  }
  function designationCandidates(text) {
    var out = []; var offset = 0;
    String(text).split('\n').forEach(function (line, idx) {
      var t = clean(line.replace(new RegExp(NUM.source, 'g'), ' ').replace(/\b(jours?|da|dzd)\b/ig, ' ')).replace(/^[-–.:()|\s]+|[-–.:()|\s]+$/g, '');
      var letters = (t.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      if (letters >= 3 && !HEADER_WORDS.test(noAcc(t))) out.push({ pos: offset, text: t, line: idx });
      offset += line.length + 1;
    });
    return out;
  }
  function solveText(text) {
    var tokens = numberTokens(text);
    var small = tokens.filter(function (t) { return t.v >= 1 && t.v <= 200 && t.v % 1 === 0; });
    var days = tokens.filter(function (t) { return t.v >= 20 && t.v <= 3650 && t.v % 1 === 0; });
    var rows = [];
    tokens.forEach(function (m) {
      if (!(m.v >= 1000)) return;
      var best = null;
      small.forEach(function (n) {
        if (n.pos === m.pos) return;
        days.forEach(function (d) {
          if (d.pos === n.pos || d.pos === m.pos) return;
          var p = m.v / (n.v * d.v);
          if (p < 100) return;
          // plusieurs jetons peuvent avoir la même valeur (deux lignes au même tarif) : on garde la combinaison la plus compacte
          tokens.forEach(function (pt) {
            if (pt.pos === m.pos || pt.pos === n.pos || pt.pos === d.pos || Math.abs(pt.v - p) >= 0.01) return;
            var ps = [n.pos, d.pos, pt.pos, m.pos]; var span = Math.max.apply(null, ps) - Math.min.apply(null, ps);
            if (!best || span < best.span) best = { n: n, d: d, p: pt, m: m, span: span };
          });
        });
      });
      if (best) rows.push(best);
    });
    rows.sort(function (a, b) { return a.m.pos - b.m.pos; });
    if (!rows.length) return [];
    var firstPos = function (r) { return Math.min(r.n.pos, r.d.pos, r.p.pos, r.m.pos); };
    var lastPos = function (r) { return Math.max(r.n.pos, r.d.pos, r.p.pos, r.m.pos); };
    var cands = designationCandidates(text);
    var interleaved = rows.length === 1 || rows.slice(1).every(function (r, i) { return cands.some(function (c) { return c.pos > lastPos(rows[i]) && c.pos < firstPos(r); }); });
    var names = [];
    if (interleaved) {
      rows.forEach(function (r, i) {
        var gap = cands.filter(function (c) { return c.pos > (i ? lastPos(rows[i - 1]) : -1) && c.pos < firstPos(r); });
        var k = gap.length - 1; var name = k >= 0 ? gap[k].text : '';
        while (k > 0 && /^[a-zà-ÿ]/.test(name) && gap[k - 1].line === gap[k].line - 1) { k -= 1; name = gap[k].text + ' ' + name; } // désignation coupée sur 2 lignes
        names.push(name);
      });
    } else { // colonnes lues l'une après l'autre : les K dernières désignations avant le premier nombre, dans l'ordre
      var before = cands.filter(function (c) { return c.pos < Math.min.apply(null, rows.map(firstPos)); });
      var pick = before.slice(Math.max(0, before.length - rows.length));
      rows.forEach(function (r, i) { names.push(pick.length === rows.length ? pick[i].text : ''); });
    }
    return rows.map(function (r, i) {
      return { designation: names[i] || '(à compléter)', unite: 'Jour', quantite: NaN, prix_unitaire: r.p.v, montant: r.m.v, positions: r.n.v, delai: r.d.v, mapped: true, incertaine: !names[i] };
    });
  }

  // Lignes détectées -> propositions de fonctions du contrat.
  // « Nombre » désigne les postes ; on le vérifie avec Montant = postes × tarif × délai.
  function toFonctions(lines, delai) {
    return lines.map(function (r) {
      var d = r.delai > 0 ? r.delai : (Number(delai) > 0 ? Number(delai) : 0);
      var positions = NaN;
      if (r.positions > 0) positions = r.positions;
      else if (d > 0 && r.prix_unitaire > 0 && r.montant > 0) {
        var p = r.montant / (r.prix_unitaire * d);
        if (Math.abs(p - Math.round(p)) < 0.01 && Math.round(p) >= 1) positions = Math.round(p);
      }
      if (!(positions > 0) && r.quantite > 0) positions = d > 0 ? (r.quantite >= d ? r.quantite / d : r.quantite) : (r.quantite <= 100 ? r.quantite : NaN);
      var posOk = isFinite(positions) && positions > 0;
      var coherent = !(posOk && d > 0 && r.prix_unitaire > 0 && r.montant > 0) || Math.abs(positions * d * r.prix_unitaire - r.montant) <= Math.max(1, r.montant * 0.01);
      return {
        designation: r.designation, libelle: r.designation, nature: VH.test(noAcc(r.designation)) ? 'vehicule' : 'personne', unite: r.unite || 'Jour', positions: posOk ? Math.round(positions * 100) / 100 : 1, delai: d || '',
        quantite_contrat: posOk && d ? positions * d : '', prix_unitaire: isNaN(r.prix_unitaire) ? 0 : r.prix_unitaire, montant: isNaN(r.montant) ? '' : r.montant,
        fiable: !!(r.prix_unitaire > 0 && posOk && positions % 1 === 0 && coherent && (r.mapped || r.montant > 0) && !r.incertaine)
      };
    });
  }
  // N° de contrat lu dans le texte : « Contrat SH /SARL HORIZON SERVICES N° I/24/ DEMO-SRV/2025 » -> « I/24/DEMO-SRV/2025 ».
  function detectNumero(text) {
    var m = /contrat[^\n]{0,60}?N\s*[°ºo]\s*([A-Z0-9][A-Z0-9 /.-]{3,40})/i.exec(String(text || ''));
    return m ? clean(m[1]).replace(/\s*\/\s*/g, '/').replace(/\s+(?=[A-Z]+-)/g, '').replace(/[.\s-]+$/, '') : '';
  }
  // Parties du contrat lues dans l'en-tête : « energie du sud / Contrat SH /SARL HORIZON SERVICES N° … » -> client ENERGIE DU SUD, prestataire SARL HORIZON SERVICES.
  function detectParties(text) {
    var lines = String(text || '').split(/\r?\n/).map(clean).filter(Boolean);
    var out = { prestataire: '', client: '' };
    var legal = /\b((?:SARL|SPA|EURL|SNC|SAS|EPE|ETS)\s+[A-Z0-9][A-Z0-9&.'-]*(?:\s+[A-Z0-9][A-Z0-9&.'-]*){0,2}?)(?=\s+N\s*[°ºo]|\s*$|\s*[,;(])/i;
    var m = legal.exec(lines.filter(function (l) { return /contrat/i.test(l); })[0] || '') || legal.exec(lines.slice(0, 12).join('\n'));
    if (m) out.prestataire = clean(m[1]).toUpperCase();
    m = /^(?:client|maitre d'ouvrage|maître d'ouvrage)\s*[:\-]\s*(.{2,60})$/im.exec(lines.join('\n'));
    if (m) out.client = clean(m[1]).toUpperCase();
    else {
      var ci = -1;
      lines.forEach(function (l, i) { if (ci < 0 && /contrat/i.test(l)) ci = i; });
      var head = lines.slice(0, ci < 0 ? 4 : ci).filter(function (l) { return /^[A-Za-zÀ-ÿ'. -]{3,40}$/.test(l) && l.split(' ').length <= 3 && !/bordereau|annexe|prix|total|contrat/i.test(l); });
      if (head.length) out.client = head[head.length - 1].toUpperCase();
    }
    return out;
  }
  // Total HT annoncé (« Total (DA) en (HT) 40 500 000,00 ») pour contrôler la somme des lignes.
  function detectTotal(text) {
    var t = String(text || '');
    // « Total (DA) en (HT) 40 500 000,00 » (même ligne ou ligne suivante), sinon le montant entre parenthèses de la phrase d'arrêté
    var m = /total[^\d]{0,40}?(\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)/i.exec(t) || /\(\s*(\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d+)?)\s*(?:DA|DZD)\s*\)/i.exec(t);
    return m ? toNumber(m[1]) : NaN;
  }

  // ---------- lecture des fichiers (services Google) ----------
  function driveConvert(bytes, mime, name, targetMime) {
    var boundary = 'bnd' + Utilities.getUuid().replace(/-/g, '');
    var meta = JSON.stringify({ name: 'tmp_bordereau_' + name, mimeType: targetMime });
    var head = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + boundary + '\r\nContent-Type: ' + mime + '\r\n\r\n';
    var body = Utilities.newBlob(head).getBytes().concat(bytes).concat(Utilities.newBlob('\r\n--' + boundary + '--').getBytes());
    var res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=fr&fields=id', {
      method: 'post', contentType: 'multipart/related; boundary=' + boundary, payload: body, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) throw httpErr_('Lecture du document impossible (Drive : code ' + res.getResponseCode() + ')');
    return JSON.parse(res.getContentText()).id;
  }
  function exportText(id, mime) {
    var res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=' + encodeURIComponent(mime), { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    return res.getResponseCode() === 200 ? res.getContentText() : '';
  }
  function trash(id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* ignore */ } }

  // Retourne { rows, text } : cellules de tableau détectées et texte brut du document.
  function readFile(o) {
    var name = String(o.nom || 'bordereau'); var ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1] || '';
    ext = ext.toLowerCase();
    var bytes = Utilities.base64Decode(o.base64 || '');
    if (!bytes.length) throw httpErr_('Fichier vide');
    if (bytes.length > CFG.MAX_UPLOAD_BYTES) throw httpErr_('Fichier trop volumineux (6 Mo maximum)');
    if (ext === 'csv' || ext === 'txt') {
      var text = Utilities.newBlob(bytes).getDataAsString('UTF-8');
      var sep = text.indexOf(';') >= 0 ? ';' : text.indexOf('\t') >= 0 ? '\t' : ',';
      return { rows: text.split(/\r?\n/).map(function (l) { return l.split(sep); }), text: text };
    }
    if (ext === 'xlsx' || ext === 'xls') {
      var sid = driveConvert(bytes, o.mime || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name, 'application/vnd.google-apps.spreadsheet');
      try {
        var rows = [];
        SpreadsheetApp.openById(sid).getSheets().forEach(function (s) { if (s.getLastRow() > 0) rows = rows.concat(s.getDataRange().getValues().map(function (r) { return r.map(function (c) { return c instanceof Date ? '' : String(c); }); })); });
        return { rows: rows, text: rows.map(function (r) { return r.join(' '); }).join('\n') };
      } finally { trash(sid); }
    }
    if (['pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff'].indexOf(ext) < 0) throw httpErr_('Format non pris en charge (PDF, image, Excel ou CSV)');
    var mime = o.mime || (ext === 'pdf' ? 'application/pdf' : 'image/' + (ext === 'jpg' ? 'jpeg' : ext));
    var id = driveConvert(bytes, mime, name, 'application/vnd.google-apps.document'); // OCR Google
    try {
      return { rows: htmlRows(exportText(id, 'text/html')), text: exportText(id, 'text/plain') };
    } finally { trash(id); }
  }

  // L'OCR confond souvent « I » (lettre) et « 1 » : on rapproche le n° lu des contrats existants.
  function matchContrat(numero) {
    if (!numero) return '';
    var loose = function (x) { return String(x).toUpperCase().replace(/[IL1|]/g, 'I').replace(/[O0]/g, 'O').replace(/\s+/g, ''); };
    var found = Contrats.contrats().filter(function (c) { return loose(c.numero) === loose(numero); })[0];
    return found ? found.numero : numero;
  }
  // Texte d'un PDF / d'une image (OCR Google Drive) ; chaîne vide pour les autres formats.
  function ocrText(o) {
    var ext = ((/\.([a-z0-9]+)$/i.exec(String(o.nom || '')) || [])[1] || '').toLowerCase();
    if (['pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff'].indexOf(ext) < 0) return '';
    var bytes = Utilities.base64Decode(o.base64 || '');
    var mime = o.mime || (ext === 'pdf' ? 'application/pdf' : 'image/' + (ext === 'jpg' ? 'jpeg' : ext));
    var id = driveConvert(bytes, mime, String(o.nom || 'document'), 'application/vnd.google-apps.document');
    try { return exportText(id, 'text/plain'); } finally { trash(id); }
  }
  function analyser(o) {
    var doc = readFile(o || {});
    var lines = parseRows(doc.rows); var source = 'tableau';
    if (!lines.length) { var byLine = parseText(doc.text); var bySolver = solveText(doc.text); lines = bySolver.length >= byLine.length ? bySolver : byLine; source = 'texte'; }
    var detecte = detectDelai(doc.text);
    var existing = Contrats.fonctions().filter(function (f) { return Number(f.delai) > 0; })[0];
    var delai = Number(o.delai) > 0 ? Number(o.delai) : detecte || (existing ? Number(existing.delai) : 0);
    var fonctions = toFonctions(lines, delai);
    var somme = fonctions.reduce(function (t, f) { return t + (f.montant > 0 ? f.montant : f.positions * (f.delai || 0) * f.prix_unitaire); }, 0);
    var total = detectTotal(doc.text);
    return {
      lignes: fonctions, delai: delai, delai_detecte: detecte, source: source, numero_detecte: matchContrat(detectNumero(doc.text)), parties: detectParties(doc.text),
      total_detecte: isNaN(total) ? '' : total, total_calcule: somme, total_ok: !isNaN(total) && Math.abs(total - somme) <= Math.max(1, total * 0.001),
      apercu: String(doc.text || '').replace(/[ \t]+/g, ' ').slice(0, 2500)
    };
  }
  return { driveConvert: driveConvert, trash: trash, analyser: analyser, parseRows: parseRows, parseText: parseText, htmlRows: htmlRows, toNumber: toNumber, toFonctions: toFonctions, detectDelai: detectDelai, detectNumero: detectNumero, detectParties: detectParties, detectTotal: detectTotal, solveText: solveText, matchContrat: matchContrat, ocrText: ocrText, designationCandidates: designationCandidates, numberTokens: numberTokens };
})();
