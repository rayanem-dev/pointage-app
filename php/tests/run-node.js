// Rejoue le scénario sur la version Apps Script (simulateur Node) : node run-node.js sortie.json
const fs = require('fs'); const path = require('path');
const { loadApp } = require('../../appscript/dev/load.js');
const steps = require('./scenario.js');
const USERS = { admin: ['admin@demo.local', 'admin1234'], karim: ['karim@demo.local', 'demo1234'], samir: ['hamlaoui@demo.local', 'demo1234'], amine: ['boudiaf@demo.local', 'demo1234'], client: ['client@demo.local', 'demo1234'] };
const app = loadApp(); const vars = {}; const tokens = {}; const out = [];
const get = (o, p) => (p === '' ? o : p.split('.').reduce((x, k) => (x == null ? x : x[k]), o));
const resolve = (v) => {
  if (Array.isArray(v)) return v.map(resolve);
  if (v && typeof v === 'object') {
    if ('$' in v) return get(vars, v.$);
    if ('$patch' in v) { const base = JSON.parse(JSON.stringify(get(vars, v.$patch))); Object.keys(v).forEach((k) => { if (k !== '$patch') base[k] = v[k]; }); return base; }
    if ('$merge' in v) return Object.assign({}, ...v.$merge.map(resolve));
    const o = {}; Object.keys(v).forEach((k) => { o[k] = resolve(v[k]); }); return o;
  }
  return v;
};
steps.forEach((s, i) => {
  let r;
  if (s.name === '$install') { app.run(`Setup.install(${JSON.stringify(s.args[0])}, ${JSON.stringify(s.args[1])}, ${JSON.stringify(s.args[2])})`); out.push({ i, name: s.name, ok: true, data: null, rec: false }); return; }
  let token = null;
  if (s.as) { if (!tokens[s.as]) { const l = app.call(null, 'login', USERS[s.as][0], USERS[s.as][1]); if (!l.ok) throw new Error('login ' + s.as + ' : ' + l.error); tokens[s.as] = l.data.token; } token = tokens[s.as]; }
  r = app.call(token, s.name, ...resolve(s.args));
  if (!r.ok && !s.expectError) { console.error('PAS ' + i + ' ' + s.name + ' (' + s.as + ') : ' + r.error); }
  if (r.ok && s.save) Object.keys(s.save).forEach((k) => { vars[k] = get(r.data, s.save[k]); });
  out.push({ i, name: s.name, as: s.as, ok: r.ok, data: r.ok ? r.data : null, error: r.ok ? null : r.error, rec: !!s.rec });
});
fs.writeFileSync(process.argv[2] || '/tmp/out-node.json', JSON.stringify(out));
console.log('node : ' + out.length + ' pas, ' + out.filter((o) => !o.ok).length + ' erreurs');
