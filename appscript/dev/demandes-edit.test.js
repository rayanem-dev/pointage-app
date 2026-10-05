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
  const d2 = ok(call(ag, 'demandeCreate', { type: 'ats' }));
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
  // transmise à la direction : plus rien n'est possible
  ok(call(admin, 'demandesEnvoyer', [d1.id, d4.id], ''));
  fail(call(admin, 'demandeSupprimer', d1.id), /transmise/);
  fail(call(admin, 'demandeReouvrir', d1.id), /transmise/);
  fail(call(admin, 'demandeModifier', d1.id, { message: 'x' }), /ne peut plus/);
});
