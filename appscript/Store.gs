/** Accès à la base Google Sheets : un onglet = une table (ou un mois). Lecture groupée, écriture groupée. */
var Store = (function () {
  var memo = {};
  var tabsMemo = null;

  function ss() {
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  }
  function reset() { memo = {}; tabsMemo = null; }
  function str(v) {
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return v == null ? '' : String(v);
  }
  function listTabs() {
    if (!tabsMemo) tabsMemo = ss().getSheets().map(function (s) { return s.getName(); });
    return tabsMemo;
  }
  function getRows(tab) {
    if (memo[tab]) return memo[tab].map(function (r) { return r.slice(); });
    var sheet = ss().getSheetByName(tab);
    var rows = [];
    if (sheet && sheet.getLastRow() > 0) rows = sheet.getDataRange().getValues().map(function (r) { return r.map(str); });
    memo[tab] = rows;
    return rows.map(function (r) { return r.slice(); });
  }
  function setRows(tab, rows, opts) {
    opts = opts || {};
    var book = ss();
    var sheet = book.getSheetByName(tab);
    if (!sheet) { sheet = book.insertSheet(tab); tabsMemo = null; }
    sheet.clearContents();
    var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
    if (rows.length) {
      var padded = rows.map(function (r) { var c = r.slice(); while (c.length < width) c.push(''); return c; });
      var range = sheet.getRange(1, 1, padded.length, width);
      if (opts.text) range.setNumberFormat('@');
      range.setValues(padded);
    }
    memo[tab] = rows.map(function (r) { return r.map(str); });
    return sheet;
  }
  function deleteTab(tab) {
    var book = ss();
    var sheet = book.getSheetByName(tab);
    if (sheet) book.deleteSheet(sheet);
    delete memo[tab];
    tabsMemo = null;
  }
  function readTable(name) {
    var rows = getRows(name);
    if (!rows.length) return [];
    var header = rows[0].map(function (h) { return String(h).trim(); });
    return rows.slice(1)
      .filter(function (r) { return r.some(function (c) { return c !== '' && c != null; }); })
      .map(function (r) {
        var o = {};
        CFG.TABLES[name].forEach(function (k) { var i = header.indexOf(k); o[k] = i < 0 || r[i] == null ? '' : String(r[i]); });
        return o;
      });
  }
  function writeTable(name, objs) {
    var cols = CFG.TABLES[name];
    var rows = [cols].concat(objs.map(function (o) { return cols.map(function (k) { return o[k] == null ? '' : String(o[k]); }); }));
    return setRows(name, rows, { text: true });
  }
  // Verrou global pour toute opération d'écriture.
  function withLock(fn) {
    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try { return fn(); } finally { lock.releaseLock(); }
  }
  return { ss: ss, reset: reset, listTabs: listTabs, getRows: getRows, setRows: setRows, deleteTab: deleteTab, readTable: readTable, writeTable: writeTable, withLock: withLock };
})();
