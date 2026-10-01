// Simulation minimale des services Google Apps Script (SpreadsheetApp, Drive, Cache, Mail…) pour tester les .gs en local.
const crypto = require('crypto');

const noop = () => new Proxy(function () {}, { get: (t, p) => (p === 'then' ? undefined : noop()), apply: () => noop() });

function makeEnv() {
  const env = { mails: [], files: {}, fetches: [], props: {}, cache: {}, books: {} };

  class Range {
    constructor(sheet, r, c, nr, nc) {
      Object.assign(this, { sheet, r, c, nr, nc });
      const px = new Proxy(this, { get: (t, p) => (p in t ? t[p] : p === 'then' ? undefined : () => px) });
      this.px = px;
      return px;
    }
    setValues(v) { for (let i = 0; i < v.length; i += 1) for (let j = 0; j < v[i].length; j += 1) this.sheet._set(this.r + i, this.c + j, v[i][j]); return this.px; }
    setValue(v) { this.sheet._set(this.r, this.c, v); return this.px; }
    getValues() { const o = []; for (let i = 0; i < this.nr; i += 1) { const row = []; for (let j = 0; j < this.nc; j += 1) row.push(this.sheet._get(this.r + i, this.c + j)); o.push(row); } return o; }
  }
  class Sheet {
    constructor(book, name) { this.book = book; this.name = name; this.data = []; this.id = Math.floor(Math.random() * 1e6); return new Proxy(this, { get: (t, p) => (p in t ? t[p] : p === 'then' ? undefined : noop()) }); }
    getName() { return this.name; }
    setName(n) { this.name = n; return this; }
    getSheetId() { return this.id; }
    _set(r, c, v) { while (this.data.length < r) this.data.push([]); const row = this.data[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
    _get(r, c) { const row = this.data[r - 1]; return row && row[c - 1] !== undefined ? row[c - 1] : ''; }
    getLastRow() { let n = 0; this.data.forEach((row, i) => { if (row.some((v) => v !== '' && v != null)) n = i + 1; }); return n; }
    getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
    getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
    getRange(a, b, c, d) { if (typeof a === 'string') return new Range(this, 1, 1, 1, 1); return new Range(this, a, b, c || 1, d || 1); }
    clearContents() { this.data = []; return this; }
    clear() { this.data = []; return this; }
  }
  class Book {
    constructor(name) { this.name = name; this.id = 'book_' + crypto.randomBytes(4).toString('hex'); this.sheets = [new Sheet(this, 'Feuille 1')]; env.books[this.id] = this; }
    getId() { return this.id; }
    getSheets() { return this.sheets; }
    getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
    insertSheet(n) { const s = new Sheet(this, n); this.sheets.push(s); return s; }
    deleteSheet(s) { this.sheets = this.sheets.filter((x) => x.name !== s.name); }
  }
  env.main = new Book('Classeur');

  const SpreadsheetApp = {
    getActiveSpreadsheet: () => env.main,
    openById: (id) => env.books[id],
    create: (n) => new Book(n),
    flush: () => {},
    newConditionalFormatRule: noop, newDataValidation: noop,
    BorderStyle: { SOLID: 'SOLID' },
    getUi: () => ({ createMenu: noop, alert: () => 'OK', prompt: noop, ButtonSet: {}, Button: {} }),
  };
  const store = (obj) => ({ get: (k) => (k in obj ? obj[k] : null), put: (k, v) => { obj[k] = String(v); }, remove: (k) => { delete obj[k]; }, setProperty: (k, v) => { obj[k] = String(v); }, getProperty: (k) => (k in obj ? obj[k] : null), deleteProperty: (k) => { delete obj[k]; } });
  const bytesOf = (x) => (Buffer.isBuffer(x) ? x : Array.isArray(x) ? Buffer.from(x.map((n) => n & 255)) : Buffer.from(String(x)));
  const mkBlob = (bytes, mime, name) => ({ getBytes: () => Array.from(bytesOf(bytes)), getContentType: () => mime, getName: () => name, setName() {} });
  const Utilities = {
    getUuid: () => crypto.randomUUID(),
    computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(bytesOf(s)).digest()),
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    base64Encode: (x) => bytesOf(x).toString('base64'),
    base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
    newBlob: mkBlob,
    formatDate: (d) => d.toISOString().slice(0, 10),
  };
  const folder = { getId: () => 'folder1', createFile: (blob) => { const id = 'file_' + crypto.randomBytes(4).toString('hex'); env.files[id] = { blob, trashed: false }; return file(id); } };
  const file = (id) => ({ getId: () => id, getBlob: () => env.files[id].blob, setTrashed: (t) => { env.files[id].trashed = t; } });
  const DriveApp = {
    createFolder: () => folder, getFolderById: () => folder,
    getFileById: (id) => { if (!env.files[id]) { env.files[id] = { blob: mkBlob(Buffer.from('tmp'), 'x', 'x'), trashed: false }; } return file(id); },
  };
  const g = {
    SpreadsheetApp, Utilities, DriveApp,
    PropertiesService: { getScriptProperties: () => store(env.props) },
    CacheService: { getScriptCache: () => store(env.cache) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    MailApp: { sendEmail: (m) => { if (env.mailFail) throw new Error('quota'); env.mails.push(m); } },
    Session: { getScriptTimeZone: () => 'Africa/Algiers', getActiveUser: () => ({ getEmail: () => 'owner@test' }) },
    ScriptApp: { getOAuthToken: () => 'token', getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/X/exec' }) },
    UrlFetchApp: { fetch: (url) => { env.fetches.push(url); return { getResponseCode: () => 200, getBlob: () => mkBlob(Buffer.from(url.includes('format=pdf') ? '%PDF-fake' : 'PK-fake'), 'x', 'x') }; } },
    Logger: { log: () => {} },
    HtmlService: {},
  };
  return { env, globals: g };
}
module.exports = { makeEnv };
