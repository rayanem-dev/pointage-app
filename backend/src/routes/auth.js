const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { sign, auth, wrap } = require('../middleware');
const agentsSvc = require('../services/agents');

// Limitation basique des tentatives de connexion (par email).
const attempts = new Map();

router.post('/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const rec = attempts.get(email) || { n: 0, at: Date.now() };
  if (rec.n >= 8 && Date.now() - rec.at < 15 * 60000) return res.status(429).json({ error: 'Trop de tentatives, réessayez plus tard' });
  const user = (await agentsSvc.list()).find((a) => a.email.toLowerCase() === email && a.actif === '1');
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash || ''))) {
    attempts.set(email, { n: rec.n + 1, at: rec.n ? rec.at : Date.now() });
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  attempts.delete(email);
  return res.json({ token: sign(user), user: agentsSvc.publicAgent(user) });
}));

router.get('/me', auth, (req, res) => res.json({ user: agentsSvc.publicAgent(req.user) }));

router.post('/password', auth, wrap(async (req, res) => {
  if (!(await bcrypt.compare(String(req.body.current || ''), req.user.password_hash))) return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  await agentsSvc.setPassword(req.user.id, String(req.body.next || ''));
  res.json({ ok: true });
}));

module.exports = router;
