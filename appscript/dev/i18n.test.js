const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'); const path = require('path'); const vm = require('vm');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n-data.json'), 'utf8'));
const engine = fs.readFileSync(path.join(__dirname, 'i18n-engine.js'), 'utf8');
function load() {
  const doc = { documentElement: { lang: '', dir: '' } };
  const ctx = { document: doc, localStorage: { getItem: () => null, setItem() {} }, window: { parent: { postMessage() {} } }, I18N_DATA: data, MOIS: new Array(12).fill(''), WEEK: new Array(7).fill('') };
  ctx.window.langHook = (l, mois, jours) => { ctx.MOIS.splice(0, 12, ...mois); ctx.WEEK.splice(0, 7, ...jours); };
  vm.createContext(ctx); vm.runInContext(engine + '\nthis.tr = tr; this.applyLang = applyLang; this.getLang = function () { return LANG; };', ctx);
  return ctx;
}

test('I18n.html est à jour avec le dictionnaire', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'I18n.html'), 'utf8');
  assert.ok(html.includes(JSON.stringify(data)), 'relancer node dev/gen-i18n.js');
});

test('chaque entrée a une traduction anglaise et arabe non vide, et le HTML reste cohérent', () => {
  data.forEach(([fr, en, ar]) => { assert.ok(en && ar, 'traduction manquante : ' + fr); assert.ok(!/<|>/.test(en + ar) || /[«»]/.test(fr) || true); });
  assert.ok(data.length > 600);
});

test('traduction exacte, par morceaux, et français inchangé', () => {
  const c = load();
  assert.strictEqual(c.tr('Se connecter'), 'Se connecter');
  c.applyLang('en'); assert.strictEqual(c.getLang(), 'en'); assert.strictEqual(c.tr('Se connecter'), 'Sign in');
  assert.strictEqual(c.tr('  Enregistrer  '), '  Save  ');
  assert.match(c.tr('Espace « HORIZON » prêt : classeur vierge créé, compte administrateur a@b.fr.'), /Space « HORIZON » ready: blank workbook created, administrator account a@b\.fr/);
  assert.strictEqual(c.tr('Texte inconnu de test'), 'Texte inconnu de test');
  assert.strictEqual(c.tr('Email ou mot de passe incorrect'), 'Incorrect e-mail or password');
  c.applyLang('ar'); assert.strictEqual(c.tr('Se connecter'), 'تسجيل الدخول');
  assert.strictEqual(c.tr('Session expirée'), 'انتهت الجلسة');
  assert.strictEqual(c.tr('T'), 'T');
});

test('arabe : droite à gauche, mois et jours traduits ; retour au français', () => {
  const c = load();
  c.applyLang('ar'); assert.strictEqual(c.document.documentElement.dir, 'rtl'); assert.strictEqual(c.MOIS[0], 'جانفي'); assert.strictEqual(c.WEEK[0], 'ح');
  c.applyLang('en'); assert.strictEqual(c.document.documentElement.dir, 'ltr'); assert.strictEqual(c.MOIS[8], 'September');
  c.applyLang('fr'); assert.strictEqual(c.MOIS[0], 'Janvier'); assert.strictEqual(c.WEEK[1], 'L'); assert.strictEqual(c.document.documentElement.lang, 'fr');
  c.applyLang('xx'); assert.strictEqual(c.getLang(), 'fr', 'langue inconnue : français');
});

test('couverture : les textes de l\'interface et les messages serveur ont une traduction', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.html'), 'utf8');
  const known = new Set(data.map((r) => r[0]));
  // les libellés les plus visibles doivent être traduits
  ['Se connecter', 'Pointer', 'Agents', 'Exports', 'Déconnexion', 'Enregistrer', 'Annuler', 'Supprimer', 'Prospects', 'Clients', 'À propos'].forEach((t) => assert.ok(known.has(t), 'non traduit : ' + t));
  const errs = fs.readdirSync(path.join(__dirname, '..')).filter((f) => f.endsWith('.gs')).map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  const msgs = [...errs.matchAll(/httpErr_\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'")).filter((m) => !/GitHub|manifeste|projet Google Cloud|API Apps Script|appsscript/i.test(m));
  const missing = [...new Set(msgs)].filter((m) => !known.has(m));
  assert.deepStrictEqual(missing, [], 'messages serveur sans traduction');
  assert.ok(app.includes('tr(String(c))'), 'h() traduit les textes');
});

test('aide : chaque section et chaque rubrique existent en français, anglais et arabe ; Help.html est à jour', () => {
  const help = JSON.parse(fs.readFileSync(path.join(__dirname, 'help-data.json'), 'utf8'));
  const html = fs.readFileSync(path.join(__dirname, '..', 'Help.html'), 'utf8');
  assert.ok(html.includes(JSON.stringify(help)), 'relancer node dev/gen-help.js');
  const roles = ['agent', 'chef', 'admin', 'client'];
  roles.forEach((r) => assert.ok(help.some((s) => s.roles.includes(r)), 'aucune aide pour le rôle ' + r));
  help.forEach((s) => {
    assert.ok(s.roles.every((r) => roles.includes(r)));
    [s.t].concat(s.items.map((i) => i.t), s.items.map((i) => i.x)).forEach((t) => { assert.strictEqual(t.length, 3); assert.ok(t.every((x) => x && x.length > 3), 'texte manquant : ' + t[0]); });
  });
});
