const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp, DIR } = require('./load');

// Faux GitHub (contenu = vrais fichiers du dossier) + faux API Apps Script.
function setup({ githubCode = 200, apiCode = 200, apiBody = '', skip = [] } = {}) {
  const app = loadApp();
  const files = fs.readdirSync(DIR).filter((f) => /\.(gs|html)$|^appsscript\.json$/.test(f) && !skip.includes(f));
  const project = { files: [{ name: 'Code', type: 'SERVER_JS', source: 'function installerDepuisGitHub(){}' }, { name: 'Notes', type: 'SERVER_JS', source: '// à moi' }] };
  const put = [];
  const serve = (name) => {
    if (name === 'files.json') return { code: 200, body: JSON.stringify([...files, 'README.md', 'dev']) };
    if (!files.includes(name)) return { code: 404, body: '' };
    return { code: 200, body: fs.readFileSync(path.join(DIR, name), 'utf8') };
  };
  const RAW = 'https://raw.githubusercontent.com/rayanem-dev/pointage-app/main/appscript/';
  app.env.fetchHandler = (url, opts) => {
    if (url.startsWith('https://api.github.com/')) { // chemin avec jeton (dépôt privé)
      if (githubCode !== 200) return { code: githubCode, body: '{}' };
      return serve(url.split('/contents/appscript/')[1].split('?')[0]);
    }
    if (url.startsWith(RAW)) { if (githubCode !== 200) return { code: githubCode, body: '' }; return serve(url.slice(RAW.length)); }
    if (url === 'https://script.googleapis.com/v1/projects/SCRIPT123/content') {
      assert.match(opts.headers.Authorization, /^Bearer /);
      if (apiCode !== 200) return { code: apiCode, body: apiBody };
      if (opts.method === 'get') return { code: 200, body: JSON.stringify(project) };
      put.push(JSON.parse(opts.payload)); return { code: 200, body: opts.payload };
    }
    return null;
  };
  return { ...app, put };
}

test('installe tous les fichiers du dépôt avec les bons types', () => {
  const t = setup();
  const msg = t.run('installerDepuisGitHub()');
  assert.match(msg, /Code installé : 32 fichiers/);
  const sent = t.put[0].files;
  const by = Object.fromEntries(sent.map((f) => [f.name, f]));
  assert.strictEqual(by.Main.type, 'SERVER_JS'); assert.strictEqual(by.Index.type, 'HTML'); assert.strictEqual(by.appsscript.type, 'JSON');
  assert.ok(by.Installer, "l'installateur reste dans le projet (mises à jour)");
  assert.ok(!by.dev && !by.README && !by['.claspignore'], 'dev/, README et .claspignore ne sont pas copiés');
  assert.ok(!by.Code, "l'ébauche « Code » (installateur collé à la main) est remplacée");
  assert.strictEqual(by.Notes.source, '// à moi', 'un fichier perso inconnu est conservé');
  assert.strictEqual(by.Main.source, fs.readFileSync(path.join(DIR, 'Main.gs'), 'utf8'), 'contenu identique au dépôt');
  assert.ok(JSON.parse(by.appsscript.source).oauthScopes.includes('https://www.googleapis.com/auth/script.projects'));
});

test('téléchargement incomplet : le projet n\'est pas modifié', () => {
  const t = setup({ skip: ['Store.gs'] });
  assert.match(t.run('installerDepuisGitHub()'), /fichiers manquants : Store/);
  assert.strictEqual(t.put.length, 0);
});

test('erreurs claires : dépôt introuvable, API désactivée, autorisation', () => {
  assert.match(setup({ githubCode: 404 }).run('installerDepuisGitHub()'), /GITHUB_TOKEN/);
  assert.match(setup({ githubCode: 403 }).run('installerDepuisGitHub()'), /trop de demandes/);
  assert.match(setup({ apiCode: 403, apiBody: 'Apps Script API has not been used in project' }).run('installerDepuisGitHub()'), /clasp/);
  assert.match(setup({ apiCode: 403, apiBody: 'forbidden' }).run('installerDepuisGitHub()'), /manifeste/);
});

test('sans jeton : raw.githubusercontent.com (jamais api.github.com, limité à 60/h par IP)', () => {
  const t = setup(); t.run('installerDepuisGitHub()');
  const gh = t.env.fetches.filter((u) => /github/.test(u));
  assert.ok(gh.length >= 21 && gh.every((u) => u.startsWith('https://raw.githubusercontent.com/')), gh.slice(0, 2).join(' '));
});

test('files.json = liste exacte des fichiers du dossier (sinon l\'installateur serait périmé)', () => {
  const real = fs.readdirSync(DIR).filter((f) => /\.(gs|html)$|^appsscript\.json$/.test(f)).sort();
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(DIR, 'files.json'), 'utf8')), real);
});

test('jeton GitHub facultatif : API authentifiée ; menu de mise à jour présent', () => {
  const t = setup(); const seen = [];
  const h = t.env.fetchHandler; t.env.fetchHandler = (u, o) => { if (u.startsWith('https://api.github.com/')) seen.push(o.headers.Authorization); return h(u, o); };
  t.env.props.GITHUB_TOKEN = 'ghp_x'; t.run('installerDepuisGitHub()');
  assert.ok(seen.length > 5 && seen.every((a) => a === 'Bearer ghp_x'));
  assert.match(fs.readFileSync(path.join(DIR, 'Setup.gs'), 'utf8'), /Mettre à jour le code depuis GitHub', 'installerDepuisGitHub'/);
});
