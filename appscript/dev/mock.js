// Simulation minimale des services Google Apps Script (SpreadsheetApp, Drive, Cache, Mail…) pour tester les .gs en local.
const crypto = require('crypto');

const noop = () => new Proxy(function () {}, { get: (t, p) => (p === 'then' ? undefined : noop()), apply: () => noop() });

function makeEnv() {
  const env = { mails: [], files: {}, fetches: [], props: {}, cache: {}, books: {}, badFormulas: [], formulaCells: [] };

  // Feuille simulée avec les limites de grille de Google (26 colonnes × 1000 lignes par défaut) :
  // setValues agrandit la grille, mais régler la largeur / masquer / fusionner hors grille lève une erreur comme chez Google.
  class Range {
    constructor(sheet, r, c, nr, nc) {
      Object.assign(this, { sheet, r, c, nr, nc });
      const px = new Proxy(this, { get: (t, p) => (p in t ? t[p] : p === 'then' ? undefined : () => { this.check(); return px; }) });
      this.px = px;
      return px;
    }
    check() {
      if (this.c + this.nc - 1 > this.sheet.maxCols) throw new Error('Those columns are out of bounds.');
      if (this.r + this.nr - 1 > this.sheet.maxRows) throw new Error('Those rows are out of bounds.');
    }
    setValues(v) {
      // comme Google : le tableau de données doit avoir exactement les dimensions de la zone
      if (v.length !== this.nr) throw new Error(`The number of rows in the data does not match the number of rows in the range. The data has ${v.length} but the range has ${this.nr}.`);
      v.forEach((row) => { if (row.length !== this.nc) throw new Error(`The number of columns in the data does not match the number of columns in the range. The data has ${row.length} but the range has ${this.nc}.`); });
      this.sheet._grow(this.r + v.length - 1, this.c + (v[0] ? v[0].length : 1) - 1);
      for (let i = 0; i < v.length; i += 1) for (let j = 0; j < v[i].length; j += 1) {
        const x = v[i][j];
        if (typeof x === 'string' && x.startsWith('=') && x.includes(',')) env.badFormulas.push(`${this.sheet.name}!${this.r + i},${this.c + j} ${x}`); // séparateur « , » dépendant de la langue
        if (typeof x === 'string' && /^[=+\-@]/.test(x) && !/^-?\d+(\.\d+)?$/.test(x) && !this._text) env.formulaCells.push(`${this.sheet.name}!${this.r + i},${this.c + j} ${x}`); // texte saisi interprété comme formule
        this.sheet._set(this.r + i, this.c + j, typeof x === 'string' && x.startsWith("'") && !this._text ? x.slice(1) : x);
      }
      return this.px;
    }
    setNumberFormat(f) { if (f === '@') this._text = true; return this.px; }
    // setFormulas : syntaxe anglaise (virgules) acceptée quelle que soit la langue du classeur
    setFormulas(v) { this.sheet._grow(this.r + v.length - 1, this.c + (v[0] ? v[0].length : 1) - 1); for (let i = 0; i < v.length; i += 1) for (let j = 0; j < v[i].length; j += 1) this.sheet._set(this.r + i, this.c + j, v[i][j]); return this.px; }
    setValue(v) { this.sheet._grow(this.r, this.c); this.sheet._set(this.r, this.c, v); return this.px; }
    getValues() { const o = []; for (let i = 0; i < this.nr; i += 1) { const row = []; for (let j = 0; j < this.nc; j += 1) row.push(this.sheet._get(this.r + i, this.c + j)); o.push(row); } return o; }
  }
  class Sheet {
    constructor(book, name) { this.book = book; this.name = name; this.data = []; this.id = Math.floor(Math.random() * 1e6); this.maxCols = 26; this.maxRows = 1000; return new Proxy(this, { get: (t, p) => (p in t ? t[p] : p === 'then' ? undefined : noop()) }); }
    getName() { return this.name; }
    setName(n) { this.name = n; return this; }
    getSheetId() { return this.id; }
    getMaxColumns() { return this.maxCols; } getMaxRows() { return this.maxRows; }
    insertColumnsAfter(pos, n) { this.maxCols += n; } insertRowsAfter(pos, n) { this.maxRows += n; }
    _grow(r, c) { this.maxRows = Math.max(this.maxRows, r); this.maxCols = Math.max(this.maxCols, c); }
    setColumnWidth(col) { if (col > this.maxCols) throw new Error('Those columns are out of bounds.'); }
    setColumnWidths(start, n) { if (start + n - 1 > this.maxCols) throw new Error('Those columns are out of bounds.'); }
    hideColumns(col, n = 1) { if (col + n - 1 > this.maxCols) throw new Error('Those columns are out of bounds.'); }
    _set(r, c, v) { while (this.data.length < r) this.data.push([]); const row = this.data[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
    _get(r, c) { const row = this.data[r - 1]; return row && row[c - 1] !== undefined ? row[c - 1] : ''; }
    getLastRow() { let n = 0; this.data.forEach((row, i) => { if (row.some((v) => v !== '' && v != null)) n = i + 1; }); return n; }
    getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
    getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
    getRange(a, b, c, d) { if (typeof a === 'string') return new Range(this, 1, 1, 1, 1); return new Range(this, a, b, c || 1, d || 1); }
    copyTo(target) { const c = new Sheet(target, 'Copie de ' + this.name); c.data = this.data.map((r) => r.slice()); target.sheets.push(c); return c; }
    clearContents() { this.data = []; return this; }
    clear() { this.data = []; return this; }
  }
  class Book {
    constructor(name) { this.name = name; this.id = 'book_' + crypto.randomBytes(4).toString('hex'); this.sheets = [new Sheet(this, 'Feuille 1')]; env.books[this.id] = this; }
    getId() { return this.id; } getName() { return this.name; }
    addEditor(e) { (env.shares = env.shares || []).push(['editor', this.id, e]); } addViewer(e) { (env.shares = env.shares || []).push(['viewer', this.id, e]); }
    getSheets() { return this.sheets; }
    getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
    insertSheet(n) { const s = new Sheet(this, n); this.sheets.push(s); return s; }
    deleteSheet(s) { this.sheets = this.sheets.filter((x) => x.name !== s.name); }
  }
  env.main = new Book('Classeur');

  const SpreadsheetApp = {
    getActiveSpreadsheet: () => env.main,
    openById: (id) => { env.opens = (env.opens || 0) + 1; return env.books[id]; },
    create: (n) => new Book(n),
    flush: () => {},
    newConditionalFormatRule: noop, newDataValidation: noop,
    BorderStyle: { SOLID: 'SOLID' },
    getUi: () => ({ createMenu: noop, alert: () => 'OK', prompt: noop, ButtonSet: {}, Button: {} }),
  };
  const store = (obj) => ({ get: (k) => (k in obj ? obj[k] : null), put: (k, v) => { obj[k] = String(v); }, remove: (k) => { delete obj[k]; }, setProperty: (k, v) => { obj[k] = String(v); }, getProperty: (k) => (k in obj ? obj[k] : null), getProperties: () => Object.assign({}, obj), deleteProperty: (k) => { delete obj[k]; } });
  const bytesOf = (x) => (Buffer.isBuffer(x) ? x : Array.isArray(x) ? Buffer.from(x.map((n) => n & 255)) : Buffer.from(String(x)));
  const mkBlob = (bytes, mime, name) => ({ getBytes: () => Array.from(bytesOf(bytes)), getDataAsString: () => bytesOf(bytes).toString('utf8'), getContentType: () => mime, getName: () => name, setName() {}, getAs: (m) => mkBlob(bytes, m, String(name).replace(/\.[^.]+$/, '') + (m === 'application/pdf' ? '.pdf' : '')) });
  const Utilities = {
    getUuid: () => crypto.randomUUID(),
    computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(bytesOf(s)).digest()),
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    base64Encode: (x) => bytesOf(x).toString('base64'),
    base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
    newBlob: mkBlob,
    formatDate: (d) => d.toISOString().slice(0, 10),
  };
  // Drive simulé avec une vraie arborescence : racine → dossier du classeur → sous-dossiers
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  class Folder {
    constructor(name, parent) { this.name = name; this.parent = parent; this.id = 'fld_' + crypto.randomBytes(4).toString('hex'); this.folders = []; this.ids = []; env.folderById[this.id] = this; }
    getId() { return this.id; } getName() { return this.name; }
    createFolder(n) { const f = new Folder(n, this); this.folders.push(f); return f; }
    getFoldersByName(n) { return iter(this.folders.filter((f) => f.name === n)); }
    createFile(blob) { const id = 'file_' + crypto.randomBytes(4).toString('hex'); env.files[id] = { blob, trashed: false, name: blob.getName(), folder: this }; this.ids.push(id); return file(id); }
    getFiles() { return iter(this.ids.filter((id) => !env.files[id].trashed).map(file)); }
    getFilesByName(n) { return iter(this.ids.filter((id) => !env.files[id].trashed && env.files[id].name === n).map(file)); }
  }
  env.folderById = {};
  env.rootFolder = new Folder('Mon Drive', null);
  env.sheetFolder = env.rootFolder.createFolder('Dossier du classeur'); // dossier qui contient le Google Sheet
  const file = (id) => ({ getId: () => id, getBlob: () => env.files[id].blob, setTrashed: (t) => { env.files[id].trashed = t; }, setName: (n) => { env.files[id].name = n; }, moveTo: (folder) => { const f = env.files[id]; if (f.folder) f.folder.ids = f.folder.ids.filter((x) => x !== id); f.folder = folder; folder.ids.push(id); }, getName: () => env.files[id].name, getDateCreated: () => new Date() });
  const DriveApp = {
    createFolder: (n) => env.rootFolder.createFolder(n),
    getFolderById: (id) => { if (!env.folderById[id]) throw new Error('Dossier introuvable'); return env.folderById[id]; },
    getFileById: (id) => {
      if (env.files[id] && env.files[id].book) return file(id);
      if (env.books[id]) return { getId: () => id, getParents: () => iter([env.sheetFolder]), setTrashed() {}, moveTo(folder) { /* rangement simulé */ }, makeCopy: (name, folder) => {
        const b = new Book(name); b.sheets = env.books[id].sheets.map((s) => { const c = new Sheet(b, s.name); c.data = s.data.map((r) => r.slice()); return c; });
        env.files[b.id] = { blob: mkBlob(Buffer.from('x'), 'x', name), trashed: false, name, folder, book: true }; folder.ids.push(b.id); return file(b.id);
      } };
      if (!env.files[id]) env.files[id] = { blob: mkBlob(Buffer.from('tmp'), 'x', 'x'), trashed: false, name: 'x' };
      return file(id);
    },
  };
  const g = {
    SpreadsheetApp, Utilities, DriveApp,
    PropertiesService: { getScriptProperties: () => store(env.props) },
    CacheService: { getScriptCache: () => store(env.cache) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    MailApp: { sendEmail: (m) => { if (env.mailFail) throw new Error('quota'); env.mails.push(m); } },
    Session: { getScriptTimeZone: () => 'Africa/Algiers', getActiveUser: () => ({ getEmail: () => 'owner@test' }) },
    ScriptApp: { getScriptId: () => 'SCRIPT123', getOAuthToken: () => 'token', getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/X/exec' }) },
    UrlFetchApp: {
      fetch: (url, opts) => {
        env.fetches.push(url);
        if (env.fetchHandler) { const r = env.fetchHandler(url, opts || {}); if (r) return { getResponseCode: () => r.code, getContentText: () => r.body, getBlob: () => mkBlob(Buffer.from(r.body), 'x', 'x') }; }
        return { getResponseCode: () => 200, getContentText: () => '', getBlob: () => mkBlob(Buffer.from(url.includes('format=pdf') ? '%PDF-fake' : 'PK-fake'), 'x', 'x') };
      },
      fetchAll: (reqs) => reqs.map((r) => g.UrlFetchApp.fetch(r.url, r)),
    },
    Logger: { log: () => {} },
    HtmlService: {},
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: (t) => ({ text: t, setMimeType(m) { this.mime = m; return this; } }) },
  };
  return { env, globals: g };
}
module.exports = { makeEnv };
