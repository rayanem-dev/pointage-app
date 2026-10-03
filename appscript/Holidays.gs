/**
 * Jours fériés algériens : fêtes nationales (dates fixes) et fêtes religieuses (calendrier hégirien).
 * Les dates religieuses sont ESTIMÉES (calendrier hégirien civil) : en Algérie elles dépendent de l'observation de la lune
 * (écart possible d'un jour). Le Setup permet d'ajouter ou de corriger des jours (paramètre feries_perso).
 */
var Holidays = (function () {
  var FIXES = [[1, 1, "Nouvel an"], [1, 12, 'Yennayer (Nouvel an amazigh)'], [5, 1, 'Fête du travail'], [7, 5, "Fête de l'indépendance"], [11, 1, 'Anniversaire de la Révolution']];
  // [mois hégirien, jour, nom, nombre de jours]
  var RELIGIEUSES = [[1, 1, 'Nouvel an hégirien', 1], [1, 10, 'Achoura', 1], [3, 12, 'Mawlid Ennabaoui', 1], [10, 1, 'Aïd el-Fitr', 2], [12, 10, 'Aïd el-Adha', 2]];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  // Calendrier hégirien civil (tabulaire) -> jour julien -> date grégorienne.
  function hijriToJd(y, m, d) { return d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 + Math.floor((3 + 11 * y) / 30) + 1948439.5 - 1; }
  function jdToIso(jd) {
    var z = Math.floor(jd + 0.5); var a = z;
    if (z >= 2299161) { var al = Math.floor((z - 1867216.25) / 36524.25); a = z + 1 + al - Math.floor(al / 4); }
    var b = a + 1524; var c = Math.floor((b - 122.1) / 365.25); var dd = Math.floor(365.25 * c); var e = Math.floor((b - dd) / 30.6001);
    var day = b - dd - Math.floor(30.6001 * e); var month = e < 14 ? e - 1 : e - 13; var year = month > 2 ? c - 4716 : c - 4715;
    return iso(year, month, day);
  }
  function hijriYearsFor(y) { var h = Math.floor((y - 622) * 33 / 32); return [h - 1, h, h + 1, h + 2]; }

  // Jours fériés estimés d'une année grégorienne : [{ date, nom, type }] ('nationale' | 'religieuse').
  function ofYear(y) {
    var out = [];
    FIXES.forEach(function (f) { out.push({ date: iso(y, f[0], f[1]), nom: f[2], type: 'nationale' }); });
    hijriYearsFor(y).forEach(function (hy) {
      RELIGIEUSES.forEach(function (r) {
        var start = hijriToJd(hy, r[0], r[1]);
        for (var i = 0; i < r[3]; i += 1) {
          var date = jdToIso(start + i);
          if (date.slice(0, 4) === String(y)) out.push({ date: date, nom: r[3] > 1 ? r[2] + ' (jour ' + (i + 1) + ')' : r[2], type: 'religieuse' });
        }
      });
    });
    return out;
  }
  // Ajouts et retraits du Setup : « AAAA-MM-JJ Nom » ajoute, « - AAAA-MM-JJ » retire.
  function parsePerso(text) {
    var add = []; var del = {};
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line = line.trim(); if (!line) return;
      var m = /^-\s*(\d{4}-\d{2}-\d{2})/.exec(line);
      if (m) { del[m[1]] = true; return; }
      m = /^(\d{4}-\d{2}-\d{2})\s*(.*)$/.exec(line);
      if (m) add.push({ date: m[1], nom: m[2].trim() || 'Jour férié', type: 'perso' });
    });
    return { add: add, del: del };
  }
  // Jours fériés entre deux dates (incluses), triés ; les corrections du Setup s'appliquent.
  function between(from, to, perso) {
    var p = parsePerso(perso); var out = []; var seen = {};
    for (var y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y += 1) {
      ofYear(y).concat(p.add.filter(function (x) { return x.date.slice(0, 4) === String(y); })).forEach(function (h) {
        if (h.date < from || h.date > to || p.del[h.date]) return;
        var k = h.date + '|' + h.nom; if (seen[k]) return; seen[k] = true; out.push(h);
      });
    }
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  return { ofYear: ofYear, between: between, parsePerso: parsePerso };
})();
