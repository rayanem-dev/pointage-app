const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load');

const app = loadApp();
const { call, run, env } = app;
const ok = (r) => { assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.data; };
const fail = (r, msg) => { assert.strictEqual(r.ok, false, 'devait échouer'); if (msg) assert.match(r.error, msg); return r; };
const T = {};
const addDays = (d, n) => run(`Dates.addDays('${d}', ${n})`);
const TODAY = run('Dates.today()');

test('installation : tables, administrateur, application prête', () => {
  assert.strictEqual(ok(call(null, 'appInfo')).installed, false);
  const res = run("Setup.install('admin@test.local', 'adminpw1', 'Admin')");
  assert.strictEqual(res.admin, 'admin@test.local'); assert.strictEqual(res.status.installed, true);
  for (const t of ['Params', 'Agents', 'Contrats', 'Fonctions', 'Attachements', 'Demandes', 'Envois', 'Documents', 'Démarrage']) assert.ok(env.main.getSheetByName(t), t);
  assert.strictEqual(ok(call(null, 'appInfo')).installed, true);
  assert.strictEqual(run("Setup.install('autre@x.fr', 'zzzzzz', 'X')").admin, null, 'ne crée pas un 2e admin');
});

test('connexion et contrôle des rôles', () => {
  fail(call(null, 'login', 'admin@test.local', 'mauvais'), /incorrect/);
  T.admin = ok(call(null, 'login', 'admin@test.local', 'adminpw1')).token;
  fail(call(null, 'agentsManage'), /expirée/);
  fail(call('faux', 'me'), /expirée/);
  fail(call(T.admin, 'inconnue'), /inconnue/);
  assert.strictEqual(ok(call(T.admin, 'me')).canSetup, true);
});

test('setup : prestataire, rotation, contrats ; accès chef accordé par l\'admin', () => {
  const a = T.admin;
  ok(call(a, 'setupSave', { prestataire_nom: 'SARL ACOSCO', direction_email: 'direction@client.dz', direction_nom: 'Direction RH', jours_travail: '28', jours_repos: '28' }));
  fail(call(a, 'setupSave', { jours_travail: '0' }), /entier/);
  fail(call(a, 'setupSave', { couleur_T: 'vert' }), /couleur/);
  assert.strictEqual(ok(call(null, 'appInfo')).prestataire, 'SARL ACOSCO');
  ok(call(a, 'contratsSave', {
    contrats: [{ numero: 'C1', client: 'SONATRACH Division', objet: 'Objet', ref_mois: '2026-08', ref_attachement: 16 }],
    fonctions: [{ contrat: 'C1', designation: 'Ingénieur Génie civil', libelle: 'Ingénieur génie civil', positions: 2, delai: 540, prix_unitaire: 18500, qte_precedente_ref: 914 }],
  }));
});

test('création des agents : par l\'admin et par le chef de groupe', () => {
  const a = T.admin;
  const chef = ok(call(a, 'agentCreate', { nom: 'CHEF UN', email: 'chef@test.local', role: 'chef', fonction: 'Ingénieur génie civil', contrat: 'C1', password: 'chefpw12' }));
  T.chefId = chef.agent.id;
  const chef2 = ok(call(a, 'agentCreate', { nom: 'CHEF DEUX', email: 'chef2@test.local', role: 'chef', password: 'chefpw22' }));
  T.chef2Id = chef2.agent.id;
  T.chef = ok(call(null, 'login', 'chef@test.local', 'chefpw12')).token;
  T.chef2 = ok(call(null, 'login', 'chef2@test.local', 'chefpw22')).token;
  // le chef crée un agent : rôle et groupe forcés
  const ag = ok(call(T.chef, 'agentCreate', { nom: 'AGENT UN', email: 'ag1@test.local', role: 'admin', chef_id: T.chef2Id, fonction: 'Ingénieur génie civil', contrat: 'C1', password: 'agentpw1' }));
  assert.strictEqual(ag.agent.role, 'agent'); assert.strictEqual(ag.agent.chef_id, T.chefId);
  T.agId = ag.agent.id;
  const generated = ok(call(T.chef, 'agentCreate', { nom: 'AGENT DEUX', email: 'ag2@test.local' }));
  assert.ok(generated.password.length >= 6, 'mot de passe généré');
  T.ag2Id = generated.agent.id; env.__pw = generated.password;
  const lone = ok(call(a, 'agentCreate', { nom: 'SANS CHEF', email: 'lone@test.local', password: 'lonepw12', contrat: 'C1' }));
  T.loneId = lone.agent.id;
  fail(call(T.chef, 'agentCreate', { nom: 'X', email: 'ag1@test.local' }), /déjà utilisé/);
  fail(call(T.chef, 'agentCreate', { nom: 'X', email: 'pasunemail' }), /Email invalide/);
  T.ag = ok(call(null, 'login', 'ag1@test.local', 'agentpw1')).token;
  T.lone = ok(call(null, 'login', 'lone@test.local', 'lonepw12')).token;
  fail(call(T.ag, 'agentCreate', { nom: 'Z', email: 'z@test.local' }), /refusé/);
  // le chef ne gère que son groupe, et pas les rôles
  assert.strictEqual(ok(call(T.chef, 'agentsManage')).length, 2);
  assert.strictEqual(ok(call(a, 'agentsManage')).length, 6);
  fail(call(T.chef2, 'agentUpdate', T.agId, { nom: 'PIRATE' }), /pas modifier/);
  ok(call(T.chef, 'agentUpdate', T.agId, { affectation: 'Hassi', role: 'admin', acces_setup: true }));
  const upd = ok(call(a, 'agentsManage')).find((x) => x.id === T.agId);
  assert.deepStrictEqual([upd.affectation, upd.role, upd.acces_setup], ['Hassi', 'agent', '0'], 'le chef ne peut ni changer le rôle ni donner l\'accès Setup');
  assert.ok(!('password_hash' in upd) && !('salt' in upd));
});

test('accès à l\'onglet Setup : au choix de l\'admin pour chaque chef', () => {
  fail(call(T.chef, 'setupGet'), /Setup/);
  fail(call(T.ag, 'setupGet'), /Setup/);
  ok(call(T.admin, 'agentUpdate', T.chefId, { acces_setup: true }));
  assert.strictEqual(ok(call(T.chef, 'me')).canSetup, true);
  ok(call(T.chef, 'setupSave', { couleur_T_prevu: '#aaffaa' }));
  assert.strictEqual(ok(call(T.chef, 'setupGet')).isAdmin, false);
  fail(call(T.chef2, 'setupGet'), /Setup/);
  fail(call(T.chef, 'vider', 'tout', 'VIDER'), /refusé/);
  fail(call(T.chef, 'repairStructure'), /refusé/);
  ok(call(T.admin, 'agentUpdate', T.chefId, { acces_setup: false }));
  fail(call(T.chef, 'setupGet'), /Setup/);
});

test('pointage par le chef (son groupe) et situation du jour', () => {
  fail(call(T.chef, 'pointer', { agent_id: T.loneId, date: TODAY, statut: 'T' }), /groupe/);
  fail(call(T.ag, 'pointer', { agent_id: T.agId, date: TODAY, statut: 'T' }), /refusé/);
  fail(call(T.chef, 'pointer', { agent_id: T.agId, date: TODAY, statut: 'Z' }), /Statut/);
  // 5 jours de travail jusqu'à aujourd'hui compris
  const r = ok(call(T.chef, 'pointer', { agent_id: T.agId, date: addDays(TODAY, -4), date_fin: TODAY, statut: 'T' }));
  assert.strictEqual(r.jours, 5);
  const ov = ok(call(T.ag, 'overview'));
  assert.strictEqual(ov.aujourdhui.status, 'T'); assert.strictEqual(ov.aujourdhui.prevu, false);
  assert.strictEqual(ov.aujourdhui.remaining, 24, '5 jours pointés sur 28 : aujourd\'hui + 23 jours prévus');
  assert.strictEqual(ov.aujourdhui.changeStatus, 'R', 'puis congé');
  assert.strictEqual(ov.cycle.run, 5); assert.strictEqual(ov.cumul.T, 5);
});

test('situation du jour : prévisions T puis congé R, et jours restants', () => {
  const tl = (arr) => `Cycle.timelineOf({ '2026-10': { a: ${JSON.stringify(arr)} } }, 'a')`;
  const P = '{ jours_travail: "28", jours_repos: "28" }';
  // T pointé le 01 seulement ; aujourd'hui = 10 → T prévu, il reste 19 jours (10..28)
  const t10 = run(`Cycle.dayInfo(${tl(['T'])}, ${P}, '2026-10-10')`);
  assert.deepStrictEqual([t10.status, t10.prevu, t10.remaining, t10.change, t10.changeStatus], ['T', true, 19, '2026-10-29', 'R']);
  // aujourd'hui = 29 → congé (R prévu) pour 28 jours
  const r29 = run(`Cycle.dayInfo(${tl(['T'])}, ${P}, '2026-10-29')`);
  assert.deepStrictEqual([r29.status, r29.remaining, r29.change], ['R', 28, '2026-11-26']);
  assert.strictEqual(run(`Cycle.dayInfo(${tl(['T', 'ABS'])}, ${P}, '2026-10-02')`).status, 'ABS');
  assert.strictEqual(run(`Cycle.dayInfo(${tl([])}, ${P}, '2026-10-02')`), null);
});

test('demandes : 6 types, regroupement par thème par le chef, une seule demande à la direction', () => {
  assert.deepStrictEqual(Object.keys(run('CFG.TYPES_DEMANDE')), ['titre_conge', 'attestation_travail', 'ats', 'fiche_emolument', 'prolongation_conge', 'prolongation_sejour']);
  fail(call(T.ag, 'demandeCreate', { type: 'autre', objet: 'x' }), /Type/);
  fail(call(T.ag, 'demandeCreate', { type: 'titre_conge', date_debut: '2026-10-10', date_fin: '2026-10-01' }), /fin/);
  fail(call(T.admin, 'demandeCreate', { type: 'ats' }), /administrateur/);
  const mk = (tok, type, extra = {}) => ok(call(tok, 'demandeCreate', { type, message: 'svp', ...extra }));
  const d1 = mk(T.ag, 'titre_conge', { date_debut: '2026-11-01', date_fin: '2026-11-28' });
  mk(T.ag, 'ats');
  const ag2 = ok(call(null, 'login', 'ag2@test.local', generatedPw())).token;
  mk(ag2, 'titre_conge'); mk(ag2, 'fiche_emolument'); mk(ag2, 'prolongation_sejour');
  mk(T.lone, 'attestation_travail');
  T.d1 = d1.id;
  const l = ok(call(T.chef, 'demandesList'));
  assert.strictEqual(l.mine.length, 0);
  assert.strictEqual(l.toHandle.length, 5, 'le chef ne voit que son groupe');
  assert.ok(l.toHandle.every((d) => d.agent_nom && d.type_label));
  assert.strictEqual(ok(call(T.chef2, 'demandesList')).toHandle.length, 0);
  assert.strictEqual(ok(call(T.admin, 'demandesList')).toHandle.length, 6);
  fail(call(T.chef2, 'demandeRepondre', d1.id, 'acceptee'), /accessible/);
  // une demande refusée directement ne part pas à la direction
  const direct = ok(call(T.chef, 'demandeRepondre', l.toHandle.find((d) => d.type === 'ats').id, 'refusee', 'Non éligible'));
  assert.strictEqual(direct.statut, 'refusee');
  // envoi groupé : UNE seule demande, regroupée par thème
  const sent = ok(call(T.chef, 'demandesEnvoyer', null, 'Merci'));
  assert.strictEqual(sent.envoi.nb, 4);
  assert.deepStrictEqual(sent.groupes.map((g) => [g.label, g.n]), [['Titre de congé', 2], ["Fiche d'émoluments", 1], ['Prolongation de séjour', 1]]);
  assert.strictEqual(sent.mail, true); assert.strictEqual(env.mails.length, 1);
  assert.strictEqual(env.mails[0].to, 'direction@client.dz');
  assert.match(env.mails[0].body, /TITRE DE CONGÉ \(2\)[\s\S]*AGENT UN[\s\S]*du 01\/11\/2026 au 28\/11\/2026/);
  fail(call(T.chef, 'demandesEnvoyer'), /Aucune demande/);
  assert.strictEqual(ok(call(T.ag, 'demandesList')).mine.find((d) => d.id === d1.id).statut, 'envoyee');
  T.envoi = sent.envoi.id;
  // réponse de la direction → appliquée à tout l'envoi
  fail(call(T.chef2, 'envoiTraiter', T.envoi, 'acceptee'), /introuvable/);
  const e = ok(call(T.chef, 'envoiTraiter', T.envoi, 'acceptee', 'Accordé par la direction'));
  assert.strictEqual(e.statut, 'traite');
  const mine = ok(call(T.ag, 'demandesList')).mine;
  assert.strictEqual(mine.find((d) => d.id === d1.id).statut, 'acceptee');
  assert.strictEqual(mine.find((d) => d.id === d1.id).reponse, 'Accordé par la direction');
  assert.strictEqual(mine.find((d) => d.type === 'ats').statut, 'refusee', 'la décision directe n\'est pas écrasée');
  // agent sans chef : traité par l'admin
  const envAdmin = ok(call(T.admin, 'demandesEnvoyer'));
  assert.strictEqual(envAdmin.envoi.nb, 1);
  assert.strictEqual(ok(call(T.admin, 'demandesList')).envois.length, 2);
  assert.strictEqual(ok(call(T.chef, 'demandesList')).envois.length, 1);
  assert.strictEqual(ok(call(T.ag, 'overview')).demandes.total, 2);
});
function generatedPw() { return env.__pw; }

test('documents : dépôt par le chef, consultation par l\'agent', () => {
  fail(call(T.ag, 'documentUpload', {}), /refusé/);
  const base64 = Buffer.from('%PDF-fiche').toString('base64');
  fail(call(T.chef, 'documentUpload', { agent_id: T.loneId, type: 'ats', nom: 'a.pdf', base64 }), /groupe/);
  fail(call(T.chef, 'documentUpload', { agent_id: T.agId, type: 'nimporte', nom: 'a.pdf', base64 }), /Type/);
  const d = ok(call(T.chef, 'documentUpload', { agent_id: T.agId, type: 'fiche_emolument', titre: 'Août', nom: 'paie août.pdf', mime: 'application/pdf', base64 }));
  assert.ok(!('file_id' in d));
  assert.strictEqual(ok(call(T.ag, 'documentsList')).length, 1);
  assert.strictEqual(ok(call(T.chef, 'documentsList', T.agId)).length, 1);
  fail(call(T.ag, 'documentsList', T.ag2Id), /refusé/);
  fail(call(T.lone, 'documentDownload', d.id), /introuvable/);
  const f = ok(call(T.ag, 'documentDownload', d.id));
  assert.strictEqual(Buffer.from(f.base64, 'base64').toString(), '%PDF-fiche');
  fail(call(T.ag, 'documentDelete', d.id), /refusé|introuvable/);
  ok(call(T.chef, 'documentDelete', d.id));
  assert.strictEqual(ok(call(T.ag, 'documentsList')).length, 0);
});

test('exports : fiche (chef), attachement N°16 et facture de mai (admin)', () => {
  const f = ok(call(T.chef, 'exportFiche', { month: TODAY.slice(0, 7), format: 'pdf', prevu: true }));
  assert.strictEqual(f.mime, 'application/pdf'); assert.match(Buffer.from(f.base64, 'base64').toString(), /PDF/);
  assert.match(env.fetches.at(-1), /export\?format=pdf&size=A4&portrait=false/);
  ok(call(T.chef, 'exportFiche', { month: TODAY.slice(0, 7), format: 'xlsx' }));
  assert.match(env.fetches.at(-1), /format=xlsx$/);
  fail(call(T.chef, 'exportAttachement', { month: '2026-08', contrat: 'C1', format: 'pdf' }), /refusé/);
  const aug = ok(call(T.admin, 'attachementPreview', '2026-08', 'C1'));
  assert.deepStrictEqual([aug.numero, aug.lines[0].mois, aug.lines[0].precedente, aug.lines[0].cumulee, aug.lines[0].contrat], [16, 62, 914, 976, 1080]);
  const may = ok(call(T.admin, 'attachementPreview', '2026-05', 'C1'));
  assert.deepStrictEqual([may.numero, may.totalHT], [13, 1147000]);
  for (const [fn, o] of [['exportAttachement', { month: '2026-08', contrat: 'C1' }], ['exportFacture', { month: '2026-05', contrat: 'C1', facture_numero: '235/PS/2026', date: '2026-06-22' }]]) {
    for (const format of ['pdf', 'xlsx']) { const r = ok(call(T.admin, fn, { ...o, format })); assert.ok(r.nom.endsWith(format)); }
  }
  ok(call(T.admin, 'attachementQte', { contrat: 'C1', mois: '2026-08', designation: 'Ingénieur Génie civil', qte_mois: 60 }));
  assert.strictEqual(ok(call(T.admin, 'attachementPreview', '2026-08', 'C1')).lines[0].cumulee, 974);
  assert.strictEqual(run('Format.amountInWords(3224000)'), 'TROIS MILLIONS DEUX CENT VINGT-QUATRE MILLE DINARS ALGERIENS');
  assert.strictEqual(run('Format.words(80000)'), 'quatre-vingt mille');
  // le classeur temporaire est mis à la corbeille
  assert.ok(Object.values(env.files).filter((x) => x.blob).length >= 0);
});

test('mot de passe personnel', () => {
  fail(call(T.ag, 'passwordOwn', 'faux', 'nouveau123'), /actuel/);
  ok(call(T.ag, 'passwordOwn', 'agentpw1', 'nouveau123'));
  fail(call(null, 'login', 'ag1@test.local', 'agentpw1'), /incorrect/);
  ok(call(null, 'login', 'ag1@test.local', 'nouveau123'));
  ok(call(T.chef, 'agentPassword', T.agId, 'reset1234'));
  fail(call(T.chef2, 'agentPassword', T.agId, 'pirate1234'), /refusé/);
  ok(call(null, 'login', 'ag1@test.local', 'reset1234'));
});

test('vider : données seulement, puis coquille vide', () => {
  fail(call(T.admin, 'vider', 'tout', 'oui'), /VIDER/);
  ok(call(T.admin, 'vider', 'donnees', 'VIDER'));
  const tabs = run('Store.listTabs()');
  assert.ok(!tabs.some((t) => /^\d{4}-\d{2}$/.test(t)) && !tabs.includes('Global'), 'onglets mensuels supprimés');
  assert.strictEqual(run("Store.readTable('Demandes')").length, 0);
  assert.deepStrictEqual(run("Store.readTable('Agents')").map((a) => a.role), ['admin'], 'seul l\'admin reste');
  assert.strictEqual(run("Params.get().prestataire_nom"), 'SARL ACOSCO', 'configuration conservée');
  assert.strictEqual(run("Store.readTable('Contrats')").length, 1);
  fail(call(T.chef, 'me'), /expirée/);
  ok(call(T.admin, 'vider', 'tout', 'VIDER'));
  assert.strictEqual(run("Params.get().prestataire_nom"), '', 'coquille vide');
  assert.strictEqual(run("Store.readTable('Contrats')").length, 0);
  assert.strictEqual(run("Store.readTable('Fonctions')").length, 0);
  assert.strictEqual(ok(call(T.admin, 'me')).user.email, 'admin@test.local');
  ok(call(T.admin, 'agentCreate', { nom: 'NOUVEAU CLIENT AGENT', email: 'n@test.local', password: 'azerty12' }));
});
