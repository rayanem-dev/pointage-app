// Lecture et renommage sur le poste (dev/local.js + moteur dev/autodetect-renommage.js) : sans navigateur, texte fourni.
const test = require('node:test'); const assert = require('node:assert'); const fs = require('fs'); const path = require('path'); const vm = require('vm');
const AutoDetectDoc = require('./autodetect-renommage.js');
const ctx = vm.createContext({ AutoDetectDoc, console, Uint8Array, TextEncoder, btoa, Blob, window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, 'local.js'), 'utf8') + '\nthis.SijilLocal = SijilLocal;', ctx);
const L = ctx.SijilLocal;
const agents = [{ id: 'A1', nom: 'MEZIANE Sofiane' }, { id: 'A2', nom: 'DURAND Marc Antoine' }];
const fichier = (nom, txt = 'x') => ({ name: nom, type: 'application/pdf', arrayBuffer: async () => new TextEncoder().encode(txt).buffer });

test('Detecter.html est à jour (moteur + lecture locale)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'Detecter.html'), 'utf8');
  assert.ok(html.includes(fs.readFileSync(path.join(__dirname, 'autodetect-renommage.js'), 'utf8')) && html.includes(fs.readFileSync(path.join(__dirname, 'local.js'), 'utf8')), 'relancer node dev/gen-detecter.js');
  assert.ok(!/<\?|\?>|<\/script/.test(fs.readFileSync(path.join(__dirname, 'local.js'), 'utf8') + fs.readFileSync(path.join(__dirname, 'autodetect-renommage.js'), 'utf8')), 'séquences interdites dans une page Apps Script');
});

test('nom suffisant : pas de lecture du contenu', async () => {
  const it = await L.analyser(fichier('MEZIANE_Sofiane_CertificatTravail_2025-05-01.pdf'), { agents, texte: 'JAMAIS LU' });
  assert.deepStrictEqual([it.type, it.agent.id, it.champs.date, it.lu], ['certificat_travail', 'A1', '2025-05-01', false]);
  assert.strictEqual(L.nomDe(it), 'MEZIANE_Sofiane_CertificatTravail_2025-05-01.pdf');
});

test('scan Doc0239.pdf : type, agent et date lus dans le contenu, nom proposé', async () => {
  const it = await L.analyser(fichier('Doc0239.pdf'), { agents, texte: 'Certificat de travail Nom : DURAND Prénom : Marc Antoine Date et lieu de naissance 01/01/1980. Fait à Alger, le 14 février 2026' });
  assert.deepStrictEqual([it.type, it.agent && it.agent.id, it.champs.date, it.lu], ['certificat_travail', 'A2', '2026-02-14', true]);
  assert.match(L.nomDe(it), /^DURAND_Marc.*_CertificatTravail_2026-02-14\.pdf$/);
});

test('case « agent » décochée : aucun agent proposé', async () => {
  const it = await L.analyser(fichier('Doc1.pdf'), { agents, reconnaitreAgent: false, texte: 'Certificat de travail DURAND Marc Antoine fait a alger, le 01/05/2025' });
  assert.strictEqual(it.agent, null); assert.strictEqual(it.type, 'certificat_travail'); assert.strictEqual(it.candidats.length, 0);
});

test('document illisible : classé « Autre », avertissement, le serveur prendra le relais', async () => {
  const it = await L.analyser(fichier('Doc2.pdf'), { agents, texte: '' });
  assert.strictEqual(it.type, 'autre'); assert.ok(/Aucun texte lu|non reconnu/i.test(it.avertissement));
});

test('noms uniques dans la liste', async () => {
  const a = await L.analyser(fichier('MEZIANE_Sofiane_CertificatTravail_2025-05-01.pdf'), { agents });
  const b = await L.analyser(fichier('Copie MEZIANE Sofiane certificat de travail 2025-05-01.pdf'), { agents });
  const n = L.nomsUniques([a, b]); assert.strictEqual(new Set(n).size, 2, n.join(' | '));
});

test('archive .zip valide (entrées sans compression, CRC32 exacts)', () => {
  const z = Buffer.from(L.zip([{ nom: 'é_a.pdf', octets: Buffer.from('bonjour') }, { nom: 'b.pdf', octets: Buffer.from('monde') }]));
  assert.strictEqual(z.readUInt32LE(z.length - 22), 0x06054b50); assert.strictEqual(z.readUInt16LE(z.length - 22 + 10), 2);
  const tmp = path.join(require('os').tmpdir(), 'sijil-test-' + process.pid + '.zip'); fs.writeFileSync(tmp, z);
  const r = require('child_process').spawnSync('python3', ['-I', '-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(sorted(z.namelist()), z.read("b.pdf"))', tmp], { encoding: 'utf8' });
  fs.unlinkSync(tmp); assert.strictEqual(r.status, 0, r.stderr); assert.match(r.stdout, /b\.pdf/); assert.match(r.stdout, /monde/);
});
