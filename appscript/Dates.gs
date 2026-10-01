var Dates = (function () {
  var MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function monthKey(y, m) { return y + '-' + pad(m); }
  function parseKey(k) { var p = k.split('-'); return { y: Number(p[0]), m: Number(p[1]) }; }
  function isMonthKey(k) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(k || ''); }
  function fmt(d) { return d.toISOString().slice(0, 10); }
  function parse(s) { return new Date(s + 'T00:00:00Z'); }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && fmt(parse(s)) === s; }
  function addDays(s, n) { var d = parse(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function today() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
  function monthLabel(k) { var p = parseKey(k); return MOIS[p.m - 1] + ' ' + p.y; }
  function addMonths(k, n) { var p = parseKey(k); var t = p.y * 12 + (p.m - 1) + n; return monthKey(Math.floor(t / 12), (t % 12) + 1); }
  function monthDiff(a, b) { var x = parseKey(a); var y = parseKey(b); return (y.y - x.y) * 12 + (y.m - x.m); }
  function monthEnd(k) { var p = parseKey(k); return k + '-' + pad(daysInMonth(p.y, p.m)); }
  function frDate(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; }
  return { MOIS: MOIS, daysInMonth: daysInMonth, monthKey: monthKey, parseKey: parseKey, isMonthKey: isMonthKey, isDate: isDate, addDays: addDays, diffDays: diffDays, today: today, monthLabel: monthLabel, addMonths: addMonths, monthDiff: monthDiff, monthEnd: monthEnd, frDate: frDate };
})();
