/**
 * Installation / mise à jour automatique du code depuis GitHub.
 * À coller UNE FOIS dans l'éditeur Apps Script (Code.gs), puis exécuter « installerDepuisGitHub ».
 * Il télécharge tous les fichiers du dossier appscript/ du dépôt et les écrit dans ce projet.
 * Prérequis : un projet Google Cloud standard avec l'API Apps Script activée (le projet par défaut ne convient pas) et le manifeste
 * appsscript.json collé. Sans cela, utiliser clasp (voir README) : c'est la méthode recommandée pour les mises à jour.
 */
var INSTALLER = { OWNER: 'rayanem-dev', REPO: 'pointage-app', BRANCH: 'main', DIR: 'appscript' };

var Installer = (function () {
  var TYPES = { gs: 'SERVER_JS', html: 'HTML', json: 'JSON' };
  var REQUIRED = ['Main', 'Setup', 'Store', 'Index', 'App', 'I18n', 'Style', 'appsscript'];

  // Sans jeton : raw.githubusercontent.com (pas de limite d'API, contrairement à api.github.com dont la
  // limite de 60 requêtes/heure par IP est déjà atteinte sur les serveurs Google partagés).
  // Avec la propriété de script GITHUB_TOKEN (dépôt privé) : API GitHub authentifiée.
  function request(path) {
    var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    var base = INSTALLER.OWNER + '/' + INSTALLER.REPO;
    if (token) {
      return { url: 'https://api.github.com/repos/' + base + '/contents/' + path + '?ref=' + INSTALLER.BRANCH, headers: { Accept: 'application/vnd.github.raw', Authorization: 'Bearer ' + token, 'User-Agent': 'pointage-installer' }, muteHttpExceptions: true };
    }
    return { url: 'https://raw.githubusercontent.com/' + base + '/' + INSTALLER.BRANCH + '/' + path, muteHttpExceptions: true };
  }
  function check(res, what) {
    var code = res.getResponseCode();
    if (code === 200) return;
    if (code === 404) throw new Error(what + ' introuvable sur GitHub (dépôt privé ? ajoutez la propriété de script GITHUB_TOKEN).');
    if (code === 403 || code === 429) throw new Error('GitHub refuse la requête (trop de demandes depuis cette adresse, ou jeton invalide) : ' + what + '. Réessayez dans quelques minutes.');
    throw new Error('GitHub a répondu ' + code + ' pour ' + what);
  }
  function target(name) {
    var m = /^(.+)\.(gs|html|json)$/.exec(name);
    if (!m || (m[2] === 'json' && m[1] !== 'appsscript')) return null;
    return { name: m[1], type: TYPES[m[2]] };
  }

  // Télécharge les fichiers du dépôt : la liste est dans files.json ; [{ name, type, source }]
  function fetchRepoFiles() {
    var rl = request(INSTALLER.DIR + '/files.json');
    var list = UrlFetchApp.fetch(rl.url, rl);
    check(list, 'files.json');
    var entries = JSON.parse(list.getContentText()).filter(function (n) { return target(n); });
    var responses = UrlFetchApp.fetchAll(entries.map(function (n) { return request(INSTALLER.DIR + '/' + n); }));
    var files = entries.map(function (n, i) {
      check(responses[i], n);
      var t = target(n);
      return { name: t.name, type: t.type, source: responses[i].getContentText() };
    });
    var names = files.map(function (f) { return f.name; });
    var missing = REQUIRED.filter(function (n) { return names.indexOf(n) < 0; });
    if (missing.length) throw new Error('Téléchargement incomplet (fichiers manquants : ' + missing.join(', ') + '). Rien n\'a été modifié.');
    return files;
  }

  function api(method, payload) {
    var opts = { method: method, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
    if (payload) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(payload); }
    var res = UrlFetchApp.fetch('https://script.googleapis.com/v1/projects/' + ScriptApp.getScriptId() + '/content', opts);
    var code = res.getResponseCode();
    if (code !== 200) {
      var text = res.getContentText();
      if (/has not been used|disabled|SERVICE_DISABLED/i.test(text)) throw new Error("Le projet Google Cloud de ce script n'a pas l'API Apps Script (limite de Google : elle ne peut pas être activée sur le projet par défaut). Utilisez plutôt clasp pour envoyer le code (voir le README, « Alternative : clasp »), ou associez un projet Cloud standard où l'API est activée (⚙ Paramètres du projet → Projet Google Cloud Platform)."); 
      if (code === 403 || code === 401) throw new Error("Autorisation refusée : collez le manifeste appsscript.json du dépôt (il déclare les autorisations nécessaires), puis relancez et acceptez.");
      throw new Error('API Apps Script : erreur ' + code + ' — ' + text.slice(0, 200));
    }
    return JSON.parse(res.getContentText());
  }

  // Remplace le contenu du projet par celui du dépôt (les fichiers inconnus sont conservés, sauf l'ébauche « Code »).
  function run() {
    var files = fetchRepoFiles();
    var current = api('get').files || [];
    var ours = {};
    files.forEach(function (f) { ours[f.name] = true; });
    var kept = current.filter(function (f) { return !ours[f.name] && f.name !== 'Code'; }).map(function (f) { return { name: f.name, type: f.type, source: f.source }; });
    api('put', { files: files.concat(kept) });
    return { installed: files.length, kept: kept.length, names: files.map(function (f) { return f.name; }) };
  }
  return { run: run, fetchRepoFiles: fetchRepoFiles };
})();

/** Exécuter depuis l'éditeur (première installation) ou via le menu Pointage → Mettre à jour le code. */
function installerDepuisGitHub() {
  var msg;
  try {
    var r = Installer.run();
    msg = 'Code installé : ' + r.installed + ' fichiers depuis GitHub. Rechargez le classeur, puis menu Pointage → Installer / mettre à jour la structure.';
  } catch (e) { msg = 'Installation impossible : ' + e.message; }
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('Pointage', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* éditeur sans interface de classeur */ }
  return msg;
}
