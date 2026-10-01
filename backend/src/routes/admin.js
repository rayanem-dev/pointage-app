const router = require('express').Router();
const { wrap } = require('../middleware');
const agentsSvc = require('../services/agents');
const cs = require('../services/contrats');
const { DEFS, getParams, setParams } = require('../services/params');
const { listTabs } = require('../store');

router.get('/agents', wrap(async (req, res) => res.json((await agentsSvc.list()).map(agentsSvc.publicAgent))));
router.post('/agents', wrap(async (req, res) => res.status(201).json(await agentsSvc.create(req.body))));
router.put('/agents/:id', wrap(async (req, res) => res.json(await agentsSvc.update(req.params.id, req.body))));
router.post('/agents/:id/password', wrap(async (req, res) => { await agentsSvc.setPassword(req.params.id, String(req.body.password || '')); res.json({ ok: true }); }));

router.get('/params', wrap(async (req, res) => res.json({ defs: DEFS.map(({ def, ...d }) => d), values: await getParams() })));
router.put('/params', wrap(async (req, res) => res.json(await setParams(req.body))));

router.get('/contrats', wrap(async (req, res) => res.json({ contrats: await cs.contrats(), fonctions: await cs.fonctions() })));
router.put('/contrats', wrap(async (req, res) => res.json({ contrats: await cs.saveContrats(req.body.contrats), fonctions: await cs.saveFonctions(req.body.fonctions) })));
router.put('/attachement-qte', wrap(async (req, res) => { await cs.saveOverride(req.body); res.json({ ok: true }); }));

router.get('/mois', wrap(async (req, res) => res.json((await listTabs()).filter((t) => /^\d{4}-\d{2}$/.test(t)).sort())));

module.exports = router;
