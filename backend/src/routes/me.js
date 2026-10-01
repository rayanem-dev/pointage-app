const router = require('express').Router();
const { wrap } = require('../middleware');
const store = require('../store');
const pointage = require('../services/pointage');
const { getParams, publicParams } = require('../services/params');
const agentsSvc = require('../services/agents');

router.get('/params', wrap(async (req, res) => res.json(publicParams(await getParams()))));

// Page d'accueil de l'agent : statistiques, cycle, grille du mois, demandes, documents.
router.get('/overview', wrap(async (req, res) => {
  const u = req.user;
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
  const [ov, grid, demandes, docs, params] = await Promise.all([
    pointage.agentOverview(u), pointage.grid(month, [u]), store.readTable('Demandes'), store.readTable('Documents'), getParams(),
  ]);
  const chef = u.chef_id ? await agentsSvc.get(u.chef_id) : null;
  const mine = demandes.filter((d) => d.agent_id === u.id);
  res.json({
    agent: agentsSvc.publicAgent(u), chef: chef ? { id: chef.id, nom: chef.nom } : null, ...ov, grid: grid.rows[0], month, nd: grid.nd, label: grid.label,
    rotation: { travail: Number(params.jours_travail), repos: Number(params.jours_repos) },
    demandes: { total: mine.length, en_attente: mine.filter((d) => d.statut === 'en_attente').length },
    documents: docs.filter((d) => d.agent_id === u.id).length,
  });
}));

module.exports = router;
