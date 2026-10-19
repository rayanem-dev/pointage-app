// Compare les sorties des deux versions (ids aléatoires et horodatages normalisés) : node compare.js a.json b.json
const fs = require('fs');
const [A, B] = [2, 3].map((i) => JSON.parse(fs.readFileSync(process.argv[i], 'utf8')));
function norm(out) {
  const map = {}; let n = 0;
  const id = (s) => (map[s] = map[s] || 'ID' + ++n);
  const walk = (v, key) => {
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach((k) => { o[k] = walk(v[k], k); }); return o; }
    if (typeof v === 'string') {
      if (/^(password|token|remember)$/.test(key)) return 'X';
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) return 'TS';
      if (/^[A-Z][0-9a-f]{8}$/.test(v)) return id(v);
      return v.replace(/\b[A-Z][0-9a-f]{8}\b/g, (m) => id(m));
    }
    if (typeof v === 'number' && !Number.isInteger(v)) return Math.round(v * 1e6) / 1e6;
    return v;
  };
  return out.map((o) => ({ ...o, data: o.rec || !o.ok ? walk(o.data, '') : null, error: o.error }));
}
const a = norm(A); const b = norm(B); let bad = 0;
const show = (x) => String(JSON.stringify(x)).slice(0, 500);
function diff(x, y, p, acc) {
  if (JSON.stringify(x) === JSON.stringify(y)) return;
  if (x && y && typeof x === 'object' && typeof y === 'object' && Array.isArray(x) === Array.isArray(y)) {
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    keys.forEach((k) => diff(x[k], y[k], p + '/' + k, acc));
  } else acc.push(p + ' : JS=' + show(x) + ' | PHP=' + show(y));
}
a.forEach((o, i) => {
  const p = b[i]; const d = [];
  if (!p) { d.push('absent côté PHP'); } else {
    if (o.ok !== p.ok) d.push('ok: JS=' + o.ok + ' PHP=' + p.ok + ' err JS=' + o.error + ' | PHP=' + p.error);
    else if (!o.ok && o.error !== p.error) d.push('message: JS=' + o.error + ' | PHP=' + p.error);
    if (o.rec && o.ok && p.ok) diff(o.data, p.data, '', d);
  }
  // écarts voulus : pas de console éditeur en PHP, lecture automatique (OCR) selon le serveur, tâche planifiée = cron.php
  const attendu = (l) => (o.name === 'me' && /^\/owner /.test(l)) || (/avertissement : .*Lecture automatique impossible/.test(l)) || (o.name === 'autoPointageSet' && /^\/(declencheur|avertissement) /.test(l));
  for (let j = d.length - 1; j >= 0; j--) if (attendu(d[j])) d.splice(j, 1);
  if (d.length) { bad++; console.log('✗ #' + i + ' ' + o.name + ' (' + (o.as || '') + ')'); d.slice(0, 6).forEach((l) => console.log('    ' + l)); }
});
console.log(bad ? bad + ' pas différents sur ' + a.length : 'IDENTIQUE : ' + a.length + ' pas');
process.exit(bad ? 1 : 0);
