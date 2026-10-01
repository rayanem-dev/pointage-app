const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { wrap, role } = require('../middleware');
const store = require('../store');
const agentsSvc = require('../services/agents');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../data/uploads'));
const TYPES = ['fiche_paie', 'attestation_travail', 'autre'];
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); cb(null, UPLOAD_DIR); },
    filename: (req, file, cb) => cb(null, `${agentsSvc.newId('F')}${path.extname(file.originalname).toLowerCase().slice(0, 8)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const canSee = async (user, agentId) => user.role === 'admin' || user.id === agentId || (await agentsSvc.visibleTo(user)).some((a) => a.id === agentId);

// Documents d'un agent (par défaut : les siens). Chef/admin : ?agent_id=
router.get('/', wrap(async (req, res) => {
  const agentId = req.query.agent_id || req.user.id;
  if (!(await canSee(req.user, agentId))) return res.status(403).json({ error: 'Accès refusé' });
  const docs = (await store.readTable('Documents')).filter((d) => d.agent_id === agentId);
  res.json(docs.sort((a, b) => b.date.localeCompare(a.date)).map(({ fichier, ...d }) => d));
}));

router.post('/', role('chef', 'admin'), upload.single('fichier'), wrap(async (req, res) => {
  const cleanup = () => req.file && fs.unlink(req.file.path, () => {});
  const { agent_id: agentId, type, titre } = req.body;
  if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });
  if (!(await agentsSvc.visibleTo(req.user)).some((a) => a.id === agentId)) { cleanup(); return res.status(403).json({ error: "Cet agent n'est pas dans votre groupe" }); }
  if (!TYPES.includes(type)) { cleanup(); return res.status(400).json({ error: 'Type de document invalide' }); }
  const d = { id: agentsSvc.newId('G'), agent_id: agentId, type, titre: String(titre || req.file.originalname).trim(), fichier: req.file.filename, nom_original: req.file.originalname, depose_par: req.user.nom, date: new Date().toISOString() };
  await store.withLock(async () => store.writeTable('Documents', [...(await store.readTable('Documents')), d]));
  const { fichier, ...pub } = d;
  res.status(201).json(pub);
}));

router.get('/:id/file', wrap(async (req, res) => {
  const d = (await store.readTable('Documents')).find((x) => x.id === req.params.id);
  if (!d || !(await canSee(req.user, d.agent_id))) return res.status(404).json({ error: 'Document introuvable' });
  const f = path.join(UPLOAD_DIR, path.basename(d.fichier));
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'Fichier absent du serveur' });
  res.download(f, d.nom_original);
}));

router.delete('/:id', role('chef', 'admin'), wrap(async (req, res) => {
  const all = await store.readTable('Documents');
  const d = all.find((x) => x.id === req.params.id);
  if (!d || !(await canSee(req.user, d.agent_id)) || d.agent_id === req.user.id && req.user.role !== 'admin') return res.status(404).json({ error: 'Document introuvable' });
  await store.withLock(async () => store.writeTable('Documents', (await store.readTable('Documents')).filter((x) => x.id !== d.id)));
  fs.unlink(path.join(UPLOAD_DIR, path.basename(d.fichier)), () => {});
  res.json({ ok: true });
}));

module.exports = router;
