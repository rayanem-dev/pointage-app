/** Accès à la base Google Sheets : un onglet = une table (ou un mois). Lecture groupée, écriture groupée. */
var Store = (function () {
  // Performances : (1) classeurs ouverts une seule fois par exécution, (2) lectures mémorisées par client pendant l'exécution,
  // (3) lectures partagées entre exécutions dans CacheService, validées par un numéro de version propre au client (changé à chaque écriture).
  var memo = {};     // clé client -> onglet -> lignes
  var tabsMemo = {}; // clé client -> liste des onglets
  var ssMemo = {};   // id du classeur -> classeur ouvert
  var verMemo = {};  // clé client -> version du cache
  var masterIdMemo = null;
  var CACHE_TTL = 120; // secondes : filet de sécurité si le classeur est modifié à la main dans Google Sheets
  var CACHE_MAX_CHARS = 60000; // une valeur de CacheService est limitée à 100 Ko
  // Client (« tenant ») courant : classeur propre à chaque client ; id vide = classeur principal (celui du script, aussi annuaire des clients).
  var tenant = { code: '', id: '' };

  function masterId() {
    if (masterIdMemo === null) masterIdMemo = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '';
    return masterIdMemo;
  }
  function open(id) {
    if (!id) return SpreadsheetApp.getActiveSpreadsheet();
    if (!ssMemo[id]) ssMemo[id] = SpreadsheetApp.openById(id);
    return ssMemo[id];
  }
  function masterSs() { return open(masterId()); }
  function ss() { return tenant.id ? open(tenant.id) : masterSs(); }
  function tkey() { return tenant.id || 'M:' + masterId(); }
  function cache() { return CacheService.getScriptCache(); }
  function version() {
    var k = tkey();
    if (verMemo[k] === undefined) { var v = null; try { v = cache().get('V_' + k); } catch (e) { /* ignore */ } verMemo[k] = v || '0'; }
    return verMemo[k];
  }
  // Toute écriture change la version du client : les lectures en cache des autres exécutions deviennent invalides.
  function bump() {
    var k = tkey(); var v = Date.now() + '.' + Math.floor(Math.random() * 1e6);
    verMemo[k] = v;
    try { cache().put('V_' + k, v, 21600); } catch (e) { /* ignore */ }
  }
  function cacheGet(name) {
    try {
      var raw = cache().get(name + '_' + tkey()); if (!raw) return null;
      var o = JSON.parse(raw); return o.v === version() ? o.d : null;
    } catch (e) { return null; }
  }
  function cachePut(name, v, data) { // v : version lue AVANT la lecture du classeur (une écriture concurrente invalide l'entrée)
    try { var raw = JSON.stringify({ v: v, d: data }); if (raw.length < CACHE_MAX_CHARS) cache().put(name + '_' + tkey(), raw, CACHE_TTL); } catch (e) { /* ignore */ }
  }
  function reset() { memo = {}; tabsMemo = {}; verMemo = {}; masterIdMemo = null; bump(); }
  function flushLocal() { memo = {}; tabsMemo = {}; verMemo = {}; masterIdMemo = null; } // simule une nouvelle exécution (tests) : le cache partagé reste
  function setTenant(code, id) { tenant = { code: String(code || ''), id: String(id || '') }; }
  function tenantCode() { return tenant.code; }
  function tenantId() { return tenant.id; }
  // Clé de propriété du script propre au client courant (le classeur principal garde les clés d'origine).
  function propKey(name) { return tenant.id ? name + '__' + tenant.code : name; }
  // Suffixe des dossiers Drive (Documents, Sauvegardes) pour ne pas mélanger les clients.
  function folderSuffix() { return tenant.id ? ' ' + tenant.code : ''; }
  // Exécute fn dans le classeur principal puis revient au client courant.
  function withMaster(fn) {
    var keep = tenant; tenant = { code: '', id: '' };
    try { return fn(); } finally { tenant = keep; }
  }
  function str(v) {
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return v == null ? '' : String(v);
  }
  function listTabs() {
    var k = tkey();
    if (!tabsMemo[k]) {
      var hit = cacheGet('TB');
      if (hit) tabsMemo[k] = hit;
      else { var v = version(); tabsMemo[k] = ss().getSheets().map(function (sh) { return sh.getName(); }); cachePut('TB', v, tabsMemo[k]); }
    }
    return tabsMemo[k];
  }
  function copyRows(rows) { return rows.map(function (r) { return r.slice(); }); }
  function getRows(tab) {
    var k = tkey(); var tm = memo[k] = memo[k] || {};
    if (tm[tab]) return copyRows(tm[tab]);
    var hit = cacheGet('R_' + tab);
    if (hit) { tm[tab] = hit; return copyRows(hit); }
    var v = version();
    var sheet = ss().getSheetByName(tab);
    var rows = [];
    if (sheet && sheet.getLastRow() > 0) rows = sheet.getDataRange().getValues().map(function (r) { return r.map(str); });
    tm[tab] = rows; cachePut('R_' + tab, v, rows);
    return copyRows(rows);
  }
  function setRows(tab, rows, opts) {
    opts = opts || {};
    var book = ss();
    var sheet = book.getSheetByName(tab);
    var k = tkey();
    if (!sheet) { sheet = book.insertSheet(tab); tabsMemo[k] = null; }
    sheet.clearContents();
    var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
    if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
    if (rows.length) {
      var padded = rows.map(function (r) { var c = r.slice(); while (c.length < width) c.push(''); return c; });
      var range = sheet.getRange(1, 1, padded.length, width);
      if (opts.text) range.setNumberFormat('@');
      range.setValues(opts.text ? padded : Format.cells(padded)); // hors format texte : neutralise les formules saisies par un utilisateur
    }
    bump();
    (memo[k] = memo[k] || {})[tab] = rows.map(function (r) { return r.map(str); });
    return sheet;
  }
  function deleteTab(tab) {
    var book = ss();
    var sheet = book.getSheetByName(tab);
    if (sheet) book.deleteSheet(sheet);
    var k = tkey();
    if (memo[k]) delete memo[k][tab];
    tabsMemo[k] = null;
    bump();
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
  return { flushLocal: flushLocal, ss: ss, masterSs: masterSs, setTenant: setTenant, tenantCode: tenantCode, tenantId: tenantId, propKey: propKey, folderSuffix: folderSuffix, withMaster: withMaster, reset: reset, listTabs: listTabs, getRows: getRows, setRows: setRows, deleteTab: deleteTab, readTable: readTable, writeTable: writeTable, withLock: withLock };
})();
