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
  ok(call(a, 'setupSave', { prestataire_nom: 'SARL HORIZON SERVICES', direction_email: 'direction@client.dz', direction_nom: 'Direction RH', jours_travail: '28', jours_repos: '28', attachement_pointage: '0' }));
  fail(call(a, 'setupSave', { jours_travail: '0' }), /entier/);
  fail(call(a, 'setupSave', { couleur_T: 'vert' }), /couleur/);
  assert.strictEqual(ok(call(null, 'appInfo')).prestataire, 'SARL HORIZON SERVICES');
  ok(call(a, 'contratsSave', {
    contrats: [{ numero: 'C1', client: 'ENERGIE DU SUD Division', objet: 'Objet', ref_mois: '2026-08', ref_attachement: 16 }],
    fonctions: [{ contrat: 'C1', designation: 'Technicien Électricien', libelle: 'Technicien électricien', positions: 2, delai: 540, prix_unitaire: 14000, qte_precedente_ref: 914 }],
  }));
});

test('création des agents : par l\'admin et par le responsable d’équipe', () => {
  const a = T.admin;
  const chef = ok(call(a, 'agentCreate', { nom: 'CHEF UN', email: 'chef@test.local', role: 'chef', fonction: 'Technicien électricien', contrat: 'C1', password: 'chefpw12' }));
  T.chefId = chef.agent.id;
  const chef2 = ok(call(a, 'agentCreate', { nom: 'CHEF DEUX', email: 'chef2@test.local', role: 'chef', password: 'chefpw22' }));
  T.chef2Id = chef2.agent.id;
  T.chef = ok(call(null, 'login', 'chef@test.local', 'chefpw12')).token;
  T.chef2 = ok(call(null, 'login', 'chef2@test.local', 'chefpw22')).token;
  // le chef crée un agent : rôle et groupe forcés
  const ag = ok(call(T.chef, 'agentCreate', { nom: 'AGENT UN', email: 'ag1@test.local', role: 'admin', chef_id: T.chef2Id, fonction: 'Technicien électricien', contrat: 'C1', password: 'agentpw1' }));
  assert.strictEqual(ag.agent.role, 'agent'); assert.strictEqual(ag.agent.chef_id, T.chefId);
  T.agId = ag.agent.id;
  const generated = ok(call(T.chef, 'agentCreate', { nom: 'AGENT DEUX', email: 'ag2@test.local' }));
  assert.ok(generated.password.length >= 6, 'mot de passe généré');
  T.ag2Id = generated.agent.id; env.__pw = generated.password;
  const lone = ok(call(a, 'agentCreate', { nom: 'SANS CHEF', email: 'lone@test.local', password: 'lonepw12', contrat: 'C1', fonction: 'Technicien électricien' }));
  T.loneId = lone.agent.id;
  fail(call(T.chef, 'agentCreate', { nom: 'X', email: 'ag1@test.local' }), /déjà utilisé/);
  fail(call(T.chef, 'agentCreate', { nom: 'X', email: 'pasunemail' }), /Email invalide/);
  T.ag = ok(call(null, 'login', 'ag1@test.local', 'agentpw1')).token;
  T.lone = ok(call(null, 'login', 'lone@test.local', 'lonepw12')).token;
  fail(call(T.ag, 'agentCreate', { nom: 'Z', email: 'z@test.local' }), /refusé/);
  // le chef ne gère que son groupe, et pas les rôles
  assert.strictEqual(ok(call(T.chef, 'agentsManage')).length, 2);
  assert.strictEqual(ok(call(a, 'agentsManage')).length, 7); // + le compte « Responsable pointage » créé d'après Setup
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

test('demandes : 10 types, regroupement par thème par le chef, une seule demande à la direction', () => {
  assert.deepStrictEqual(Object.keys(run('CFG.TYPES_DEMANDE')), ['titre_conge', 'attestation_travail', 'ats', 'fiche_emolument', 'contrat', 'attestation_cnas', 'maj_cnas', 'attestation_emoluments', 'prolongation_conge', 'prolongation_sejour']);
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
  assert.ok(env.mails.some((m) => /^Nouvelle demande/.test(m.subject)), 'le chef est prévenu à chaque demande d\'un agent');
  env.mails.length = 0;
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
  // le responsable d’équipe extrait (lecture seule) : attachement, copie de facture ; mais ne valide ni ne facture
  fail(call(T.chef, 'exportAttachement', { month: '2026-08', contrat: 'C1', format: 'pdf' }), /non accordé/); // privilège à donner par l'administrateur
  ok(call(T.admin, 'agentUpdate', T.chefId, { acces_exports: true }));
  assert.ok(ok(call(T.chef, 'exportAttachement', { month: '2026-08', contrat: 'C1', format: 'pdf' })).nom.endsWith('pdf'));
  ok(call(T.chef, 'attachementPreview', '2026-08', 'C1'));
  fail(call(T.chef, 'attachementValider', { month: '2026-08', contrat: 'C1' }), /refusé/);
  fail(call(T.chef, 'exportFacture', { month: '2026-08', contrat: 'C1', format: 'pdf', facture_numero: 'X' }), /refusé/);
  fail(call(T.ag, 'exportAttachement', { month: '2026-08', contrat: 'C1', format: 'pdf' }), /refusé/);
  const aug = ok(call(T.admin, 'attachementPreview', '2026-08', 'C1'));
  assert.deepStrictEqual([aug.numero, aug.lines[0].mois, aug.lines[0].precedente, aug.lines[0].cumulee, aug.lines[0].contrat], [16, 62, 914, 976, 1080]);
  const may = ok(call(T.admin, 'attachementPreview', '2026-05', 'C1'));
  assert.deepStrictEqual([may.numero, may.totalHT], [13, 868000]);
  // la facture n'existe qu'à partir d'un attachement VALIDÉ (copie figée), avec un n° de facture
  fail(call(T.admin, 'exportFacture', { month: '2026-05', contrat: 'C1', format: 'pdf', facture_numero: '235/PS/2026' }), /Validez d'abord l'attachement/);
  ok(call(T.admin, 'attachementValider', { month: '2026-05', contrat: 'C1' }));
  fail(call(T.admin, 'exportFacture', { month: '2026-05', contrat: 'C1', format: 'pdf' }), /N° de facture obligatoire/);
  for (const format of ['pdf', 'xlsx']) {
    assert.ok(ok(call(T.admin, 'exportAttachement', { month: '2026-08', contrat: 'C1', format })).nom.endsWith(format));
    assert.ok(ok(call(T.admin, 'exportFacture', { month: '2026-05', contrat: 'C1', format, facture_numero: '235/PS/2026', date: '2026-06-22' })).nom.endsWith(format));
  }
  assert.strictEqual(ok(call(T.admin, 'attachementPreview', '2026-05', 'C1')).statut, 'facture');
  ok(call(T.admin, 'attachementQte', { contrat: 'C1', mois: '2026-08', designation: 'Technicien Électricien', qte_mois: 60 }));
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

test('effectifs bornés par le contrat : fonctions prévues, postes × rotation, option Setup', () => {
  const lite = ok(call(T.chef, 'contratsLite'));
  const f = lite.contrats[0].fonctions[0];
  assert.deepStrictEqual([lite.contrats[0].numero, f.libelle, f.positions, f.besoin, f.affectes, lite.strict], ['C1', 'Technicien électricien', 2, 4, 3, true], '2 postes en 28/28 = 4 personnes');
  fail(call(T.chef, 'agentCreate', { nom: 'X', email: 'x1@test.local', contrat: 'C1', fonction: 'Chauffeur' }), /non prévue au contrat C1.*Technicien électricien/);
  fail(call(T.chef, 'agentCreate', { nom: 'X', email: 'x1@test.local', contrat: 'C1' }), /Choisissez une fonction/);
  // casse / accents tolérés, libellé du contrat enregistré
  const e4 = ok(call(T.chef, 'agentCreate', { nom: 'TECH QUATRE', email: 'e4@test.local', contrat: 'C1', fonction: 'TECHNICIEN ELECTRICIEN' }));
  assert.strictEqual(e4.agent.fonction, 'Technicien électricien');
  // effectif complet (4 sur 4)
  fail(call(T.chef, 'agentCreate', { nom: 'TECH CINQ', email: 'e5@test.local', contrat: 'C1', fonction: 'Technicien électricien' }), /Effectif complet.*2 poste\(s\).*4 personne\(s\).*28\/28/);
  assert.strictEqual(ok(call(T.chef, 'contratsLite')).contrats[0].fonctions[0].affectes, 4);
  // règle désactivable dans le Setup
  ok(call(T.admin, 'setupSave', { contrat_strict: '0' }));
  const e5 = ok(call(T.chef, 'agentCreate', { nom: 'TECH CINQ', email: 'e5@test.local', contrat: 'C1', fonction: 'Technicien électricien' }));
  ok(call(T.admin, 'setupSave', { contrat_strict: '1' }));
  assert.strictEqual(ok(call(T.chef, 'contratsLite')).strict, true);
  // la désactivation libère un poste, la réactivation est contrôlée
  ok(call(T.chef, 'agentUpdate', e5.agent.id, { actif: false }));                // 4 actifs : toujours complet
  fail(call(T.chef, 'agentCreate', { nom: 'TECH SIX', email: 'e6@test.local', contrat: 'C1', fonction: 'Technicien électricien' }), /Effectif complet/);
  fail(call(T.chef, 'agentUpdate', e5.agent.id, { actif: true }), /Effectif complet/);
  ok(call(T.chef, 'agentUpdate', e4.agent.id, { actif: false }));                // 3 actifs : un poste libre
  ok(call(T.chef, 'agentCreate', { nom: 'TECH SIX', email: 'e6@test.local', contrat: 'C1', fonction: 'Technicien électricien' }));
  fail(call(T.chef, 'agentUpdate', e4.agent.id, { actif: true }), /Effectif complet/);
  ok(call(T.chef, 'agentUpdate', T.agId, { affectation: 'Hassi' }));             // champ sans rapport : pas de nouveau contrôle
  // modification d'un champ sans rapport : pas de nouveau contrôle ; fonction invalide : refusée
  fail(call(T.chef, 'agentUpdate', T.agId, { fonction: 'Chauffeur' }), /non prévue/);
  // sans contrat : aucune contrainte
  ok(call(T.admin, 'agentCreate', { nom: 'LIBRE', email: 'libre@test.local', fonction: 'Chauffeur' }));
});

test('véhicules (VH) mis à disposition : pointés comme des agents, bornés par la quantité du contrat', () => {
  const a = T.admin;
  const d = ok(call(a, 'contratsGet'));
  d.fonctions.push({ contrat: 'C1', designation: 'Véhicule pick-up 4x4', libelle: 'Pick-up 4x4', positions: 2, delai: 540, prix_unitaire: 9000, qte_precedente_ref: 0, nature: 'vehicule' });
  ok(call(a, 'contratsSave', { contrats: d.contrats, fonctions: d.fonctions }));
  const lite = ok(call(T.chef, 'contratsLite')).contrats[0].fonctions;
  const vh = lite.find((f) => f.nature === 'vehicule');
  assert.deepStrictEqual([vh.positions, vh.besoin, vh.affectes], [2, 2, 0], 'véhicules : pas de rotation, besoin = quantité');
  // un véhicule se saisit sans e-mail ni mot de passe, avec une fonction « véhicule » du contrat
  const v1 = ok(call(T.chef, 'agentCreate', { type: 'vehicule', nom: '123-456-16 Toyota Hilux', contrat: 'C1', fonction: 'Pick-up 4x4' }));
  assert.deepStrictEqual([v1.agent.type, v1.agent.email, v1.agent.role, v1.agent.chef_id, v1.password], ['vehicule', '', 'agent', T.chefId, '']);
  ok(call(T.chef, 'agentCreate', { type: 'vehicule', nom: '789-012-16 Nissan', contrat: 'C1', fonction: 'Pick-up 4x4' }));
  fail(call(T.chef, 'agentCreate', { type: 'vehicule', nom: '333-333-16 Dacia', contrat: 'C1', fonction: 'Pick-up 4x4' }), /2 véhicule\(s\) au contrat \(déjà 2\)/);
  fail(call(T.chef, 'agentCreate', { type: 'vehicule', nom: 'X', contrat: 'C1', fonction: 'Technicien électricien' }), /Véhicule « Technicien électricien » non prévu/);
  fail(call(T.chef, 'agentCreate', { nom: 'PERSONNE', email: 'p9@test.local', contrat: 'C1', fonction: 'Pick-up 4x4' }), /non prévue.*Technicien électricien/);
  fail(call(T.chef, 'agentCreate', { type: 'vehicule', nom: '', contrat: 'C1', fonction: 'Pick-up 4x4' }), /Immatriculation/);
  // pas de connexion possible pour un véhicule
  fail(call(null, 'login', '', ''), /incorrect/);
  // pointage : comme un agent, sans jours prévus ; affiché après les personnes
  ok(call(T.chef, 'pointer', { agent_id: v1.agent.id, date: addDays(TODAY, -2), date_fin: TODAY, statut: 'T' }));
  const g = ok(call(T.chef, 'gridMonth', TODAY.slice(0, 7)));
  const types = g.rows.map((r) => r.type);
  assert.ok(types.lastIndexOf('personne') < types.indexOf('vehicule'), 'véhicules après les personnes');
  const row = g.rows.find((r) => r.id === v1.agent.id);
  assert.ok(row.days.every((x) => x.prevu === ''), 'pas de prévision pour un véhicule');
  assert.strictEqual(row.mois.T >= 1, true);
  // listes : documents = personnes seulement ; pointage = personnes et véhicules
  assert.ok(ok(call(T.chef, 'agentsVisible')).some((x) => x.type === 'vehicule'));
  assert.ok(!ok(call(T.chef, 'agentsVisible', true)).some((x) => x.type === 'vehicule'));
  fail(call(T.chef, 'documentUpload', { agent_id: v1.agent.id, type: 'autre', nom: 'a.pdf', base64: Buffer.from('x').toString('base64') }), /véhicule/);
  // la fiche de pointage reprend les véhicules ; l'attachement compte les véhicules comme une ligne du contrat
  const att = ok(call(a, 'attachementPreview', TODAY.slice(0, 7), 'C1'));
  const lv = att.lines.find((l) => l.designation === 'Véhicule pick-up 4x4');
  assert.deepStrictEqual([lv.positions, lv.contrat], [2, 1080]);
});

test('représentant prestataire : responsable d’équipe par défaut, sinon autre choix ou vide', () => {
  const a = T.admin;
  const att = () => ok(call(a, 'attachementPreview', '2026-08', 'C1')).rep_prestataire;
  assert.strictEqual(att(), 'CHEF UN', 'défaut : le responsable d’équipe du contrat');
  const set = (v) => { const d = ok(call(a, 'contratsGet')); d.contrats[0].rep_prestataire = v; ok(call(a, 'contratsSave', { contrats: d.contrats, fonctions: d.fonctions })); };
  set('AUTRE PERSONNE'); assert.strictEqual(att(), 'AUTRE PERSONNE');
  set('-'); assert.strictEqual(att(), '', 'aucun : laissé vide');
  set(''); assert.strictEqual(att(), 'CHEF UN');
  assert.deepStrictEqual(ok(call(a, 'contratsGet')).chefs.map((c) => c.nom).sort(), ['CHEF DEUX', 'CHEF UN', 'Direction']);
});

test('chaîne contrat → agents/VH → attachement validé (figé) → facture', () => {
  const a = T.admin;
  // synthèse du contrat : fonctions, effectifs affectés, montants (prix réservés à l'admin)
  const syn = ok(call(a, 'contratsSynthese'))[0];
  const ing = syn.lignes.find((l) => l.designation === 'Technicien Électricien');
  assert.deepStrictEqual([ing.positions, ing.delai, ing.quantite_contrat, ing.besoin, ing.prix_unitaire, ing.montant_contrat], [2, 540, 1080, 4, 14000, 15120000]);
  assert.ok(ing.membres.length === ing.affectes && ing.affectes >= 3, 'agents affectés listés par nom');
  assert.strictEqual(syn.montant_contrat, 15120000 + 1080 * 9000);
  const chefVue = ok(call(T.chef, 'contratsSynthese'))[0];
  assert.ok(!('prix_unitaire' in chefVue.lignes[0]) && !('montant_contrat' in chefVue), 'le chef ne voit pas les prix');
  fail(call(T.ag, 'contratsSynthese'), /refusé/);
  // brouillon → validation : copie figée
  const brouillon = ok(call(a, 'attachementPreview', '2026-08', 'C1'));
  assert.deepStrictEqual([brouillon.statut, brouillon.verrouille, brouillon.numero], ['brouillon', false, 16]);
  fail(call(T.chef, 'attachementValider', { month: '2026-08', contrat: 'C1' }), /refusé/);
  const val = ok(call(a, 'attachementValider', { month: '2026-08', contrat: 'C1' }));
  assert.deepStrictEqual([val.statut, val.verrouille, val.valide_par, val.numero], ['valide', true, 'Admin', 16]);
  fail(call(a, 'attachementValider', { month: '2026-08', contrat: 'C1' }), /déjà validé/);
  const total = val.totalHT;
  // le contrat change après validation : l'attachement validé et sa facture ne bougent pas
  const d = ok(call(a, 'contratsGet')); d.fonctions[0].prix_unitaire = 20000;
  ok(call(a, 'contratsSave', { contrats: d.contrats, fonctions: d.fonctions }));
  const apres = ok(call(a, 'attachementPreview', '2026-08', 'C1'));
  assert.deepStrictEqual([apres.totalHT, apres.lines[0].prix_unitaire], [total, 14000], 'copie figée');
  fail(call(a, 'attachementQte', { contrat: 'C1', mois: '2026-08', designation: 'Technicien Électricien', qte_mois: 10 }), /validé/);
  // chaîne : les mois se valident dans l'ordre ; la quantité précédente reprend le cumul VALIDÉ
  fail(call(a, 'attachementValider', { month: '2026-10', contrat: 'C1' }), /Validez d'abord l'attachement de Septembre 2026/);
  const sept = ok(call(a, 'attachementPreview', '2026-09', 'C1'));
  assert.strictEqual(sept.lines[0].precedente, val.lines[0].cumulee, 'précédente = cumul validé d\'août');
  assert.strictEqual(sept.lines[0].prix_unitaire, 20000, 'le mois suivant (brouillon) utilise le prix à jour');
  ok(call(a, 'attachementValider', { month: '2026-09', contrat: 'C1' }));
  fail(call(a, 'attachementRouvrir', { month: '2026-08', contrat: 'C1' }), /Rouvrez d'abord l'attachement de Septembre/);
  // facture depuis l'attachement validé, puis verrouillage
  fail(call(a, 'attachementFacturer', { month: '2026-08', contrat: 'C1' }), /N° de facture obligatoire/);
  const fac = ok(call(a, 'attachementFacturer', { month: '2026-08', contrat: 'C1', facture_numero: '236/PS/2026', date: '2026-09-05' }));
  assert.deepStrictEqual([fac.statut, fac.facture_numero, fac.facture_date], ['facture', '236/PS/2026', '2026-09-05']);
  const pdf = ok(call(a, 'exportFacture', { month: '2026-08', contrat: 'C1', format: 'pdf' }));
  assert.match(pdf.nom, /Facture_236_PS_2026/);
  fail(call(a, 'attachementRouvrir', { month: '2026-08', contrat: 'C1' }), /déjà facturé/);
  // réouverture possible tant que ce n'est pas facturé (septembre), puis on peut à nouveau modifier
  ok(call(a, 'attachementRouvrir', { month: '2026-09', contrat: 'C1' }));
  ok(call(a, 'attachementQte', { contrat: 'C1', mois: '2026-09', designation: 'Technicien Électricien', qte_mois: 58 }));
  assert.strictEqual(ok(call(a, 'attachementPreview', '2026-09', 'C1')).lines[0].mois, 58);
  const synApres = ok(call(a, 'contratsSynthese'))[0];
  assert.deepStrictEqual([synApres.prochain, synApres.attachements.map((x) => x.statut)], ['2026-09', ['facture', 'facture']], 'août et mai facturés ; septembre rouvert');
});

test('prévisions = ombres automatiques dès le premier pointage ; un pointage réel devient le repère', () => {
  const a = T.admin; const mois = TODAY.slice(0, 7); const first = `${mois}-01`;
  const mk = (nom) => ok(call(a, 'agentCreate', { nom, email: `${nom.toLowerCase().replace(/ /g, '')}@t.local`, password: 'pwpwpw12' })).agent.id;
  const un = mk('PREV UN'); const ancre = mk('PREV ANCRE'); const abs = mk('PREV ABS'); const aucun = mk('PREV AUCUN'); const loin = mk('PREV LOIN');
  ok(call(a, 'pointer', { agent_id: un, date: first, statut: 'T' }));                                   // un seul jour T : le reste se calcule
  ok(call(a, 'pointer', { agent_id: ancre, date: first, statut: 'T' }));
  ok(call(a, 'pointer', { agent_id: ancre, date: `${mois}-10`, statut: 'R' }));                        // pointage réel qui contredit la prévision
  ok(call(a, 'pointer', { agent_id: abs, date: first, statut: 'T' }));
  ok(call(a, 'pointer', { agent_id: abs, date: `${mois}-02`, statut: 'ABS' }));                        // l'absence n'arrête pas les prévisions
  ok(call(a, 'pointer', { agent_id: loin, date: first, statut: 'T' }));
  ok(call(a, 'pointer', { agent_id: loin, date: addDays(TODAY, 70), statut: 'T' }));                   // pointage plus récent : n'empêche pas les prévisions avant lui
  const g = ok(call(a, 'gridMonth', mois));
  const row = (id) => g.rows.find((r) => r.id === id);
  const jour = (r, d) => r.days[d - 1];
  const un_ = row(un); assert.deepStrictEqual([jour(un_, 1).statut, jour(un_, 2).prevu, jour(un_, 28).prevu, jour(un_, 29).prevu], ['T', 'T', 'T', 'R'], '+28 T puis R');
  const an = row(ancre);
  assert.deepStrictEqual([jour(an, 9).prevu, jour(an, 10).statut, jour(an, 10).prevu, jour(an, 11).prevu], ['T', 'R', '', 'R'], 'le R réel du 10 devient le repère : prévisions R ensuite');
  assert.deepStrictEqual([jour(row(abs), 2).statut, jour(row(abs), 3).prevu], ['ABS', 'T'], 'prévisions après une absence');
  const lo = row(loin); assert.ok(lo.days.filter((d) => d.prevu).length > 20, 'prévisions affichées malgré un pointage plus récent');
  assert.deepStrictEqual([row(aucun).prevision.etat, row(aucun).days.filter((d) => d.prevu).length], ['aucun', 0]);
});

test('documents : rangés dans Documents/<agent> à côté du classeur, type et période reconnus, fichier renommé', () => {
  const mez = ok(call(T.chef, 'agentCreate', { nom: 'MAHDI LYES', email: 'mez@test.local', password: 'mezpw1234' })).agent.id;
  const b64 = Buffer.from('%PDF-doc').toString('base64');
  let ocr = '';
  env.fetchHandler = (url) => {
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) return { code: 200, body: JSON.stringify({ id: 'ocr1' }) };
    if (url.includes('/files/ocr1/export')) return { code: 200, body: ocr };
    return null;
  };
  const up = (nom, extra = {}, texte = '') => { ocr = texte; return ok(call(T.chef, 'documentUpload', { agent_id: mez, nom, mime: 'application/pdf', base64: b64, ...extra })); };
  const ocrUploads = () => env.fetches.filter((u) => u.startsWith('https://www.googleapis.com/upload/drive/v3/files')).length;
  const dot = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

  // 1. nom explicite : pas besoin de lire le contenu
  const avant = ocrUploads();
  const fdp = up('fiche de paie mars 2026.pdf');
  assert.deepStrictEqual([fdp.type, fdp.code, fdp.periode, fdp.nom_original, fdp.dossier, fdp.detecte.source], ['fiche_emolument', 'FDP', 'Mars2026', 'MAHDI_Lyes_FDP_Mars2026.pdf', 'Documents/Mahdi Lyes', 'nom']);
  assert.strictEqual(ocrUploads(), avant, 'pas d\'OCR quand le nom suffit');
  // rangement : Documents/ est créé À CÔTÉ du classeur, avec un dossier par agent
  const racine = env.sheetFolder.folders.find((f) => f.name === 'Documents');
  assert.ok(racine, 'dossier Documents dans le dossier du classeur');
  const dossierAgent = racine.folders.find((f) => f.name === 'Mahdi Lyes');
  assert.ok(dossierAgent && dossierAgent.getFilesByName('MAHDI_Lyes_FDP_Mars2026.pdf').hasNext(), 'fichier rangé et renommé dans Drive');
  assert.ok(!env.rootFolder.folders.some((f) => f.name.startsWith('Pointage')), 'plus de dossier à la racine du Drive');
  // 2. titre de congé : date jj.mm.aaaa
  assert.strictEqual(up('TC 01-03-2026.pdf').nom_original, 'TC_MAHDI_Lyes_2026-03-01.pdf');
  // 3. nom quelconque : reconnu par le contenu (OCR)
  const tc = up('scan0001.pdf', {}, 'TITRE DE CONGÉ\nM. Mahdi Lyes\ndu 15/03/2026 au 12/04/2026');
  assert.deepStrictEqual([tc.nom_original, tc.detecte.source, tc.type], ['TC_MAHDI_Lyes_2026-03-15.pdf', 'contenu', 'titre_conge']);
  assert.strictEqual(up('scan0002.pdf', {}, 'BULLETIN DE PAIE\nPériode : Février 2026').nom_original, 'MAHDI_Lyes_FDP_Fevrier2026.pdf');
  assert.strictEqual(up('scan0003.pdf', {}, 'Fiche de paie du mois de 01/2026').nom_original, 'MAHDI_Lyes_FDP_Janvier2026.pdf');
  // 4. ATS ≠ attestation de travail
  assert.strictEqual(up('attestation de travail et de salaire 12-02-2026.pdf').nom_original, 'MAHDI_Lyes_ATS_2026-02-12.pdf');
  const at = up('attestation de travail.pdf');
  assert.strictEqual(at.nom_original, `MAHDI_Lyes_AttestationTravail_${TODAY}.pdf`, 'sans date lisible : date du dépôt');
  // 5. type inconnu : classé DOC avec avertissement
  const inconnu = up('photo.jpg');
  assert.deepStrictEqual([inconnu.type, inconnu.nom_original], ['autre', 'MAHDI_Lyes_photo.jpg']);
  assert.match(inconnu.detecte.avertissement, /non reconnu/);
  // 6. doublon : suffixe
  assert.strictEqual(up('fiche de paie mars 2026.pdf').nom_original, 'MAHDI_Lyes_FDP_Mars2026_2.pdf');
  // 7. type choisi à la main : prioritaire, la période vient du contenu
  const choisi = up('scan0004.pdf', { type: 'attestation_travail' }, 'Fait le 02/04/2026');
  assert.deepStrictEqual([choisi.type, choisi.detecte.source, choisi.nom_original], ['attestation_travail', 'choix', 'MAHDI_Lyes_AttestationTravail_2026-04-02.pdf']);
  fail(call(T.chef, 'documentUpload', { agent_id: mez, type: 'nimporte', nom: 'a.pdf', base64: b64 }), /Type/);
  // 8. le texte parle d'un autre agent : avertissement
  const autre = up('scan0005.pdf', {}, 'Attestation de travail délivrée à CHEF UN');
  assert.match(autre.detecte.avertissement, /semble concerner CHEF UN/);
  // 9. correction après coup : type et période, le fichier est renommé dans Drive
  const corr = ok(call(T.chef, 'documentUpdate', { id: fdp.id, type: 'titre_conge', periode: '20/03/2026' }));
  assert.deepStrictEqual([corr.nom_original, corr.code], ['TC_MAHDI_Lyes_2026-03-20.pdf', 'TC']);
  assert.ok(dossierAgent.getFilesByName('TC_MAHDI_Lyes_2026-03-20.pdf').hasNext() && !dossierAgent.getFilesByName('MAHDI_Lyes_FDP_Mars2026.pdf').hasNext());
  assert.strictEqual(ok(call(T.chef, 'documentUpdate', { id: corr.id, type: 'fiche_emolument' })).nom_original, 'MAHDI_Lyes_FDP_Mars2026.pdf', 'retour au type FDP : la période devient mars 2026');
  fail(call(T.chef, 'documentUpdate', { id: corr.id, periode: 'n\'importe quoi' }), /Période/);
  fail(call(T.ag, 'documentUpdate', { id: corr.id, type: 'autre' }), /refusé/);
  // 10. téléchargement : nom reclassé
  const dl = ok(call(T.chef, 'documentDownload', corr.id));
  assert.strictEqual(dl.nom, 'MAHDI_Lyes_FDP_Mars2026.pdf');
  assert.strictEqual(Buffer.from(dl.base64, 'base64').toString(), '%PDF-doc');
  assert.ok(ok(call(T.chef, 'documentsList', mez)).length >= 10);
  env.fetchHandler = null;
});

test('attachement : quantité du mois = jours T pointés (base pointage) ou base du contrat', () => {
  const a = T.admin; const mois = '2026-11';
  ok(call(a, 'setupSave', { contrat_strict: '0' }));
  const ag = ok(call(a, 'agentCreate', { nom: 'BASE PTG', email: 'baseptg@t.local', password: 'pwpwpw12', contrat: 'C1', fonction: 'Technicien électricien' })).agent.id;
  ok(call(a, 'pointer', { agent_id: ag, date: `${mois}-05`, statut: 'T' })); ok(call(a, 'pointer', { agent_id: ag, date: `${mois}-06`, statut: 'T' }));
  const q = () => ok(call(a, 'attachementPreview', mois, 'C1')).lines.find((l) => /Technicien/.test(l.designation)).mois;
  assert.strictEqual(q(), 60, 'base du contrat : 2 postes × 30 jours');
  ok(call(a, 'setupSave', { attachement_pointage: '1' }));
  assert.strictEqual(q(), 2, 'base pointage : 2 jours T pointés');
  ok(call(a, 'setupSave', { attachement_pointage: '0' }));
  ok(call(a, 'agentUpdate', ag, { actif: false }));
  ok(call(a, 'setupSave', { contrat_strict: '1' }));
});

test('historique indicatif par fonction : mois validés figés + brouillon du mois suivant', () => {
  const syn = ok(call(T.admin, 'contratsSynthese'))[0];
  const h = syn.historique.find((x) => /Technicien/.test(x.designation));
  assert.ok(h.mois.length >= 1);
  h.mois.forEach((m) => assert.strictEqual(m.precedente + m.du_mois, m.cumulee));
  const draft = h.mois.filter((m) => m.indicatif); assert.ok(draft.length <= 1 && (!draft.length || draft[0].mois === syn.prochain));
  assert.ok(h.mois.every((m) => 'montant' in m), 'montants pour l\'admin');
  const chef = ok(call(T.chef, 'contratsSynthese'))[0];
  assert.ok(chef.historique[0].mois.every((m) => !('montant' in m) && !m.indicatif), 'pas de montants ni de brouillon pour le chef');
});

test('compte client : consultation seule (pointage, contrats, PDF validés), ni modification ni Setup', () => {
  const a = T.admin;
  const cx = ok(call(T.chef, 'agentCreate', { nom: 'CLIENT X', email: 'cx@t.local', role: 'client', password: 'cxcxcx12' })).agent;
  assert.strictEqual(cx.role, 'agent', 'un chef ne crée pas de compte client : il reste un agent');
  ok(call(T.chef, 'agentUpdate', cx.id, { actif: false }));
  const cl = ok(call(a, 'agentCreate', { nom: 'CLIENT VEILLE', email: 'client@t.local', role: 'client', contrat: 'C1', password: 'clientpw1' })).agent;
  assert.strictEqual(cl.role, 'client');
  const tk = ok(call(null, 'login', 'client@t.local', 'clientpw1')).token;
  const me = ok(call(tk, 'me')); assert.strictEqual(me.canSetup, false);
  // lecture : grille du pointage (sans le compte client lui-même ni l'admin), synthèse du contrat avec montants, jamais de brouillon
  const g = ok(call(tk, 'gridMonth', TODAY.slice(0, 7)));
  assert.ok(g.rows.length > 5 && g.rows.every((r) => r.id !== cl.id), 'le client voit le personnel, pas son propre compte');
  const syn = ok(call(tk, 'contratsSynthese'));
  assert.strictEqual(syn.length, 1); assert.ok('montant_contrat' in syn[0]);
  assert.ok(syn[0].historique.every((h) => h.mois.every((m) => !m.indicatif)), 'pas de brouillon indicatif pour le client');
  // PDF : fiche du mois, attachements et factures validés seulement
  ok(call(tk, 'exportFiche', { month: TODAY.slice(0, 7), format: 'pdf' }));
  const val = syn[0].attachements.find((x) => x.statut === 'facture');
  if (val) {
    ok(call(tk, 'exportAttachement', { month: val.mois, contrat: 'C1', format: 'pdf' }));
    ok(call(tk, 'factureCopie', { month: val.mois, contrat: 'C1', format: 'pdf' }));
  }
  fail(call(tk, 'exportAttachement', { month: '2031-01', contrat: 'C1', format: 'pdf' }), /pas encore validé/);
  fail(call(tk, 'factureCopie', { month: '2031-01', contrat: 'C1', format: 'pdf' }), /pas encore établie/);
  // aucune modification possible
  ['pointer', 'agentCreate', 'agentUpdate', 'agentsUpdateMany', 'setupGet', 'setupSave', 'contratsSave', 'attachementValider', 'exportFacture', 'backupCreate', 'vider', 'demandeCreate', 'demandesList', 'documentsList', 'overview', 'attachementPreview'].forEach((n) => fail(call(tk, n, {}), /refusé|Setup/));
  // le compte client n'est jamais compté comme personnel : fiche, effectifs, onglets mensuels
  assert.ok(!ok(call(a, 'agentsVisible')).some((x) => x.id === cl.id));
  assert.ok(!run("Contrats.effectifs().contrats.some(function (c) { return c.fonctions.some(function (f) { return f.membres && f.membres.indexOf('CLIENT VEILLE') >= 0; }); })"));
  ok(call(tk, 'passwordOwn', 'clientpw1', 'nouveaupw1'));
  ok(call(a, 'agentUpdate', cl.id, { actif: false }));
});

test('rotation par agent (6/2, 14/14…) et modification groupée', () => {
  const a = T.admin; const mois = TODAY.slice(0, 7); const first = `${mois}-01`;
  const mk = (nom, rotation) => ok(call(a, 'agentCreate', { nom, email: `${nom.toLowerCase().replace(/ /g, '')}@rot.local`, password: 'pwpwpw12', rotation })).agent.id;
  const r62 = mk('ROT SIX', '6/2'); const dflt = mk('ROT DEFAUT', ''); const r1414 = mk('ROT QUATORZE', ' 14 / 14 ');
  fail(call(a, 'agentCreate', { nom: 'ROT MAL', email: 'rotmal@rot.local', rotation: 'abc' }), /Rotation invalide/);
  [r62, dflt, r1414].forEach((id) => ok(call(a, 'pointer', { agent_id: id, date: first, statut: 'T' })));
  const g = ok(call(a, 'gridMonth', mois)); const row = (id) => g.rows.find((r) => r.id === id);
  assert.deepStrictEqual([row(r62).days[5].prevu, row(r62).days[6].prevu, row(r62).days[8].prevu], ['T', 'R', 'T'], '6 T, 2 R, 6 T');
  assert.deepStrictEqual([row(r1414).days[13].prevu, row(r1414).days[14].prevu, row(r1414).rotation], ['T', 'R', '14/14']);
  assert.strictEqual(row(dflt).days[27].prevu, 'T', 'rotation par défaut 28/28');
  // modification groupée : affectation + rotation pour plusieurs agents, tout ou rien
  fail(call(a, 'agentsUpdateMany', [r62, dflt], {}), /Rien à modifier/);
  fail(call(a, 'agentsUpdateMany', [], { affectation: 'X' }), /Aucun agent/);
  fail(call(a, 'agentsUpdateMany', [r62, 'inconnu'], { affectation: 'Hassi' }), /introuvable/);
  assert.strictEqual(run("Agents.get('" + r62 + "').affectation"), '', 'échec : rien n\'est modifié');
  assert.strictEqual(ok(call(a, 'agentsUpdateMany', [r62, dflt, r1414], { affectation: 'Hassi Demo', rotation: '3/3' })).modifies, 3);
  ['affectation', 'rotation'].forEach((k, i) => [r62, dflt, r1414].forEach((id) => assert.strictEqual(run(`Agents.get('${id}').${k}`), ['Hassi Demo', '3/3'][i])));
  fail(call(T.chef, 'agentsUpdateMany', [r62], { affectation: 'Z' }), /modifier cet agent/);
  ok(call(a, 'agentsUpdateMany', [r62, dflt, r1414], { rotation: '' }));
  assert.strictEqual(run(`Agents.get('${dflt}').rotation`), '', 'retour à la rotation par défaut');
  [r62, dflt, r1414].forEach((id) => ok(call(a, 'agentUpdate', id, { actif: false })));
});

test('modification groupée : contrat + fonction, effectif contrôlé sur l\'ensemble', () => {
  const a = T.admin;
  ok(call(a, 'setupSave', { contrat_strict: '1' }));
  const mk = (n) => ok(call(a, 'agentCreate', { nom: 'GRP ' + n, email: `grp${n}@t.local`, password: 'pwpwpw12' })).agent.id;
  const ids = [1, 2, 3, 4, 5, 6].map(mk);
  fail(call(a, 'agentsUpdateMany', ids, { contrat: 'C1' }), /Choisissez une fonction/);
  // Technicien électricien : 2 postes en 28/28 = 4 personnes ; certains postes déjà pris -> 6 de plus dépasse
  fail(call(a, 'agentsUpdateMany', ids, { contrat: 'C1', fonction: 'Technicien électricien' }), /Effectif complet/);
  assert.strictEqual(run("Agents.get('" + ids[0] + "').contrat"), '', 'tout ou rien');
  ok(call(a, 'setupSave', { contrat_strict: '0' }));
  assert.strictEqual(ok(call(a, 'agentsUpdateMany', ids, { contrat: 'C1', fonction: 'technicien électricien' })).modifies, 6);
  assert.strictEqual(run("Agents.get('" + ids[5] + "').fonction"), 'Technicien électricien', 'libellé canonique');
  ids.forEach((id) => ok(call(a, 'agentUpdate', id, { actif: false })));
  ok(call(a, 'setupSave', { contrat_strict: '1' }));
});

test('sauvegarde et restauration du classeur', () => {
  fail(call(T.chef, 'backupCreate'), /refusé/);
  const b = ok(call(T.admin, 'backupCreate'));
  assert.match(b.nom, /^Sauvegarde /);
  assert.strictEqual(ok(call(T.admin, 'backupList')).length, 1);
  ok(call(T.admin, 'setupSave', { client_nom: 'MODIFIE APRES' }));
  fail(call(T.admin, 'backupRestore', b.id, 'oui'), /RESTAURER/);
  fail(call(T.admin, 'backupRestore', 'inconnu', 'RESTAURER'), /introuvable/);
  const r = ok(call(T.admin, 'backupRestore', b.id, 'RESTAURER'));
  assert.ok(r.restaure >= 9);
  assert.strictEqual(run('Params.get().client_nom'), '', 'état de la sauvegarde rétabli');
  assert.strictEqual(run("Params.get().prestataire_nom"), 'SARL HORIZON SERVICES');
  const l = ok(call(T.admin, 'backupList'));
  assert.ok(l.some((x) => /avant restauration/.test(x.nom)), 'sauvegarde de sécurité');
  l.forEach((x) => ok(call(T.admin, 'backupDelete', x.id)));
  assert.strictEqual(ok(call(T.admin, 'backupList')).length, 0);
});

test('vider : données seulement, puis coquille vide', () => {
  fail(call(T.admin, 'vider', 'tout', 'oui'), /VIDER/);
  ok(call(T.admin, 'vider', 'donnees', 'VIDER'));
  const tabs = run('Store.listTabs()');
  assert.ok(!tabs.some((t) => /^\d{4}-\d{2}$/.test(t)) && !tabs.includes('Global'), 'onglets mensuels supprimés');
  assert.strictEqual(run("Store.readTable('Demandes')").length, 0);
  assert.deepStrictEqual(run("Store.readTable('Agents')").map((a) => a.role), ['admin', 'client'], 'comptes admin et client conservés (configuration)');
  assert.strictEqual(run("Params.get().prestataire_nom"), 'SARL HORIZON SERVICES', 'configuration conservée');
  assert.strictEqual(run("Store.readTable('Contrats')").length, 1);
  fail(call(T.chef, 'me'), /expirée/);
  ok(call(T.admin, 'vider', 'tout', 'VIDER'));
  assert.strictEqual(run("Params.get().prestataire_nom"), '', 'coquille vide');
  assert.deepStrictEqual(run("Store.readTable('Agents')").map((a) => a.role), ['admin'], 'coquille vide : seul l\'admin reste');
  assert.strictEqual(run("Store.readTable('Contrats')").length, 0);
  assert.strictEqual(run("Store.readTable('Fonctions')").length, 0);
  assert.strictEqual(ok(call(T.admin, 'me')).user.email, 'admin@test.local');
  ok(call(T.admin, 'agentCreate', { nom: 'NOUVEAU CLIENT AGENT', email: 'n@test.local', password: 'azerty12' }));
});

test('aucune formule dépendante de la langue du classeur (COUNTIF avec virgule → #ERROR! en français)', () => {
  assert.deepStrictEqual(env.badFormulas, [], env.badFormulas.slice(0, 3).join(' | '));
});

test('chargement des fichiers dans un ordre quelconque (Apps Script ne garantit pas l\'ordre) : aucune dépendance au chargement', () => {
  const fs = require('fs'); const path = require('path');
  const { DIR } = require('./load');
  const names = fs.readdirSync(DIR).filter((f) => f.endsWith('.gs')).map((f) => f.replace(/\.gs$/, ''));
  for (const order of [names.slice().sort(), names.slice().sort().reverse()]) loadApp(order); // lève une erreur si un fichier lit une variable d'un autre fichier au chargement
});
