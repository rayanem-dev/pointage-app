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

test('demandes : le responsable d\'équipe voit et gère toutes les demandes de SON équipe ; l\'administrateur voit à qui elles reviennent', () => {
  const app4 = loadApp(); const call4 = app4.call;
  app4.run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  const admin = ok(call4(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  const chef = ok(call4(admin, 'agentCreate', { nom: 'CHEF EQ', email: 'ce@t.fr', role: 'chef', password: 'chefeqpw12' })).agent;
  ok(call4(admin, 'agentCreate', { nom: 'AG EQUIPE', email: 'ae@t.fr', role: 'agent', password: 'agentpw123', chef_id: chef.id }));
  ok(call4(admin, 'agentCreate', { nom: 'AG LIBRE', email: 'al@t.fr', role: 'agent', password: 'agentpw123' }));
  const tc = ok(call4(null, 'login', 'ce@t.fr', 'chefeqpw12')).token;
  const ae = ok(call4(null, 'login', 'ae@t.fr', 'agentpw123')).token; const al = ok(call4(null, 'login', 'al@t.fr', 'agentpw123')).token;
  const d1 = ok(call4(ae, 'demandeCreate', { type: 'contrat' })); const d2 = ok(call4(ae, 'demandeCreate', { type: 'attestation_cnas' })); ok(call4(al, 'demandeCreate', { type: 'contrat' }));
  const l = ok(call4(tc, 'demandesList'));
  assert.deepStrictEqual(l.toHandle.map((d) => d.agent_nom).sort(), ['AG EQUIPE', 'AG EQUIPE'], 'toutes les demandes de son équipe, aucune autre');
  ok(call4(tc, 'demandeModifier', d1.id, { message: 'ok' })); ok(call4(tc, 'demandeRepondre', d2.id, 'acceptee', 'oui'));
  ok(call4(tc, 'demandeReouvrir', d2.id)); ok(call4(tc, 'demandeSupprimer', d2.id));
  assert.strictEqual(Number(ok(call4(tc, 'demandesEnvoyer', null, '')).envoi.nb), 1);
  const la = ok(call4(admin, 'demandesList')).toHandle;
  assert.strictEqual(la.find((d) => d.agent_nom === 'AG LIBRE').responsable_nom, '', 'sans responsable : revient à l\'administrateur');
  assert.strictEqual(la.find((d) => d.agent_nom === 'AG EQUIPE').responsable_nom, 'CHEF EQ');
});

test('demandes : le responsable d\'équipe voit l\'état des demandes de son équipe même envoyées par un autre, et enregistre la réponse', () => {
  const app5 = loadApp(); const c5 = app5.call;
  app5.run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  const admin = ok(c5(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  const chef = ok(c5(admin, 'agentCreate', { nom: 'CHEF G', email: 'cg@t.fr', role: 'chef', password: 'chefgpw123' })).agent;
  const autre = ok(c5(admin, 'agentCreate', { nom: 'CHEF H', email: 'ch@t.fr', role: 'chef', password: 'chefhpw123' })).agent;
  ok(c5(admin, 'agentCreate', { nom: 'AG MON GROUPE', email: 'ag1@t.fr', role: 'agent', password: 'agentpw123', chef_id: chef.id }));
  ok(c5(admin, 'agentCreate', { nom: 'AG AUTRE GROUPE', email: 'ag2@t.fr', role: 'agent', password: 'agentpw123', chef_id: autre.id }));
  const tg = ok(c5(null, 'login', 'cg@t.fr', 'chefgpw123')).token;
  const a1 = ok(c5(null, 'login', 'ag1@t.fr', 'agentpw123')).token; const a2 = ok(c5(null, 'login', 'ag2@t.fr', 'agentpw123')).token;
  const d1 = ok(c5(a1, 'demandeCreate', { type: 'contrat' })); const d2 = ok(c5(a2, 'demandeCreate', { type: 'contrat' }));
  // l'administrateur envoie TOUT à la direction : une demande de chaque groupe
  const env = ok(c5(admin, 'demandesEnvoyer', null, '')).envoi;
  const l = ok(c5(tg, 'demandesList'));
  assert.strictEqual(l.envois.length, 1, 'l\'envoi de l\'administrateur apparaît dans l\'historique du responsable');
  assert.deepStrictEqual(l.envois[0].groupes.flatMap((g) => g.items.map((d) => d.agent_nom)), ['AG MON GROUPE'], 'seulement les demandes de SON équipe');
  assert.strictEqual(l.envois[0].peut_agir, false, 'il ne gère pas l\'envoi entier');
  fail(c5(tg, 'envoiAnnuler', env.id), /introuvable/);
  fail(c5(tg, 'envoiTraiter', env.id, 'acceptee', 'x'), /introuvable/);
  fail(c5(tg, 'demandeReponseDirection', d2.id, 'acceptee', 'x'), /accessible/);
  const r = ok(c5(tg, 'demandeReponseDirection', d1.id, 'acceptee', 'titre établi'));
  assert.deepStrictEqual([r.statut, r.reponse], ['acceptee', 'titre établi']);
  assert.strictEqual(ok(c5(a1, 'demandesList')).mine[0].statut, 'acceptee', 'l\'agent voit la réponse');
  const la = ok(c5(admin, 'demandesList')).envois[0];
  assert.strictEqual(la.statut, 'envoye', 'l\'envoi reste ouvert tant que l\'autre groupe n\'a pas sa réponse');
  ok(c5(admin, 'demandeReponseDirection', d2.id, 'refusee', 'non'));
  assert.strictEqual(ok(c5(admin, 'demandesList')).envois[0].statut, 'traite', 'toutes les réponses reçues : envoi clos');
  fail(c5(tg, 'demandeReponseDirection', d1.id, 'refusee', ''), /n’attend pas/);
});

test('dépôt : la liste retire les documents non envoyés depuis plus de 3 jours, et « Tout retirer » vide la liste', () => {
  const app6 = loadApp(); const c6 = app6.call;
  app6.run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  const tk = ok(c6(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  ok(c6(tk, 'agentCreate', { nom: 'KADRI SOFIANE', email: 'k@t.fr', role: 'agent', password: 'kadripw12' }));
  const pdf = (i) => Buffer.from('%PDF-1.4 ancien ' + i).toString('base64');
  ok(c6(tk, 'depotAdd', { nom: 'KADRI_Sofiane_FDP_mars_2026.pdf', mime: 'application/pdf', base64: pdf(1) }));
  ok(c6(tk, 'depotAdd', { nom: 'KADRI_Sofiane_FDP_avril_2026.pdf', mime: 'application/pdf', base64: pdf(2) }));
  app6.run("var r = Store.readTable('Depots'); r[0].date_depot = new Date(Date.now() - 5 * 86400000).toISOString(); Store.writeTable('Depots', r);");
  assert.strictEqual(ok(c6(tk, 'depotList')).length, 1, 'le dépôt de 5 jours est retiré, le récent reste');
  ok(c6(tk, 'depotVider'));
  assert.strictEqual(ok(c6(tk, 'depotList')).length, 0);
});

test('demandes : parcours complet reçue → transmise → réponse → clôture avec document ; l\'agent ne voit que les siennes', () => {
  const app7 = loadApp(); const c7 = app7.call;
  app7.run("Setup.install('admin@t.fr', 'adminpw12', 'Admin')");
  const admin = ok(c7(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  const chef = ok(c7(admin, 'agentCreate', { nom: 'CHEF P', email: 'cp@t.fr', role: 'chef', password: 'chefppw123' })).agent;
  const ag1 = ok(c7(admin, 'agentCreate', { nom: 'AG UN', email: 'u1@t.fr', role: 'agent', password: 'agentpw123', chef_id: chef.id })).agent;
  ok(c7(admin, 'agentCreate', { nom: 'AG DEUX', email: 'u2@t.fr', role: 'agent', password: 'agentpw123', chef_id: chef.id }));
  const tc = ok(c7(null, 'login', 'cp@t.fr', 'chefppw123')).token; const t1 = ok(c7(null, 'login', 'u1@t.fr', 'agentpw123')).token; const t2 = ok(c7(null, 'login', 'u2@t.fr', 'agentpw123')).token;
  const d1 = ok(c7(t1, 'demandeCreate', { type: 'titre_conge', date_debut: '2026-11-01', date_fin: '2026-11-28' })); const d2 = ok(c7(t2, 'demandeCreate', { type: 'titre_conge' }));
  const etat = (l, id) => (l.find((d) => d.id === id) || {}).etapes.map((e) => e.cle + ':' + e.etat).join(' ');
  assert.strictEqual(etat(ok(c7(t1, 'demandesList')).mine, d1.id), 'recue:fait transmise:attente reponse:attente cloturee:attente');
  // le responsable transmet à la direction (l'administrateur) ; tous voient l'avancement
  const env = ok(c7(tc, 'demandesEnvoyer', null, '')).envoi;
  assert.strictEqual(etat(ok(c7(t1, 'demandesList')).mine, d1.id), 'recue:fait transmise:fait reponse:attente cloturee:attente');
  ok(c7(admin, 'envoiTraiter', env.id, 'acceptee', 'titre établi'));
  assert.strictEqual(etat(ok(c7(tc, 'demandesList')).toHandle, d1.id), 'recue:fait transmise:fait reponse:fait cloturee:attente');
  assert.strictEqual(ok(c7(tc, 'demandesList')).toHandle.find((d) => d.id === d1.id).a_cloturer, true);
  // pas de clôture sans document (hors refus) ; l'agent ne peut pas clôturer ; document d'un autre agent refusé
  fail(c7(tc, 'demandeCloturer', d1.id, ''), /Choisissez le document/);
  fail(c7(t1, 'demandeCloturer', d1.id, ''), /./);
  const pdf = Buffer.from('%PDF-1.4 tc').toString('base64');
  const doc = ok(c7(tc, 'documentUpload', { agent_id: ag1.id, type: 'titre_conge', nom: 'TC_AG_Un_2026-11-01.pdf', base64: pdf }));
  const docs = ok(c7(tc, 'demandeDocuments', d1.id)); assert.strictEqual(docs[0].correspond, true);
  fail(c7(tc, 'demandeCloturer', d1.id, 'inconnu'), /introuvable/);
  const r = ok(c7(tc, 'demandeCloturer', d1.id, doc.id));
  assert.deepStrictEqual([r.cloturee, r.document.id, r.a_cloturer], [true, doc.id, false]);
  // l'agent voit l'avancement complet, la clôture et le document ; mais pas la demande d'un autre
  const mine = ok(c7(t1, 'demandesList')).mine; assert.strictEqual(mine.length, 1);
  assert.strictEqual(etat(mine, d1.id), 'recue:fait transmise:fait reponse:fait cloturee:fait'); assert.strictEqual(mine[0].document.id, doc.id);
  assert.ok(ok(c7(t1, 'documentDownload', doc.id)).base64, 'l\'agent télécharge le document remis');
  assert.strictEqual(ok(c7(t1, 'demandesList')).toHandle.length, 0, 'l\'agent n\'a aucun historique des autres');
  // clôturée : plus de modification sans annuler la clôture
  fail(c7(tc, 'demandeModifier', d1.id, { message: 'x' }), /clôturée/); fail(c7(tc, 'demandeSupprimer', d1.id), /clôturée/);
  ok(c7(tc, 'demandeAnnulerCloture', d1.id)); assert.strictEqual(ok(c7(tc, 'demandesList')).toHandle.find((d) => d.id === d1.id).cloturee, false);
  assert.ok(d2.id);
});

test('demandes : le responsable d’équipe crée une demande pour un agent de son équipe (jamais pour un autre)', () => {
  const admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  const chef = ok(call(admin, 'agentCreate', { nom: 'CHEF POUR', email: 'cp@t.fr', role: 'chef', password: 'chefpw1234' })).agent;
  const tc = ok(call(null, 'login', 'cp@t.fr', 'chefpw1234')).token;
  const mien = ok(call(tc, 'agentCreate', { nom: 'AGENT MIEN', email: 'am@t.fr', password: 'agentpw123' })).agent;
  const autre = ok(call(admin, 'agentCreate', { nom: 'AGENT AUTRE', email: 'aa@t.fr', role: 'agent', password: 'agentpw123' })).agent;
  const d = ok(call(tc, 'demandeCreate', { type: 'titre_conge', date_debut: '2026-11-01', date_fin: '2026-11-28', agent_id: mien.id }));
  assert.strictEqual(d.agent_id, mien.id);
  const l = ok(call(tc, 'demandesList'));
  assert.ok(l.toHandle.some((x) => x.id === d.id && x.agent_nom === 'AGENT MIEN'), 'visible dans les demandes en cours du chef');
  const am = ok(call(null, 'login', 'am@t.fr', 'agentpw123')).token;
  assert.ok(ok(call(am, 'demandesList')).mine.some((x) => x.id === d.id), "l'agent voit sa demande");
  fail(call(tc, 'demandeCreate', { type: 'contrat', agent_id: autre.id }), /Agent non accessible/);
  fail(call(am, 'demandeCreate', { type: 'contrat', agent_id: mien.id === chef.id ? autre.id : chef.id }), /Agent non accessible/);
  const pour = ok(call(tc, 'demandeCreate', { type: 'contrat', agent_id: chef.id })); assert.strictEqual(pour.agent_id, chef.id); // « Moi-même » = sans agent_id ou son propre id
});

test('types de demande réglables dans Setup : ajout (« Certificat de travail »), retrait, droits, document attendu', () => {
  const admin = ok(call(null, 'login', 'admin@t.fr', 'adminpw12')).token;
  const tc = ok(call(null, 'login', 'cp@t.fr', 'chefpw1234')).token; // responsable sans accès au Setup
  fail(call(tc, 'typesDemandeGet'), /Setup/);
  const cfg = ok(call(admin, 'typesDemandeSave', { builtin: { contrat: false }, custom: [{ label: 'Certificat de travail', doc: 'attestation_travail' }] }));
  assert.strictEqual(cfg.custom[0].cle, 'x_certificat_de_travail'); assert.strictEqual(cfg.builtin.find((b) => b.cle === 'contrat').propose, false);
  const am = ok(call(null, 'login', 'am@t.fr', 'agentpw123')).token;
  const l = ok(call(am, 'demandesList')); assert.ok(l.proposes.includes('x_certificat_de_travail')); assert.ok(!l.proposes.includes('contrat'));
  const d = ok(call(am, 'demandeCreate', { type: 'x_certificat_de_travail', message: 'pour la banque' })); assert.strictEqual(ok(call(am, 'demandesList')).mine.find((x) => x.id === d.id).type_label, 'Certificat de travail');
  fail(call(am, 'demandeCreate', { type: 'contrat' }), /Type de demande invalide/);
  const g = ok(call(tc, 'demandesList')); assert.ok(g.toHandle.some((x) => x.id === d.id));
  fail(call(admin, 'typesDemandeSave', { custom: [{ label: 'Attestation CNAS' }] }), /existe déjà/);
  fail(call(admin, 'typesDemandeSave', { custom: [{ label: 'ab' }] }), /3 caractères/);
  // un type déjà utilisé ne disparaît pas : il est seulement retiré des nouvelles demandes
  const r = ok(call(admin, 'typesDemandeSave', { custom: [] })); assert.ok(r.custom[0].utilise && r.custom[0].propose === false);
  assert.ok(!ok(call(am, 'demandesList')).proposes.includes('x_certificat_de_travail'));
  assert.strictEqual(ok(call(am, 'demandesList')).mine.find((x) => x.id === d.id).type_label, 'Certificat de travail');
});
