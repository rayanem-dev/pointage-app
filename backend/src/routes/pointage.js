const router = require('express').Router();
const { role, wrap } = require('../middleware');
const agentsSvc = require('../services/agents');
const pointage = require('../services/pointage');
const { today } = require('../lib/dates');

// Grille d'un mois : admin = tous, chef = son groupe, agent = lui-même.
router.get('/grid', wrap(async (req, res) => {
  const month = req.query.month || today().slice(0, 7);
  let list = await agentsSvc.visibleTo(req.user);
  if (req.query.contrat) list = list.filter((a) => a.contrat === req.query.contrat);
  res.json(await pointage.grid(month, list));
}));

// Pointage d'un agent (formulaire du chef de groupe) : un jour ou une période.
router.post('/', role('chef', 'admin'), wrap(async (req, res) => {
  const { agent_id: agentId, date, date_fin: to, statut } = req.body;
  const allowed = await agentsSvc.visibleTo(req.user);
  if (!allowed.some((a) => a.id === agentId)) return res.status(403).json({ error: "Cet agent n'est pas dans votre groupe" });
  res.json(await pointage.setStatus({ agentId, from: date, to, statut: statut || '' }));
}));

module.exports = router;
