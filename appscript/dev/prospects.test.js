const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const app = loadApp();
const { call, run, env } = app;
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); return r; };
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const get = (parameter) => JSON.parse(app.ctx.doGet({ parameter }).text);
const T = {};

test('mise en place : compte unique de l\'éditeur', () => {
  run("Setup.install('editeur@t.fr', 'editeurpw1', 'Éditeur')");
  run("Params.set({ prestataire_nom: 'SARL PRINCIPALE' })");
  T.owner = ok(call(null, 'login', 'editeur@t.fr', 'editeurpw1', 'ADMIN')).token;
});

test('vitrine : seules les entreprises cochées sont publiques', () => {
  ok(call(T.owner, 'clientCreate', { code: 'ALPHA', nom: 'Zeta Services', admin_email: 'a@alpha.dz' }));
  ok(call(T.owner, 'clientCreate', { code: 'BETA', nom: 'Beta Travaux', admin_email: 'b@beta.dz' }));
  ok(call(T.owner, 'clientCreate', { code: 'GAMMA', nom: 'Gamma', admin_email: 'g@gamma.dz' }));
  assert.deepStrictEqual(get({ entreprises: '' }).entreprises, [], 'rien de public par défaut');
  ok(call(T.owner, 'clientUpdate', 'ALPHA', { vitrine: true })); ok(call(T.owner, 'clientUpdate', 'BETA', { vitrine: true })); ok(call(T.owner, 'clientUpdate', 'GAMMA', { vitrine: true }));
  ok(call(T.owner, 'clientUpdate', 'GAMMA', { statut: 'suspendu' }));
  const r = get({ entreprises: '' });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.entreprises, [{ code: 'BETA', nom: 'Beta Travaux' }, { code: 'ALPHA', nom: 'Zeta Services' }], 'triées par nom, sans suspendu ni classeur principal');
  assert.strictEqual(ok(call(T.owner, 'clients')).clients.find((c) => c.code === 'ALPHA').vitrine, true);
});

test('demande d\'essai : validations, piège, dédoublonnage', () => {
  assert.strictEqual(get({ prospect: b64({ societe: 'X', email: 'a@b.fr' }) }).ok, false, 'société trop courte');
  assert.match(get({ prospect: b64({ societe: 'Delta SARL', email: 'pas-un-mail' }) }).error, /e-mail/);
  assert.strictEqual(get({ prospect: b64({ societe: 'Robot', email: 'r@r.fr', site: 'http://spam' }) }).ok, true);
  assert.strictEqual(ok(call(T.owner, 'prospects')).length, 0, 'le robot (champ piège) n\'est pas enregistré');
  ok(call(T.owner, 'editeurContactSave', { nom: 'Éditeur', email: 'contact@editeur.fr', tel: '' }));
  env.mails.length = 0;
  assert.strictEqual(get({ prospect: b64({ societe: 'Delta SARL', nom: 'Karim', email: 'Karim@Delta.dz', tel: '0555', message: 'Besoin de 40 agents é' }) }).ok, true);
  assert.strictEqual(get({ prospect: b64({ societe: 'Delta SARL', email: 'karim@delta.dz', message: 'Mise à jour' }) }).ok, true);
  const l = ok(call(T.owner, 'prospects'));
  assert.strictEqual(l.length, 1, 'un seul dossier ouvert par e-mail'); assert.strictEqual(l[0].message, 'Mise à jour'); assert.strictEqual(l[0].nom, 'Karim');
  assert.strictEqual(l[0].statut, 'nouveau');
  assert.strictEqual(env.mails.length, 1, 'l\'éditeur n\'est prévenu qu\'une fois');
  T.pid = l[0].id;
});

test('console prospects : réservée à l\'éditeur, statut, note, création de l\'essai', () => {
  ok(call(T.owner, 'clientCreate', { code: 'OMEGA', nom: 'Omega', admin_email: 'o@omega.dz', admin_password: 'omegapass1' }));
  const other = ok(call(null, 'login', 'o@omega.dz', 'omegapass1', 'OMEGA')).token;
  fail(call(other, 'prospects'), /réservé|Accès/i);
  fail(call(T.owner, 'prospectUpdate', T.pid, { statut: 'bizarre' }), /Statut/);
  const u = ok(call(T.owner, 'prospectUpdate', T.pid, { statut: 'contacté', note: 'Rappeler lundi' }));
  assert.strictEqual(u.statut, 'contacté'); assert.strictEqual(u.note, 'Rappeler lundi');
  fail(call(T.owner, 'prospectConvertir', 'P-inconnu', { code: 'DELTA' }), /introuvable/);
  env.mails.length = 0;
  const r = ok(call(T.owner, 'prospectConvertir', T.pid, { code: 'DELTA', jours: 14, envoyer: true }));
  assert.strictEqual(r.client.code, 'DELTA'); assert.strictEqual(r.client.statut, 'essai'); assert.strictEqual(r.envoye, true);
  assert.ok(env.mails.some((m) => m.to === 'karim@delta.dz' && /Code entreprise : DELTA/.test(m.body)), 'accès envoyés au prospect');
  assert.strictEqual(ok(call(T.owner, 'prospects'))[0].statut, 'converti');
  fail(call(T.owner, 'prospectConvertir', T.pid, { code: 'DELTA2' }), /déjà/);
});

test('limite horaire des demandes publiques', () => {
  let last; for (let i = 0; i < 32; i++) last = get({ prospect: b64({ societe: 'Société ' + i, email: 'u' + i + '@x.fr' }) });
  assert.strictEqual(last.ok, false); assert.match(last.error, /Trop de demandes/);
});

test('envoi du message de bienvenue par e-mail', () => {
  const r = ok(call(T.owner, 'clientCreate', { code: 'SIGMA', nom: 'Sigma', admin_email: 's@sigma.dz' }));
  assert.match(r.admin.nom || 'Gestionnaire Sigma', /Sigma/);
  env.mails.length = 0;
  fail(call(T.owner, 'clientEnvoyer', 'pas-un-mail', r.message, 'Sigma'), /invalide/);
  ok(call(T.owner, 'clientEnvoyer', 's@sigma.dz', r.message, 'Sigma'));
  assert.ok(env.mails.some((m) => m.to === 's@sigma.dz' && m.body.includes(r.admin.password) && /Sigma/.test(m.subject)));
  const other = ok(call(null, 'login', 'o@omega.dz', 'omegapass1', 'OMEGA')).token;
  fail(call(other, 'clientEnvoyer', 'x@y.fr', r.message, 'S'), /réservé|Accès|autoris/i);
});
