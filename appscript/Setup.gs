/** Installation de la structure, maintenance et remise à zéro (coquille vide). Menu « Sijil » du classeur. */
var Setup = (function () {
  var ORDER = ['Params', 'Agents', 'Contrats', 'Fonctions', 'Attachements', 'AttachementsValides', 'Demandes', 'Envois', 'Documents'];
  var WIDTHS = { Params: [220, 420], Agents: [90, 200, 180, 140, 150, 220, 80, 90, 60, 90, 60, 60, 100] };

  function hasAdmin() { return Agents.list().some(function (a) { return a.role === 'admin' && a.actif === '1'; }); }
  function status() {
    var tabs = Store.listTabs();
    return { installed: ORDER.every(function (t) { return tabs.indexOf(t) >= 0; }) && hasAdmin(), version: CFG.VERSION };
  }

  function readme() {
    var rows = [
      ['POINTAGE — Mode d\'emploi'], [''],
      ['1. Menu « Sijil » → « Installer / mettre à jour la structure » : crée les onglets et le compte administrateur.'],
      ['2. Extensions → Apps Script → Déployer → Application Web (Exécuter en tant que : moi / Accès : tout le monde). Copier l\'URL.'],
      ['3. Ouvrir l\'URL, se connecter avec l\'e-mail et le mot de passe de l\'administrateur, puis remplir l\'onglet Setup (prestataire, contrats, rotation).'],
      [''],
      ['Onglets : Params, Agents, Contrats, Fonctions, Attachements, Demandes, Envois, Documents = tables de l\'application (ne pas modifier à la main).'],
      ['Un onglet AAAA-MM par mois de pointage (créé automatiquement) et un onglet Global de comptage des reliquats.'],
      [''],
      ['Pour livrer une copie vierge à un nouveau prestataire : Fichier → Créer une copie, puis « Sijil → Vider les données » (mode « tout »).']
    ];
    var sheet = Store.setRows('Démarrage', rows);
    try { sheet.setColumnWidth(1, 900); sheet.getRange(1, 1).setFontWeight('bold').setFontSize(14); sheet.setTabColor('#1f5fbf'); } catch (e) { /* ignore */ }
  }
  function formatTable(name) {
    try {
      var sheet = Store.ss().getSheetByName(name);
      var cols = CFG.TABLES[name];
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#e8edf3');
      (WIDTHS[name] || []).forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
      (CFG.HIDDEN[name] || []).forEach(function (c) { sheet.hideColumns(cols.indexOf(c) + 1); });
      if (name === 'Agents') {
        sheet.getRange(2, cols.indexOf('role') + 1, 500, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CFG.ROLES, true).setAllowInvalid(false).build());
        sheet.getRange(2, cols.indexOf('actif') + 1, 500, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['0', '1'], true).setAllowInvalid(false).build());
      }
      sheet.protect().setWarningOnly(true).setDescription('Table gérée par l\'application');
    } catch (e) { Logger.log('Mise en forme de ' + name + ' : ' + e.message); }
  }

  // Crée / répare toutes les tables sans perdre les données (migration par nom de colonne).
  function repairStructure() {
    ORDER.forEach(function (name) { Store.writeTable(name, Store.readTable(name)); formatTable(name); });
    Params.set({});
    return status();
  }
  function install(adminEmail, adminPassword, adminName) {
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', SpreadsheetApp.getActiveSpreadsheet().getId());
    Store.reset();
    repairStructure();
    var created = Agents.ensureAdmin(adminEmail, adminPassword, adminName);
    readme();
    try { Documents.list({ role: 'admin', id: '' }, ''); } catch (e) { /* dossier Drive créé à la demande */ }
    Store.reset();
    return { admin: created ? created.email : null, status: status() };
  }

  // Remise à zéro. mode « donnees » : garde la configuration ; « tout » : coquille vide (hors comptes admin).
  function vider(mode, confirm) {
    if (confirm !== 'VIDER') throw httpErr_('Confirmation incorrecte : tapez VIDER');
    Documents.purgeFiles();
    Store.listTabs().filter(function (t) { return Dates.isMonthKey(t) || t === 'Global'; }).forEach(Store.deleteTab);
    ['Demandes', 'Envois', 'Documents', 'Attachements', 'AttachementsValides'].forEach(function (n) { Store.writeTable(n, []); });
    Store.writeTable('Agents', Agents.list().filter(function (a) { return a.role === 'admin' || a.role === 'client'; }));
    if (mode === 'tout') { Store.writeTable('Agents', Agents.list().filter(function (a) { return a.role === 'admin'; })); Store.writeTable('Params', []); Store.writeTable('Contrats', []); Store.writeTable('Fonctions', []); Params.set({}); }
    Store.reset();
    return { mode: mode === 'tout' ? 'tout' : 'donnees' };
  }

  // ----- sauvegarde / restauration : copies du classeur dans Drive / « Sauvegardes » (à côté du classeur) -----
  function backupFolder() {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty(Store.propKey('BACKUP_ROOT_ID'));
    if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* dossier supprimé : on le recrée */ } }
    var parent = null;
    try { var p = DriveApp.getFileById(Store.ss().getId()).getParents(); if (p.hasNext()) parent = p.next(); } catch (e) { /* classeur à la racine */ }
    var nom = 'Sauvegardes' + Store.folderSuffix();
    var it = parent ? parent.getFoldersByName(nom) : null;
    var f = it && it.hasNext() ? it.next() : (parent ? parent.createFolder(nom) : DriveApp.createFolder(nom));
    props.setProperty(Store.propKey('BACKUP_ROOT_ID'), f.getId());
    return f;
  }
  function backup(user, note) {
    var stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    var name = 'Sauvegarde ' + stamp + (note ? ' (' + note + ')' : '');
    var copy = DriveApp.getFileById(Store.ss().getId()).makeCopy(name, backupFolder());
    return { id: copy.getId(), nom: name, par: user ? user.nom : '' };
  }
  function listBackups() {
    var out = []; var it = backupFolder().getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (f.getName().indexOf('Sauvegarde ') !== 0) continue;
      var d = f.getDateCreated ? f.getDateCreated() : null;
      out.push({ id: f.getId(), nom: f.getName(), date: d ? new Date(d).toISOString() : '', url: 'https://docs.google.com/spreadsheets/d/' + f.getId() });
    }
    return out.sort(function (a, b) { return a.nom < b.nom ? 1 : -1; });
  }
  function ensureBackup(id) {
    if (!listBackups().some(function (b) { return b.id === id; })) throw httpErr_('Sauvegarde introuvable');
  }
  // Restaure : remplace les onglets de l'application par ceux de la sauvegarde (une sauvegarde « avant restauration » est faite d'abord).
  function restore(user, id, confirm) {
    if (confirm !== 'RESTAURER') throw httpErr_('Confirmation incorrecte : tapez RESTAURER');
    ensureBackup(id);
    var src = SpreadsheetApp.openById(id);
    if (!src.getSheetByName('Params') || !src.getSheetByName('Agents')) throw httpErr_("Ce fichier n'est pas une sauvegarde de l'application");
    var safety = backup(user, 'avant restauration');
    var book = Store.ss(); var names = [];
    src.getSheets().forEach(function (sh) {
      var name = sh.getName(); names.push(name);
      var old = book.getSheetByName(name);
      var copy = sh.copyTo(book);
      if (old) book.deleteSheet(old);
      copy.setName(name);
    });
    book.getSheets().map(function (s) { return s.getName(); }).forEach(function (n) {
      if ((Dates.isMonthKey(n) || n === 'Global') && names.indexOf(n) < 0) Store.deleteTab(n);
    });
    Store.reset();
    return { restaure: names.length, securite: safety.nom };
  }
  function removeBackup(id) { ensureBackup(id); DriveApp.getFileById(id).setTrashed(true); return true; }
  return { readme: readme, status: status, hasAdmin: hasAdmin, install: install, repairStructure: repairStructure, vider: vider, backup: backup, listBackups: listBackups, restore: restore, removeBackup: removeBackup };
})();

// ---------- Menu du classeur ----------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Sijil')
    .addItem('Installer / mettre à jour la structure', 'menuInstall')
    .addItem("Ouvrir l'application", 'menuOpenApp')
    .addItem('Mettre à jour le code depuis GitHub', 'installerDepuisGitHub')
    .addSeparator()
    .addItem('Vider les données (coquille vide)', 'menuVider')
    .addToUi();
}
function menuInstall() {
  var ui = SpreadsheetApp.getUi();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', SpreadsheetApp.getActiveSpreadsheet().getId());
  Store.reset();
  var email = ''; var password = ''; var nom = '';
  if (!Setup.hasAdmin()) {
    var r1 = ui.prompt('Installation — administrateur', "E-mail de l'administrateur :", ui.ButtonSet.OK_CANCEL);
    if (r1.getSelectedButton() !== ui.Button.OK) return;
    var r2 = ui.prompt('Installation — administrateur', 'Mot de passe (6 caractères minimum) :', ui.ButtonSet.OK_CANCEL);
    if (r2.getSelectedButton() !== ui.Button.OK) return;
    email = r1.getResponseText(); password = r2.getResponseText(); nom = 'Administrateur';
  }
  try {
    var res = Store.withLock(function () { return Setup.install(email, password, nom); });
    ui.alert('Sijil', res.admin ? 'Installation terminée. Administrateur : ' + res.admin : 'Structure mise à jour (données conservées).', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Installation impossible', e.message, ui.ButtonSet.OK); }
}
function menuVider() {
  var ui = SpreadsheetApp.getUi();
  var m = ui.alert('Vider les données', 'OUI = tout vider (coquille vide : agents, pointages, demandes, contrats, paramètres).\nNON = vider seulement les données (agents, pointages, demandes) et garder la configuration.', ui.ButtonSet.YES_NO_CANCEL);
  if (m === ui.Button.CANCEL) return;
  var c = ui.prompt('Confirmation', 'Cette action est irréversible. Tapez VIDER pour confirmer :', ui.ButtonSet.OK_CANCEL);
  if (c.getSelectedButton() !== ui.Button.OK) return;
  try {
    Store.reset();
    Store.withLock(function () { Setup.vider(m === ui.Button.YES ? 'tout' : 'donnees', c.getResponseText().trim()); });
    ui.alert('Sijil', 'Données vidées. Le compte administrateur est conservé.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Opération annulée', e.message, ui.ButtonSet.OK); }
}
function menuOpenApp() {
  var url = ScriptApp.getService().getUrl();
  var ui = SpreadsheetApp.getUi();
  ui.alert("Application Sijil", url ? 'Adresse : ' + url : "Aucun déploiement : Extensions → Apps Script → Déployer → Nouveau déploiement → Application Web.", ui.ButtonSet.OK);
}
