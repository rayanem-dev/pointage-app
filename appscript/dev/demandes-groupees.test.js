const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };

test('demandes groupées : le responsable crée « Certificat de travail » pour 3 agents, un seul message part à la direction avec la liste', () => {
  const app = loadApp(); const call = app.call;
  app.run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  const admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  ok(call(admin, 'agentCreate', { nom: 'CHEF EQ', email: 'chef@t.fr', role: 'chef', password: 'chefpw1234' }));
  const chefId = ok(call(admin, 'agentsVisible')).find((a) => a.email === 'chef@t.fr').id;
  const noms = ['AGENT UN', 'AGENT DEUX', 'AGENT TROIS'];
  noms.forEach((n, i) => ok(call(admin, 'agentCreate', { nom: n, email: 'a' + i + '@t.fr', role: 'agent', password: 'agentpw123', chef_id: chefId })));
  ok(call(admin, 'typesDemandeSave', { builtin: {}, custom: [{ label: 'Certificat de travail', doc: 'certificat_travail' }] }));
  const chef = ok(call(null, 'login', 'chef@t.fr', 'chefpw1234')).token;
  const cle = ok(call(chef, 'demandesList')).proposes.find((k) => /certificat/.test(k));
  assert.ok(cle, 'le type ajouté est proposé au responsable');
  const equipe = ok(call(chef, 'agentsVisible', true)).filter((a) => a.role === 'agent');
  assert.strictEqual(equipe.length, 3);
  equipe.forEach((a) => ok(call(chef, 'demandeCreate', { type: cle, agent_id: a.id })));
  const r = ok(call(chef, 'demandesEnvoyer', [], ''));
  assert.strictEqual(r.envoi.nb, 3, 'une seule demande, 3 agents');
  const texte = JSON.stringify(r);
  noms.forEach((n) => assert.ok(texte.includes(n), 'le message cite ' + n));
  assert.ok(/Certificat de travail/.test(texte));
});
