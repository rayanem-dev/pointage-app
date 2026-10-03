var Format = (function () {
  var U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  var T = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
  function below100(n, final) {
    if (n < 20) return U[n];
    if (n < 70) { var t = Math.floor(n / 10); var u = n % 10; return T[t] + (u === 1 ? ' et un' : u ? '-' + U[u] : ''); }
    if (n < 80) return n === 71 ? 'soixante et onze' : 'soixante-' + U[n - 60];
    return n === 80 ? (final ? 'quatre-vingts' : 'quatre-vingt') : 'quatre-vingt-' + U[n - 80];
  }
  function below1000(n, final) {
    var c = Math.floor(n / 100); var r = n % 100;
    var s = c === 1 ? 'cent' : c > 1 ? U[c] + ' cent' + (r === 0 && final ? 's' : '') : '';
    if (r) s += (s ? ' ' : '') + below100(r, final);
    return s;
  }
  function words(n) {
    if (n === 0) return 'zéro';
    var bil = Math.floor(n / 1e9); var mil = Math.floor((n % 1e9) / 1e6); var k = Math.floor((n % 1e6) / 1e3); var r = n % 1e3;
    var parts = [];
    if (bil) parts.push(below1000(bil, true) + ' milliard' + (bil > 1 ? 's' : ''));
    if (mil) parts.push(below1000(mil, true) + ' million' + (mil > 1 ? 's' : ''));
    if (k) parts.push(k === 1 ? 'mille' : below1000(k, false) + ' mille');
    if (r) parts.push(below1000(r, true));
    return parts.join(' ');
  }
  function group(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function money(n) { var p = Number(n).toFixed(2).split('.'); return group(p[0]) + ',' + p[1]; }
  function int(n) { return group(String(Math.round(Number(n)))); }
  function stripAccents(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function amountInWords(n) {
    var total = Math.round(Number(n) * 100); var d = Math.floor(total / 100); var c = total % 100;
    var s = words(d) + ' dinar' + (d > 1 ? 's' : '') + ' algérien' + (d > 1 ? 's' : '');
    if (c) s += ' et ' + words(c) + ' centime' + (c > 1 ? 's' : '');
    return stripAccents(s.toUpperCase());
  }
  function norm(s) { return stripAccents(s).toLowerCase().replace(/\s+/g, ' ').trim(); }
  // Protège une valeur texte avant écriture dans une feuille Google : « =… », « +… », « -… », « @… » seraient interprétés comme une formule
  // (IMPORTDATA, IMAGE… pourraient envoyer des données du classeur vers un site extérieur). L'apostrophe force le texte et n'est pas relue.
  function cell(v) { return typeof v === 'string' && /^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? "'" + v : v; }
  function cells(rows) { return rows.map(function (r) { return r.map(cell); }); }
  // Limite d'envois (anti-spam d'e-mails) : true si l'action est encore permise ; compteur par clé, fenêtre en secondes.
  function allow(key, max, seconds) {
    var cache = CacheService.getScriptCache(); var n = Number(cache.get(key) || 0);
    if (n >= max) return false;
    cache.put(key, String(n + 1), seconds); return true;
  }
  // Liste d'adresses e-mail (3 au plus) séparées par virgule, point-virgule ou espace : renvoie « a@x, b@y » ; lève une erreur si une adresse est invalide.
  function emails(v, label, max) {
    var list = String(v == null ? '' : v).toLowerCase().split(/[\s,;]+/).filter(Boolean).filter(function (x, i, a) { return a.indexOf(x) === i; });
    list.forEach(function (x) { if (!/^\S+@\S+\.\S+$/.test(x)) throw httpErr_(label + ' : adresse invalide (' + x + ')'); });
    if (list.length > (max || 3)) throw httpErr_(label + ' : ' + (max || 3) + ' adresses au maximum');
    return list;
  }
  return { emails: emails, cell: cell, cells: cells, allow: allow, words: words, money: money, int: int, amountInWords: amountInWords, norm: norm };
})();
