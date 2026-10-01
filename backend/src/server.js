const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const { auth, role } = require('./middleware');
const agentsSvc = require('./services/agents');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'OK', storage: process.env.STORAGE || 'sheets' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/me', auth, require('./routes/me'));
app.use('/api/pointage', auth, require('./routes/pointage'));
app.use('/api/demandes', auth, require('./routes/demandes'));
app.use('/api/documents', auth, require('./routes/documents'));
app.use('/api/exports', auth, require('./routes/exports'));
app.use('/api/admin', auth, role('admin'), require('./routes/admin'));
// Liste des agents (pour les listes déroulantes du chef de groupe).
app.get('/api/agents', auth, role('chef', 'admin'), async (req, res, next) => {
  try { res.json((await agentsSvc.visibleTo(req.user)).map(agentsSvc.publicAgent)); } catch (e) { next(e); }
});

// Frontend compilé (déploiement mono-serveur)
const dist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((req, res) => res.status(404).json({ error: 'Route introuvable' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Fichier trop volumineux (10 Mo max)' });
  console.error(err);
  return res.status(500).json({ error: 'Erreur serveur' });
});

async function start() {
  const created = await agentsSvc.ensureAdmin();
  if (created) console.log(`Compte admin créé : ${created.email}${created.defaultPassword ? ' (mot de passe par défaut "changeme" — à changer !)' : ''}`);
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`Serveur démarré sur le port ${port}`));
}

if (require.main === module) start().catch((e) => { console.error('Échec du démarrage :', e.message); process.exit(1); });
module.exports = { app, start };
