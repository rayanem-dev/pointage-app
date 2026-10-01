const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const agentsSvc = require('./services/agents');

const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) console.warn('⚠ JWT_SECRET non défini : les sessions seront perdues au redémarrage.');

const sign = (a) => jwt.sign({ id: a.id }, SECRET, { expiresIn: '12h' });

async function auth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
    if (!token) return res.status(401).json({ error: 'Non authentifié' });
    const { id } = jwt.verify(token, SECRET);
    const user = await agentsSvc.get(id);
    if (!user || user.actif !== '1') return res.status(401).json({ error: 'Compte inactif' });
    req.user = user;
    return next();
  } catch (e) { return res.status(401).json({ error: 'Session expirée' }); }
}

const role = (...roles) => (req, res, next) => (roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Accès refusé' }));
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { sign, auth, role, wrap };
