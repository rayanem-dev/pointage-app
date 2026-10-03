const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const app = loadApp();
const { call, run, env } = app;
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); return r; };
const T = {};

test('mise en place', () => {
  run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  T.admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  ok(call(T.admin, 'agentCreate', { nom: 'AGENT UN', email: 'un@t.fr', role: 'agent', password: 'unpass123' }));
});

test('mot de passe oublié : code par e-mail, réponse identique si l\'adresse est inconnue', () => {
  env.mails.length = 0;
  assert.deepStrictEqual(Object.keys(ok(call(null, 'passwordForgot', 'inconnu@t.fr', ''))), ['envoye'], 'même réponse pour une adresse inconnue');
  assert.strictEqual(env.mails.length, 0, 'aucun e-mail pour une adresse inconnue');
  ok(call(null, 'passwordForgot', 'un@t.fr', ''));
  const m = env.mails.find((x) => x.to === 'un@t.fr'); assert.ok(m);
  T.secret = /: (\d{6})\n/.exec(m.body)[1];
  fail(call(null, 'passwordReset', 'un@t.fr', '000000' === T.secret ? '111111' : '000000', 'nouveau123', ''), /invalide ou expiré/);
  fail(call(null, 'passwordReset', 'un@t.fr', T.secret, 'abc', ''), /6 caractères/);
  ok(call(null, 'passwordReset', 'un@t.fr', T.secret, 'nouveau123', ''));
  fail(call(null, 'login', 'un@t.fr', 'unpass123', ''), /incorrect/);
  ok(call(null, 'login', 'un@t.fr', 'nouveau123', ''));
  fail(call(null, 'passwordReset', 'un@t.fr', T.secret, 'autre12345', ''), /invalide ou expiré/, 'un code ne sert qu\'une fois');
});

test('mot de passe oublié : 5 essais maximum, 3 demandes par heure', () => {
  ok(call(null, 'passwordForgot', 'un@t.fr', ''));
  for (let i = 0; i < 5; i++) fail(call(null, 'passwordReset', 'un@t.fr', '999999', 'nouveau456', ''), /invalide ou expiré/);
  fail(call(null, 'passwordReset', 'un@t.fr', '999999', 'nouveau456', ''), /Trop d'essais|invalide/);
  ok(call(null, 'passwordForgot', 'un@t.fr', ''));
  fail(call(null, 'passwordForgot', 'un@t.fr', ''), /Trop de demandes/);
});

test('rester connecté : reconnexion sans mot de passe, jeton renouvelé, révoqué par déconnexion et changement de mot de passe', () => {
  const l = ok(call(null, 'login', 'un@t.fr', 'nouveau123', '', true));
  assert.ok(l.remember && l.remember.length > 40);
  assert.strictEqual(ok(call(null, 'login', 'un@t.fr', 'nouveau123', '', false)).remember, undefined, 'sans la case : pas de jeton');
  // la session (6 h) est perdue : le jeton rouvre une session
  Object.keys(env.cache).filter((k) => k.startsWith('S_')).forEach((k) => delete env.cache[k]);
  fail(call(l.token, 'me'), /Session expirée/);
  const r = ok(call(null, 'resume', l.remember));
  assert.strictEqual(r.user.email, 'un@t.fr'); assert.ok(r.remember && r.remember !== l.remember);
  assert.strictEqual(ok(call(r.token, 'me')).user.email, 'un@t.fr');
  fail(call(null, 'resume', l.remember), /Session expirée/, 'l\'ancien jeton est consommé');
  // les secrets ne sont pas stockés en clair
  assert.ok(!Object.keys(env.props).some((k) => k.includes(r.remember)), 'seule l\'empreinte est conservée');
  // déconnexion volontaire
  ok(call(null, 'forget', r.remember)); fail(call(null, 'resume', r.remember), /Session expirée/);
  // changement de mot de passe : tous les appareils sont oubliés
  const l2 = ok(call(null, 'login', 'un@t.fr', 'nouveau123', '', true));
  ok(call(l2.token, 'passwordOwn', 'nouveau123', 'encoreautre1'));
  fail(call(null, 'resume', l2.remember), /Session expirée/);
});

test('rester connecté : compte désactivé, jeton expiré, au plus 3 appareils', () => {
  T.admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token; // la session précédente a été vidée plus haut
  const l = ok(call(null, 'login', 'un@t.fr', 'encoreautre1', '', true));
  const id = ok(call(l.token, 'me')).user.id;
  ok(call(T.admin, 'agentUpdate', id, { actif: false }));
  fail(call(null, 'resume', l.remember), /Session expirée/, 'compte désactivé');
  ok(call(T.admin, 'agentUpdate', id, { actif: true }));
  const e = ok(call(null, 'login', 'un@t.fr', 'encoreautre1', '', true));
  const key = Object.keys(env.props).find((k) => k.startsWith('RM_')); const v = JSON.parse(env.props[key]); v.e = Date.now() - 1000; env.props[key] = JSON.stringify(v);
  fail(call(null, 'resume', e.remember), /Session expirée/, 'jeton expiré');
  const toks = [1, 2, 3, 4].map(() => ok(call(null, 'login', 'un@t.fr', 'encoreautre1', '', true)).remember);
  assert.ok(Object.keys(env.props).filter((k) => k.startsWith('RM_')).length <= 3, 'au plus 3 appareils par compte');
  assert.strictEqual(ok(call(null, 'resume', toks[3])).user.email, 'un@t.fr');
});

test('connexions : en ligne, dernière connexion, jamais connecté (administrateur seulement)', () => {
  const ok2 = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
  const ad = ok2(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  ok2(call(ad, 'agentCreate', { nom: 'JAMAIS VU', email: 'jv@t.fr', role: 'agent', password: 'jamaispw1' }));
  ok2(call(ad, 'agentCreate', { nom: 'DEJA VENU', email: 'dv@t.fr', role: 'agent', password: 'venupw123' }));
  const ag = ok2(call(null, 'login', 'dv@t.fr', 'venupw123')).token;
  ok2(call(ag, 'badges'));
  const l = ok2(call(ad, 'connexions')).entreprises[0].gens; // administrateur du classeur principal = éditeur : vue de toutes les entreprises
  const by = (n) => l.find((g) => g.nom === n);
  assert.strictEqual(by('DEJA VENU').en_ligne, true); assert.strictEqual(by('DEJA VENU').n, 1); assert.ok(by('DEJA VENU').derniere);
  assert.strictEqual(by('JAMAIS VU').en_ligne, false); assert.strictEqual(by('JAMAIS VU').derniere, ''); assert.strictEqual(by('JAMAIS VU').n, 0);
  assert.strictEqual(call(ag, 'connexions').ok, false, 'réservé à l\'administrateur');
  ok2(call(null, 'login', 'dv@t.fr', 'venupw123'));
  assert.strictEqual(ok2(call(ad, 'connexions')).entreprises[0].gens.find((g) => g.nom === 'DEJA VENU').n, 2);
});
