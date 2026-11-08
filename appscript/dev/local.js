/**
 * Lecture et renommage de documents SUR LE POSTE de l'utilisateur (navigateur) : rien n'est envoyé sur Internet avant son accord.
 * S'appuie sur le moteur AutoDetectDoc (dev/autodetect-renommage.js, brique « _autodetect-renommage ») chargé juste avant ce fichier.
 *  - lire(fichier)           : texte d'un PDF (pdf.js) ou d'une image (OCR Tesseract), bibliothèques chargées à la demande ;
 *  - analyser(fichier, ...)  : type, agent, dates et nom final proposés ;
 *  - nomsUniques(lignes)     : noms finaux sans doublon dans la liste ;
 *  - zip(lignes)             : archive .zip (sans compression) des copies renommées ;
 *  - renommerSurPlace(...)   : renomme directement les fichiers dans leur dossier (Chrome / Edge), si le navigateur l'autorise.
 */
var SijilLocal = (function () {
  var LIBS = (typeof window !== 'undefined' && window.SIJIL_LIBS) || { pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', ocr: 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.5/tesseract.min.js' };
  var chargees = {};
  function script(url) { return chargees[url] || (chargees[url] = new Promise(function (ok, ko) { var s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = function () { delete chargees[url]; ko(new Error('Bibliothèque de lecture indisponible (réseau bloqué ?)')); }; document.head.appendChild(s); })); }
  function ocrImage(source) { return script(LIBS.ocr).then(function () { return Tesseract.recognize(source, 'fra', LIBS.ocrOptions || {}); }).then(function (r) { return (r.data && r.data.text) || ''; }); }
  // PDF : texte intégré d'abord (2 pages), puis OCR de la première page si le PDF est un scan.
  function lirePdf(buf, ocr) {
    return script(LIBS.pdf).then(function () {
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = blobWorker(LIBS.pdfWorker);
      return pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
    }).then(function (doc) {
      var n = Math.min(doc.numPages, 2), ps = [];
      for (var i = 1; i <= n; i += 1) ps.push(doc.getPage(i).then(function (p) { return p.getTextContent(); }).then(function (c) { var out = '', y = null; c.items.forEach(function (x) { var yy = Math.round(x.transform[5]); if (y !== null && Math.abs(yy - y) > 3) out += '\n'; else if (y !== null) out += ' '; out += x.str; y = yy; }); return out; }));
      return Promise.all(ps).then(function (t) { return t.join('\n'); }).then(function (txt) {
        if (txt.replace(/\s/g, '').length >= 30 || !ocr) return txt;
        return doc.getPage(1).then(function (p) { var v = p.getViewport({ scale: 2 }), c = document.createElement('canvas'); c.width = v.width; c.height = v.height; return p.render({ canvasContext: c.getContext('2d'), viewport: v }).promise.then(function () { return ocrImage(c); }); });
      });
    });
  }
  // Le worker pdf.js doit venir de la même origine que la page : on passe par un petit script local qui importe celui du CDN.
  function blobWorker(url) { try { return URL.createObjectURL(new Blob(['importScripts(' + JSON.stringify(url) + ');'], { type: 'text/javascript' })); } catch (e) { return url; } }
  function estPdf(nom, type) { return /\.pdf$/i.test(nom) || type === 'application/pdf'; }
  function lire(item, ocr) {
    if (item.texte != null) return Promise.resolve(item.texte);
    var f = item.file;
    if (estPdf(f.name, f.type)) return lirePdf(item.buf, ocr !== false);
    if (/\.(png|jpe?g|bmp|gif)$/i.test(f.name) && ocr !== false) return ocrImage(new Blob([item.buf], { type: f.type || 'image/jpeg' }));
    return Promise.resolve('');
  }
  function octets(file) { return file.arrayBuffer ? file.arrayBuffer() : new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = function () { ko(new Error('Lecture du fichier impossible')); }; r.readAsArrayBuffer(file); }); }

  /**
   * Analyse un fichier. options : { agents: [{id, nom}], reconnaitreAgent: bool, ocr: bool }.
   * Retourne la ligne de travail : { file, buf, nom_original, type, champs, agent, candidats, avertissement, flou, lu (texte lu ?) }.
   */
  function analyser(file, options) {
    options = options || {};
    var it = { file: file, nom_original: file.name, ext: AutoDetectDoc.extOf(file.name) };
    if (options.texte != null) it.texte = options.texte; // texte déjà connu (tests)
    return octets(file).then(function (buf) {
      it.buf = buf;
      var texte = null; var erreur = '';
      var detecter = function () {
        var r = AutoDetectDoc.detecter({ nom: file.name }, { agents: options.reconnaitreAgent === false ? [] : (options.agents || []), ocr: function () { return texte || ''; } });
        return r;
      };
      // Le nom d'abord ; la lecture du contenu (PDF / OCR, plus lente) seulement si le nom ne suffit pas.
      var r0 = detecter();
      var suffit = r0.type !== 'autre' && !/À compléter/.test(r0.avertissement) && (options.reconnaitreAgent === false || r0.candidats.length === 1);
      var lecture = suffit ? Promise.resolve('') : lire(it, options.ocr).catch(function (e) { erreur = e.message; return ''; });
      return lecture.then(function (t) {
        texte = t; it.lu = !!t;
        var r = suffit ? r0 : detecter();
        it.type = r.type; it.champs = r.champs; it.source = r.source; it.flou = !!r.flou; it.candidats = r.candidats;
        it.agent = options.reconnaitreAgent === false ? null : (r.candidats.length === 1 ? r.candidats[0] : null);
        it.avertissement = (r.avertissement + (erreur ? ' Lecture locale impossible (' + erreur + ') : le serveur lira le document.' : '')).trim();
        return it;
      });
    });
  }
  function nomDe(it) { return AutoDetectDoc.nomFinal(it.type, it.agent, it.champs, it.ext, it.nom_original); }
  // Noms finaux de la liste, sans doublon (_2, _3…) ; renvoie un tableau aligné sur les lignes.
  function nomsUniques(lignes) { var pris = []; return lignes.map(function (it) { var n = AutoDetectDoc.nomUnique(nomDe(it), pris); pris.push(n); return n; }); }

  // ----- archive .zip sans compression -----
  var CRC = (function () { var t = []; for (var n = 0; n < 256; n += 1) { var c = n; for (var k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u) { var c = 0xFFFFFFFF; for (var i = 0; i < u.length; i += 1) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s) { return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Uint8Array.from(unescape(encodeURIComponent(s)).split('').map(function (c) { return c.charCodeAt(0); })); }
  function u16(v) { return [v & 255, (v >>> 8) & 255]; }
  function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
  /** entrees : [{ nom, octets: ArrayBuffer|Uint8Array }] → Uint8Array du .zip. */
  function zip(entrees) {
    var parts = [], central = [], offset = 0;
    entrees.forEach(function (e) {
      var nom = utf8(e.nom), data = e.octets instanceof Uint8Array ? e.octets : new Uint8Array(e.octets), crc = crc32(data);
      var head = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(nom.length), u16(0));
      parts.push(Uint8Array.from(head), nom, data);
      central.push({ crc: crc, size: data.length, nom: nom, offset: offset });
      offset += head.length + nom.length + data.length;
    });
    var cdStart = offset, cd = [];
    central.forEach(function (c) {
      var rec = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(c.crc), u32(c.size), u32(c.size), u16(c.nom.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset));
      cd.push(Uint8Array.from(rec), c.nom); offset += rec.length + c.nom.length;
    });
    var fin = Uint8Array.from([].concat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(offset - cdStart), u32(cdStart), u16(0)));
    var all = parts.concat(cd, [fin]), len = all.reduce(function (s, p) { return s + p.length; }, 0), out = new Uint8Array(len), pos = 0;
    all.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }
  function base64(buf) { var u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), out = ''; for (var i = 0; i < u.length; i += 0x8000) out += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(out); }
  function telecharger(nom, octets, mime) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([octets], { type: mime || 'application/octet-stream' })); a.download = nom;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  // ----- renommage dans le dossier d'origine (File System Access : Chrome / Edge, page ouverte dans son propre onglet) -----
  function peutSurPlace() { return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'; }
  function nomLibreDans(dir, nom) {
    var e = AutoDetectDoc.extOf(nom), base = e ? nom.slice(0, -(e.length + 1)) : nom, k = 0;
    function essai(n) { return dir.getFileHandle(n).then(function () { k += 1; return essai(base + ' (' + k + ')' + (e ? '.' + e : '')); }, function (err) { if (err && err.name === 'NotFoundError') return n; throw err; }); }
    return essai(nom);
  }
  function deplacer(dir, ancien, nouveau) { return dir.getFileHandle(ancien).then(function (h) { return typeof h.move === 'function' ? h.move(nouveau).then(function () { return true; }, function () { return false; }) : false; }); }
  function copierPuisSupprimer(dir, it, ancien, nouveau) { return dir.getFileHandle(nouveau, { create: true }).then(function (h) { return h.createWritable(); }).then(function (w) { return w.write(it.buf).then(function () { return w.close(); }); }).then(function () { return dir.removeEntry(ancien); }); }
  /** Choisit un dossier (lecture + écriture) et lit ses PDF et images (pas les sous-dossiers). → { dir, files } */
  function ouvrirDossier() {
    return window.showDirectoryPicker({ mode: 'readwrite' }).then(function (dir) {
      var fs = [];
      return (function lire(itr) { return itr.next().then(function (r) { if (r.done) return; var e = r.value[1]; if (e.kind === 'file' && /\.(pdf|jpe?g|png)$/i.test(e.name)) return e.getFile().then(function (f) { fs.push(f); return lire(itr); }); return lire(itr); }); })(dir.entries())
        .then(function () { fs.sort(function (a, b) { return a.name.localeCompare(b.name, 'fr', { numeric: true }); }); return { dir: dir, files: fs }; });
    });
  }
  /** Renomme les lignes (it.file.name → noms[i]) dans le dossier ; ne remplace jamais un fichier présent. Met à jour it.nom_local. */
  function renommerSurPlace(dir, lignes, noms) {
    return lignes.reduce(function (p, it, i) {
      return p.then(function (fait) {
        if (noms[i] === it.file.name) { it.nom_local = noms[i]; return fait; }
        return nomLibreDans(dir, noms[i]).then(function (nl) { return deplacer(dir, it.file.name, nl).then(function (ok) { return ok || copierPuisSupprimer(dir, it, it.file.name, nl); }).then(function () { it.nom_local = nl; it.renomme = true; return fait + 1; }); });
      });
    }, Promise.resolve(0));
  }
  return { lire: lire, analyser: analyser, nomDe: nomDe, nomsUniques: nomsUniques, zip: zip, base64: base64, crc32: crc32, telecharger: telecharger, peutSurPlace: peutSurPlace, ouvrirDossier: ouvrirDossier, renommerSurPlace: renommerSurPlace, octets: octets };
})();
