const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const store = require('../store');

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const newId = (p) => `${p}${crypto.randomBytes(4).toString('hex')}`;
const ROLES = ['agent', 'chef', 'admin'];

const list = () => store.readTable('Agents');
const publicAgent = ({ password_hash, ...a }) => a;

async function get(id) { return (await list()).find((a) => a.id === id); }

async function create(data) {
  const nom = (data.nom || '').trim();
  const email = (data.email || '').trim().toLowerCase();
  const role = data.role || 'agent';
  if (!nom) throw httpErr(400, 'Nom obligatoire');
  if (!ROLES.includes(role)) throw httpErr(400, 'Rôle invalide');
  if (!/^\S+@\S+$/.test(email)) throw httpErr(400, 'Email invalide');
  return store.withLock(async () => {
    const all = await list();
    if (all.some((a) => a.email.toLowerCase() === email)) throw httpErr(409, 'Email déjà utilisé');
    const password = data.password || crypto.randomBytes(5).toString('hex');
    const agent = {
      id: newId('A'), nom, fonction: data.fonction || '', affectation: data.affectation || '', contrat: data.contrat || '',
      email, role, chef_id: data.chef_id || '', actif: '1', password_hash: await bcrypt.hash(password, 10), date_entree: data.date_entree || '',
    };
    await store.writeTable('Agents', [...all, agent]);
    return { agent: publicAgent(agent), password };
  });
}

async function update(id, data) {
  return store.withLock(async () => {
    const all = await list();
    const a = all.find((x) => x.id === id);
    if (!a) throw httpErr(404, 'Agent introuvable');
    for (const k of ['nom', 'fonction', 'affectation', 'contrat', 'chef_id', 'date_entree']) if (data[k] !== undefined) a[k] = String(data[k]).trim();
    if (data.email !== undefined) {
      const email = String(data.email).trim().toLowerCase();
      if (!/^\S+@\S+$/.test(email)) throw httpErr(400, 'Email invalide');
      if (all.some((x) => x.id !== id && x.email.toLowerCase() === email)) throw httpErr(409, 'Email déjà utilisé');
      a.email = email;
    }
    if (data.role !== undefined) {
      if (!ROLES.includes(data.role)) throw httpErr(400, 'Rôle invalide');
      if (a.role === 'admin' && data.role !== 'admin' && all.filter((x) => x.role === 'admin' && x.actif === '1').length < 2) throw httpErr(400, 'Il faut au moins un administrateur');
      a.role = data.role;
    }
    if (data.actif !== undefined) {
      const actif = data.actif === true || data.actif === '1' || data.actif === 1 ? '1' : '0';
      if (actif === '0' && a.role === 'admin' && all.filter((x) => x.role === 'admin' && x.actif === '1').length < 2) throw httpErr(400, 'Il faut au moins un administrateur');
      a.actif = actif;
    }
    await store.writeTable('Agents', all);
    return publicAgent(a);
  });
}

async function setPassword(id, password) {
  if (!password || password.length < 6) throw httpErr(400, 'Mot de passe : 6 caractères minimum');
  return store.withLock(async () => {
    const all = await list();
    const a = all.find((x) => x.id === id);
    if (!a) throw httpErr(404, 'Agent introuvable');
    a.password_hash = await bcrypt.hash(password, 10);
    await store.writeTable('Agents', all);
  });
}

async function ensureAdmin() {
  const all = await list();
  if (all.some((a) => a.role === 'admin')) return null;
  const email = (process.env.ADMIN_EMAIL || 'admin@acosco.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'changeme';
  await store.writeTable('Agents', [...all, {
    id: newId('A'), nom: 'Administrateur', fonction: '', affectation: '', contrat: '', email, role: 'admin', chef_id: '', actif: '1',
    password_hash: await bcrypt.hash(password, 10), date_entree: '',
  }]);
  return { email, defaultPassword: !process.env.ADMIN_PASSWORD };
}

// Agents visibles par un utilisateur : admin = tous, chef = son groupe + lui-même, agent = lui-même.
async function visibleTo(user) {
  const all = (await list()).filter((a) => a.actif === '1' && a.role !== 'admin');
  if (user.role === 'admin') return all;
  if (user.role === 'chef') return all.filter((a) => a.chef_id === user.id || a.id === user.id);
  return all.filter((a) => a.id === user.id);
}

module.exports = { list, get, create, update, setPassword, ensureAdmin, visibleTo, publicAgent, httpErr, newId, ROLES };
