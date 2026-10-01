const router = require('express').Router();
const { wrap, role } = require('../middleware');
const dd = require('../services/documents-data');
const agentsSvc = require('../services/agents');
const fiche = require('../exports/fiche');
const attachement = require('../exports/attachement');
const facture = require('../exports/facture');

const MIME = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' };
const slug = (s) => String(s).replace(/[^\w.-]+/g, '_');

// GET /api/exports/fiche|attachement|facture?month=AAAA-MM&format=xlsx|pdf&contrat=...
router.get('/:doc', role('chef', 'admin'), wrap(async (req, res) => {
  const { doc } = req.params; const { month, contrat } = req.query;
  const format = req.query.format === 'pdf' ? 'pdf' : 'xlsx';
  if (doc !== 'fiche' && req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
  let buf; let name;
  if (doc === 'fiche') {
    const visible = await agentsSvc.visibleTo(req.user);
    const data = await dd.ficheData(month, contrat, { prevu: req.query.prevu === '1', agents: visible });
    buf = await fiche[format](data); name = `Fiche_pointage_${month}`;
  } else if (doc === 'attachement') {
    const data = await dd.attachementData(month, contrat);
    buf = await attachement[format](data); name = `Attachement_N${data.numero}_${month}`;
  } else if (doc === 'facture') {
    const data = await dd.factureData(month, contrat, { facture_numero: req.query.facture_numero, date: req.query.date });
    buf = await facture[format](data); name = `Facture_${slug(data.facture_numero || month)}`;
  } else return res.status(404).json({ error: 'Document inconnu' });
  res.setHeader('Content-Type', MIME[format]);
  res.setHeader('Content-Disposition', `attachment; filename="${slug(name)}.${format}"`);
  return res.send(buf);
}));

// Aperçu des quantités de l'attachement (avant export).
router.get('/preview/attachement', role('admin'), wrap(async (req, res) => {
  res.json(await dd.attachementData(req.query.month, req.query.contrat));
}));

module.exports = router;
