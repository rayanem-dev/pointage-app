const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const { call, run } = loadApp();
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); return r; };

test('demandes : décision directe modifiable, annulable, supprimable ; jamais une demande transmise à la direction', () => {
  run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  const admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  ok(call(admin, 'agentCreate', { nom: 'AGENT DEM', email: 'ad@t.fr', role: 'agent', password: 'agentpw123' }));
  ok(call(admin, 'agentCreate', { nom: 'AUTRE DEM', email: 'ae@t.fr', role: 'agent', password: 'agentpw123' }));
  const ag = ok(call(null, 'login', 'ad@t.fr', 'agentpw123')).token;
  const ae = ok(call(null, 'login', 'ae@t.fr', 'agentpw123')).token;
  const d1 = ok(call(ag, 'demandeCreate', { type: 'titre_conge', date_debut: '2026-11-01', date_fin: '2026-11-28' }));
  const d2 = ok(call(ag, 'demandeCreate', { type: 'attestation_cnas' }));
  const d3 = ok(call(ag, 'demandeCreate', { type: 'contrat' }));
  const d4 = ok(call(ag, 'demandeCreate', { type: 'attestation_cnas' }));
  // acceptation directe puis correction
  ok(call(admin, 'demandeRepondre', d1.id, 'acceptee', 'ok'));
  const m = ok(call(admin, 'demandeModifier', d1.id, { date_fin: '2026-12-05', statut: 'traitee', reponse: 'fait' }));
  assert.deepStrictEqual([m.date_fin, m.statut, m.reponse], ['2026-12-05', 'traitee', 'fait']);
  fail(call(admin, 'demandeModifier', d1.id, { statut: 'envoyee' }), /Statut invalide/);
  // l'agent ne modifie pas une demande décidée, ni celle d'un autre
  fail(call(ag, 'demandeModifier', d1.id, { message: 'x' }), /ne peut plus/);
  fail(call(ae, 'demandeSupprimer', d2.id), /accessible/);
  // annuler la décision : redevient en attente
  const r = ok(call(admin, 'demandeReouvrir', d1.id));
  assert.deepStrictEqual([r.statut, r.reponse, r.traite_par], ['en_attente', '', '']);
  fail(call(ag, 'demandeReouvrir', d1.id), /Accès|refusé|accessible/i);
  // suppression : par l'agent (en attente), par le responsable (décision directe)
  ok(call(ag, 'demandeSupprimer', d2.id));
  ok(call(admin, 'demandeRepondre', d3.id, 'refusee', 'non'));
  fail(call(ag, 'demandeSupprimer', d3.id), /accessible/);
  ok(call(admin, 'demandeSupprimer', d3.id));
  const l = ok(call(admin, 'demandesList'));
  assert.deepStrictEqual(l.toHandle.map((d) => d.id).sort(), [d1.id, d4.id].sort());
  // transmise à la direction, pas encore de réponse : le responsable peut corriger, retirer, supprimer ou annuler l'envoi
  const env = ok(call(admin, 'demandesEnvoyer', [d1.id, d4.id], '')).envoi;
  assert.strictEqual(Number(env.nb), 2);
  fail(call(ag, 'demandeModifier', d1.id, { message: 'x' }), /seul votre responsable/);
  fail(call(ag, 'demandeSupprimer', d1.id), /accessible/);
  assert.strictEqual(ok(call(admin, 'demandeModifier', d1.id, { message: 'corrigé' })).message, 'corrigé');
  ok(call(admin, 'demandeReouvrir', d4.id));
  let l2 = ok(call(admin, 'demandesList'));
  assert.strictEqual(Number(l2.envois[0].nb), 1, 'l\'envoi est recalculé');
  assert.strictEqual(l2.toHandle.find((d) => d.id === d4.id).statut, 'en_attente');
  ok(call(admin, 'demandeSupprimer', d1.id));
  l2 = ok(call(admin, 'demandesList'));
  assert.strictEqual(l2.envois.length, 0, 'envoi vide : supprimé');
  // annuler tout un envoi
  const env2 = ok(call(admin, 'demandesEnvoyer', null, '')).envoi;
  assert.strictEqual(ok(call(admin, 'envoiAnnuler', env2.id)).remises, 1);
  assert.strictEqual(ok(call(admin, 'demandesList')).toHandle.find((d) => d.id === d4.id).statut, 'en_attente');
  // la direction a répondu : tout est verrouillé
  const env3 = ok(call(admin, 'demandesEnvoyer', null, '')).envoi;
  ok(call(admin, 'envoiTraiter', env3.id, 'acceptee', 'ok'));
  fail(call(admin, 'demandeSupprimer', d4.id), /a répondu/);
  fail(call(admin, 'demandeReouvrir', d4.id), /a répondu/);
  fail(call(admin, 'demandeModifier', d4.id, { message: 'x' }), /ne peut plus/);
  fail(call(admin, 'envoiAnnuler', env3.id), /a répondu/);
});

test('demandes : une demande acceptée reste « en cours » et part à la direction avec les autres', () => {
  const app2 = loadApp(); const call = app2.call; const run = app2.run;
  run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  const admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  ok(call(admin, 'agentCreate', { nom: 'AGENT ENV', email: 'ev@t.fr', role: 'agent', password: 'agentpw123' }));
  const ag = ok(call(null, 'login', 'ev@t.fr', 'agentpw123')).token;
  const a = ok(call(ag, 'demandeCreate', { type: 'attestation_travail' })); const b = ok(call(ag, 'demandeCreate', { type: 'contrat' })); const c = ok(call(ag, 'demandeCreate', { type: 'attestation_cnas' }));
  ok(call(admin, 'demandeRepondre', a.id, 'acceptee', 'ok'));
  ok(call(admin, 'demandeRepondre', c.id, 'refusee', 'non'));
  const r = ok(call(admin, 'demandesEnvoyer', [], ''));
  assert.strictEqual(r.envoi.nb, 2, 'la demande acceptée et celle en attente partent ; la refusée reste');
  const l = ok(call(admin, 'demandesList'));
  const st = Object.fromEntries(l.toHandle.map((d) => [d.id, d.statut]));
  assert.deepStrictEqual([st[a.id], st[b.id], st[c.id]], ['envoyee', 'envoyee', 'refusee']);
});

test('demandes : ATS et attestation d\'émoluments ne sont plus proposés, mais une ancienne demande reste visible', () => {
  const app3 = loadApp(); const call3 = app3.call;
  app3.run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  const admin = ok(call3(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  ok(call3(admin, 'agentCreate', { nom: 'AGENT OLD', email: 'ol@t.fr', role: 'agent', password: 'agentpw123' }));
  const ag = ok(call3(null, 'login', 'ol@t.fr', 'agentpw123')).token;
  fail(call3(ag, 'demandeCreate', { type: 'ats' }), /Type de demande invalide/);
  fail(call3(ag, 'demandeCreate', { type: 'attestation_emoluments' }), /Type de demande invalide/);
  assert.ok(!('ats' in ok(call3(admin, 'demandesList')).types) && !('attestation_emoluments' in ok(call3(admin, 'demandesList')).types));
  // ancienne demande déjà enregistrée dans le classeur
  app3.run("Store.writeTable('Demandes', Store.readTable('Demandes').concat([{ id: 'D_OLD', agent_id: Agents.list().filter(function (a) { return a.role === 'agent'; })[0].id, type: 'ats', objet: 'ATS', message: '', date_debut: '', date_fin: '', date_creation: new Date().toISOString(), statut: 'en_attente', envoi_id: '', reponse: '', traite_par: '', date_traitement: '' }]))");
  const l = ok(call3(admin, 'demandesList'));
  assert.strictEqual(l.types.ats, 'ATS', 'le type reste listé tant qu\'une demande l\'utilise');
  assert.strictEqual(l.toHandle[0].type_label, 'ATS');
});
