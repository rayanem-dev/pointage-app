const router = require('express').Router();
const { wrap, role } = require('../middleware');
const store = require('../store');
const agentsSvc = require('../services/agents');

const TYPES = ['conge', 'absence', 'attestation', 'fiche_paie', 'autre'];
const STATUTS = ['en_attente', 'acceptee', 'refusee', 'traitee'];

async function visible(user) {
  const [all, agents] = await Promise.all([store.readTable('Demandes'), agentsSvc.list()]);
  const byId = new Map(agents.map((a) => [a.id, a]));
  const rows = all.filter((d) => {
    if (user.role === 'admin') return true;
    if (d.agent_id === user.id) return true;
    const ag = byId.get(d.agent_id);
    return user.role === 'chef' && d.destinataire === 'chef' && ag && ag.chef_id === user.id;
  }).map((d) => ({ ...d, agent_nom: (byId.get(d.agent_id) || {}).nom || '?', agent_fonction: (byId.get(d.agent_id) || {}).fonction || '' }));
  return rows.sort((a, b) => b.date_creation.localeCompare(a.date_creation));
}

router.get('/', wrap(async (req, res) => res.json(await visible(req.user))));

router.post('/', wrap(async (req, res) => {
  const { type, objet, message } = req.body;
  let { destinataire } = req.body;
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'Type de demande invalide' });
  if (!String(objet || '').trim()) return res.status(400).json({ error: 'Objet obligatoire' });
  if (destinataire === 'chef' && !req.user.chef_id) destinataire = 'admin';
  if (!['chef', 'admin'].includes(destinataire)) destinataire = req.user.chef_id ? 'chef' : 'admin';
  const d = { id: agentsSvc.newId('D'), agent_id: req.user.id, type, objet: String(objet).trim(), message: String(message || '').trim(), destinataire, date_creation: new Date().toISOString(), statut: 'en_attente', reponse: '', traite_par: '', date_traitement: '' };
  await store.withLock(async () => store.writeTable('Demandes', [...(await store.readTable('Demandes')), d]));
  res.status(201).json(d);
}));

// Traitement : destinataire (chef de l'agent ou admin).
router.put('/:id', role('chef', 'admin'), wrap(async (req, res) => {
  const { statut, reponse } = req.body;
  if (!STATUTS.includes(statut) || statut === 'en_attente') return res.status(400).json({ error: 'Statut invalide' });
  const mine = (await visible(req.user)).find((d) => d.id === req.params.id);
  if (!mine || (req.user.role === 'chef' && (mine.destinataire !== 'chef' || mine.agent_id === req.user.id))) return res.status(403).json({ error: 'Demande non accessible' });
  const out = await store.withLock(async () => {
    const all = await store.readTable('Demandes');
    const d = all.find((x) => x.id === req.params.id);
    Object.assign(d, { statut, reponse: String(reponse || ''), traite_par: req.user.nom, date_traitement: new Date().toISOString() });
    await store.writeTable('Demandes', all);
    return d;
  });
  res.json(out);
}));

module.exports = router;
