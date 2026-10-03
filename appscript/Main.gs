/** Point d'entrée de l'application Web et dispatcher RPC (contrôle des droits). */
function doGet(e) {
  // Sonde utilisée par la page d'accueil : une adresse /exec accessible à tous répond par ce petit JSON.
  // Annuaire pour la page d'accueil : adresse dédiée éventuelle d'un code entreprise (aucune autre donnée).
  if (e && e.parameter && e.parameter.resolve !== undefined) {
    var out; try { Store.setTenant('', ''); out = Object.assign({ ok: true }, Tenants.resolve(e.parameter.resolve)); } catch (err) { out = { ok: false, error: err.message }; }
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }
  // Entreprises affichées sur la page d'accueil (« Ils nous font confiance ») : celles dont la vitrine est cochée.
  if (e && e.parameter && e.parameter.entreprises !== undefined) {
    var vit; try { Store.setTenant('', ''); vit = { ok: true, entreprises: Tenants.vitrine() }; } catch (err) { vit = { ok: false, error: err.message }; }
    return ContentService.createTextOutput(JSON.stringify(vit)).setMimeType(ContentService.MimeType.JSON);
  }
  // Demande d'essai déposée depuis la page d'accueil : ?prospect=<JSON en base64 url-safe>.
  if (e && e.parameter && e.parameter.prospect !== undefined) {
    var dep; try { Store.setTenant('', ''); dep = Prospects.soumettre(JSON.parse(Utilities.newBlob(Utilities.base64Decode(String(e.parameter.prospect).replace(/-/g, '+').replace(/_/g, '/'))).getDataAsString('UTF-8'))); } catch (err) { dep = { ok: false, error: err.message }; }
    return ContentService.createTextOutput(JSON.stringify(dep)).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.ping) return ContentService.createTextOutput(JSON.stringify({ ok: true, version: CFG.VERSION })).setMimeType(ContentService.MimeType.JSON);
  // La page ne dépend d'aucun paramètre : le code entreprise est lu côté navigateur (google.script.url.getLocation).
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Sijil')
    .setFaviconUrl('https://rayanem-dev.github.io/pointage-app/favicon-32.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

var STAFF = ['chef', 'admin'];
var WORKERS = ['agent', 'chef', 'admin']; // le compte client (consultation) n'accède ni aux demandes ni aux documents des agents
var VIEWERS = ['chef', 'admin', 'client']; // consultation du pointage et des contrats

// Un compte client rattaché à un contrat ne consulte que ce contrat.
function clientScope_(user, numero) { if (user.role === 'client' && user.contrat && user.contrat !== numero) throw httpErr_('Contrat non autorisé', 'FORBIDDEN'); }
function inScope_(user, agentId) { return Agents.visibleTo(user).some(function (a) { return a.id === agentId; }); }
// Le responsable d’équipe n'extrait l'attachement et la facture que si l'administrateur lui a accordé ce privilège.
function exportsOk_(user) { if (user.role === 'chef' && user.acces_exports !== '1') throw httpErr_("Accès aux exports non accordé (demandez-le à l'administrateur)", 'FORBIDDEN'); }
function monthOrNow_(m) { return Dates.isMonthKey(m) ? m : Dates.today().slice(0, 7); }

var HANDLERS = {
  // ----- public -----
  // Sans code (annuaire actif) : aucune information sur un client. Avec code : nom de la société pour l'écran de connexion.
  appInfo: {
    pub: true,
    fn: function (u, a) {
      var multi = Tenants.multi();
      var base = { multi: multi, version: CFG.VERSION, copyright: CFG.COPYRIGHT, shell: CFG.APP_SHELL_URL };
      if (multi && !a[0]) { base.installed = true; base.prestataire = ''; return base; }
      Tenants.use(a[0]);
      var p = Params.get(); base.installed = Setup.hasAdmin(); base.prestataire = p.prestataire_nom; base.code = Store.tenantCode();
      return base;
    }
  },
  charte: { pub: true, fn: function () { var c = charte_(); return { editeur: CFG.EDITEUR, copyright: CFG.COPYRIGHT, maj: c.maj, sections: c.sections }; } },
  changelog: { pub: true, fn: function () { return { version: CFG.VERSION, copyright: CFG.COPYRIGHT, versions: CHANGELOG }; } },
  login: { pub: true, fn: function (u, a) { return Auth.login(a[0], a[1], a[2], a[3]); } },
  resume: { pub: true, fn: function (u, a) { return Auth.resume(a[0]); } },
  forget: { pub: true, fn: function (u, a) { return Auth.forget(a[0]); } },
  passwordForgot: { pub: true, fn: function (u, a) { return Auth.forgot(a[0], a[1]); } },
  passwordReset: { pub: true, write: true, fn: function (u, a) { return Auth.resetPassword(a[0], a[1], a[2], a[3]); } },
  // ----- tout utilisateur connecté -----
  logout: { fn: function (u, a, token) { Auth.logout(token); return true; } },
  me: { fn: function (u) { return { owner: Tenants.isOwner(u), code: Store.tenantCode(), user: Agents.publicAgent(u), canSetup: Auth.canSetup(u), params: Params.pub(Params.get()), rotations: CFG.ROTATIONS }; } },
  // Pastilles du menu : documents déposés pour moi (dates et noms, le navigateur retient ce qu'il a déjà vu) et demandes à traiter.
  remarqueAdd: { roles: ['client'], write: true, fn: function (u, a) { return Remarques.add(u, a[0] || {}); } },
  remarqueTraiter: { roles: STAFF, write: true, fn: function (u, a) { return Remarques.traiter(u, a[0], a[1] || {}); } },
  badges: { fn: function (u) {
    var docs = Store.readTable('Documents').filter(function (d) { return d.agent_id === u.id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 20)
      .map(function (d) { return { date: d.date, nom: d.nom_original || d.titre }; });
    return { now: new Date().toISOString(), documents: docs, demandes: u.role === 'agent' ? 0 : Demandes.counts(u).a_traiter, remarques: Remarques.countNew(u) };
  } },
  params: { fn: function () { return Params.pub(Params.get()); } },
  passwordOwn: { write: true, fn: function (u, a) { Agents.changeOwnPassword(u, a[0], a[1]); return true; } },
  overview: {
    roles: WORKERS,
    fn: function (u, a) {
      var key = monthOrNow_(a[0]);
      var ov = Pointage.overview(u);
      var g = Pointage.grid(key, [u]);
      var chef = u.chef_id ? Agents.get(u.chef_id) : null;
      var p = Params.get();
      return {
        agent: Agents.publicAgent(u), chef: chef ? { id: chef.id, nom: chef.nom } : null, cumul: ov.cumul, mois: ov.mois, cycle: ov.cycle, aujourdhui: ov.aujourdhui, soldeChange: ov.soldeChange, contrat: Contrats.info(u.contrat), today: ov.today,
        month: key, nd: g.nd, label: g.label, grid: g.rows[0], rotation: { travail: Number(Agents.rotationParams(u, p).jours_travail), repos: Number(Agents.rotationParams(u, p).jours_repos) },
        demandes: Demandes.counts(u), documents: Documents.count(u.id)
      };
    }
  },
  gridPeriod: {
    roles: VIEWERS.concat(['agent']),
    fn: function (u, a) {
      var list = Agents.visibleTo(u);
      if (a[2]) list = list.filter(function (x) { return x.contrat === a[2]; });
      var tl = Pointage.timeline(monthOrNow_(a[0]), a[1], list, a[3] !== false);
      tl.remarques = Remarques.between(u, tl.from, tl.to);
      return tl;
    }
  },
  gridMonth: {
    roles: VIEWERS.concat(['agent']),
    fn: function (u, a) {
      var list = Agents.visibleTo(u);
      if (a[1]) list = list.filter(function (x) { return x.contrat === a[1]; });
      var g = Pointage.grid(monthOrNow_(a[0]), list);
      g.remarques = Remarques.between(u, g.month + '-01', g.month + '-31');
      return g;
    }
  },
  demandeModifier: { roles: WORKERS, write: true, fn: function (u, a) { return Demandes.modifier(u, a[0], a[1] || {}); } },
  demandesList: { roles: WORKERS, fn: function (u) { return Demandes.list(u); } },
  demandeCreate: { roles: WORKERS, write: true, fn: function (u, a) { return Demandes.create(u, a[0] || {}); } },
  documentsList: { roles: WORKERS, fn: function (u, a) { return Documents.list(u, a[0]); } },
  documentDownload: { roles: WORKERS, fn: function (u, a) { return Documents.download(u, a[0]); } },
  // ----- responsable d’équipe / admin -----
  // a[0] = true : personnes seulement (documents) ; sinon personnes et véhicules (pointage)
  agentsVisible: { roles: STAFF, fn: function (u, a) { return Agents.visibleTo(u).filter(function (x) { return !a[0] || x.type !== 'vehicule'; }).map(Agents.publicAgent); } },
  pointerCompleter: { roles: STAFF, write: true, fn: function (u, a) { return Pointage.completer(u, a[0] || {}); } },
  pointer: {
    roles: STAFF, write: true,
    fn: function (u, a) {
      var o = a[0] || {};
      if (!inScope_(u, o.agent_id)) throw httpErr_("Cet agent n'est pas dans votre groupe", 'FORBIDDEN');
      return Pointage.setStatus(o.agent_id, o.date, o.date_fin || undefined, o.statut || '');
    }
  },
  contratsLite: { roles: STAFF, fn: function () { return Contrats.effectifs(); } },
  agentsManage: {
    roles: STAFF,
    fn: function (u) {
      var all = Agents.list();
      if (u.role !== 'admin') all = all.filter(function (x) { return x.chef_id === u.id && x.role === 'agent'; });
      return Agents.alpha(all).map(Agents.publicAgent);
    }
  },
  agentCreate: { roles: STAFF, write: true, fn: function (u, a) { var r = Agents.create(u, a[0] || {}); return r; } },
  agentsUpdateMany: { roles: STAFF, write: true, fn: function (u, a) { return Agents.updateMany(u, a[0], a[1] || {}); } },
  agentUpdate: { roles: STAFF, write: true, fn: function (u, a) { return Agents.update(u, a[0], a[1] || {}); } },
  agentEnvoyerAcces: { roles: STAFF, write: true, fn: function (u, a) { return Agents.sendAccess(u, a[0], a[1]); } },
  agentPassword: { roles: STAFF, write: true, fn: function (u, a) { Agents.setPassword(u, a[0], String(a[1] || '')); return true; } },
  demandeRepondre: { roles: STAFF, write: true, fn: function (u, a) { return Demandes.repondre(u, a[0], a[1], a[2]); } },
  demandesEnvoyer: { roles: STAFF, write: true, fn: function (u, a) { return Demandes.envoyerDirection(u, a[0], a[1]); } },
  envoiTraiter: { roles: STAFF, write: true, fn: function (u, a) { return Demandes.traiterEnvoi(u, a[0], a[1], a[2]); } },
  documentUpload: { roles: STAFF, write: true, fn: function (u, a) { return Documents.upload(u, a[0] || {}); } },
  documentUpdate: { roles: STAFF, write: true, fn: function (u, a) { var o = a[0] || {}; return Documents.update(u, o.id, o); } },
  documentDelete: { roles: STAFF, write: true, fn: function (u, a) { Documents.remove(u, a[0]); return true; } },
  ficheApercu: { roles: STAFF, fn: function (u, a) { var o = a[0] || {}; return DocData.ficheApercu(o.month, o.contrat, Agents.visibleTo(u)); } },
  exportFiche: {
    roles: VIEWERS,
    fn: function (u, a) {
      var o = a[0] || {};
      if (u.role === 'client') { o.tous = false; if (u.contrat) o.contrat = u.contrat; }
      var data = DocData.ficheData(o.month, o.contrat, { prevu: !!o.prevu, tous: !!o.tous, agents: Agents.visibleTo(u) });
      return Export.render('fiche', data, o.format, 'Fiche_pointage_' + o.month);
    }
  },
  // ----- onglet Setup : admin, ou chef avec accès accordé par l'admin -----
  setupGet: { setup: true, fn: function (u) { var vals = Params.get(); if (!vals.client_emails) vals.client_emails = Contrats.contrats().map(function (c) { return c.client_email; }).filter(Boolean).join(', ').split(', ').filter(function (x, i, a) { return x && a.indexOf(x) === i; }).slice(0, 4).join(', '); return { defs: Params.defsForClient(), values: vals, isAdmin: u.role === 'admin', status: Setup.status() }; } },
  setupSave: { setup: true, write: true, fn: function (u, a) { var o = a[0] || {}; var res = Params.set(o); if ('client_emails' in o && u.role === 'admin') res = Object.assign({}, res, { comptes: Contrats.ensureClientAccounts(u) }); return res; } },
  logoUpload: { setup: true, write: true, fn: function (u, a) { return Params.logoUpload(a[0] || {}); } },
  logoRemove: { setup: true, write: true, fn: function (u, a) { return Params.logoRemove(a[0]); } },
  logoView: { setup: true, fn: function (u, a) { return Params.logoView(a[0]); } },
  bordereauAnalyser: { setup: true, fn: function (u, a) { return Bordereau.analyser(a[0] || {}); } },
  contratsGet: {
    setup: true,
    fn: function () {
      var chefs = Agents.list().filter(function (a) { return a.role === 'chef' && a.actif === '1'; }).map(function (c) { return { id: c.id, nom: c.nom, contrat: c.contrat }; });
      return { contrats: Contrats.contrats(), fonctions: Contrats.fonctions(), chefs: chefs };
    }
  },
  contratsSave: {
    setup: true, write: true,
    fn: function (u, a) {
      var o = a[0] || {}; var res = { contrats: Contrats.saveContrats(o.contrats), fonctions: Contrats.saveFonctions(o.fonctions) };
      res.comptes = u.role === 'admin' ? Contrats.ensureClientAccounts(u) : []; // compte de consultation du contact client, créé par défaut
      return res;
    }
  },
  // ----- admin -----
  moisList: { roles: ['admin'], fn: function () { return Store.listTabs().filter(Dates.isMonthKey).sort(); } },
  attachementQte: {
    roles: ['admin'], write: true,
    fn: function (u, a) {
      var o = a[0] || {};
      if (DocData.validation(o.contrat, o.mois)) throw httpErr_("Attachement validé : rouvrez-le pour modifier une quantité.");
      Contrats.saveOverride(o); return true;
    }
  },
  attachementValider: { roles: ['admin'], write: true, fn: function (u, a) { var o = a[0] || {}; return DocData.valider(u, o.month, o.contrat); } },
  attachementRouvrir: { roles: ['admin'], write: true, fn: function (u, a) { var o = a[0] || {}; return DocData.rouvrir(u, o.month, o.contrat); } },
  attachementFacturer: { roles: ['admin'], write: true, fn: function (u, a) { var o = a[0] || {}; return DocData.facturer(u, o.month, o.contrat, o); } },
  contratsSynthese: { roles: VIEWERS, fn: function (u) { return Contrats.synthese(u.role === 'admin', u.role !== 'chef', u.role === 'client' ? u.contrat : ''); } },
  attachementPreview: { roles: ['admin', 'chef'], fn: function (u, a) { exportsOk_(u); return DocData.attachementData(a[0], a[1]); } },
  exportAttachement: {
    roles: ['admin', 'chef', 'client'],
    fn: function (u, a) {
      var o = a[0] || {}; clientScope_(u, o.contrat); exportsOk_(u);
      var d = DocData.attachementData(o.month, o.contrat);
      if (u.role === 'client' && !d.verrouille) throw httpErr_("Cet attachement n'est pas encore validé", 'FORBIDDEN'); // le client ne voit que les attachements validés
      return Export.render('attachement', d, o.format, 'Attachement_N' + d.numero + '_' + o.month); }
  },
  // Copie PDF/Excel d'une facture déjà enregistrée (consultation : admin et client), sans rien modifier.
  factureCopie: {
    roles: ['admin', 'chef', 'client'],
    fn: function (u, a) {
      var o = a[0] || {}; clientScope_(u, o.contrat); exportsOk_(u);
      if (!DocData.attachementData(o.month, o.contrat).facture_numero) throw httpErr_("Cette facture n'est pas encore établie", 'FORBIDDEN');
      var d = DocData.factureData(o.month, o.contrat);
      return Export.render('facture', d, o.format, 'Facture_' + String(d.facture_numero || o.month).replace(/[^\w-]+/g, '_'));
    }
  },
  exportFacture: {
    roles: ['admin'], write: true,
    fn: function (u, a) {
      var o = a[0] || {};
      if (o.facture_numero) DocData.facturer(u, o.month, o.contrat, o); // enregistre n° et date sur l'attachement validé
      else if (!DocData.attachementData(o.month, o.contrat).facture_numero) throw httpErr_('N° de facture obligatoire');
      var d = DocData.factureData(o.month, o.contrat);
      return Export.render('facture', d, o.format, 'Facture_' + String(d.facture_numero || o.month).replace(/[^\w-]+/g, '_'));
    }
  },
  connexions: { roles: ['admin'], fn: function () { return { maintenant: new Date().toISOString(), gens: Auth.activity() }; } },
  repairStructure: { roles: ['admin'], write: true, fn: function () { return Setup.repairStructure(); } },
  vider: { roles: ['admin'], write: true, fn: function (u, a) { return Setup.vider(a[0], a[1]); } },
  pointageExport: { roles: ['admin'], fn: function (u, a) { return Archive.exportXlsx(u, a[0] || {}); } },
  pointageImportAnalyser: { roles: ['admin'], fn: function (u, a) { return PointageImport.analyser(a[0] || {}); } },
  pointageImportAppliquer: { roles: ['admin'], write: true, fn: function (u, a) { return PointageImport.appliquer(u, a[0] || {}); } },
  clients: { roles: ['admin'], fn: function (u) { return Tenants.clients(u); } },
  clientCreate: { roles: ['admin'], write: true, fn: function (u, a) { return Tenants.create(u, a[0] || {}); } },
  prospects: { roles: ['admin'], fn: function (u) { return Prospects.list(u); } },
  prospectUpdate: { roles: ['admin'], write: true, fn: function (u, a) { return Prospects.update(u, a[0], a[1] || {}); } },
  prospectConvertir: { roles: ['admin'], write: true, fn: function (u, a) { return Prospects.convertir(u, a[0], a[1] || {}); } },
  clientAcces: { roles: ['admin'], fn: function (u, a) { return Tenants.access(u, a[0]); } },
  clientAdmins: { roles: ['admin'], fn: function (u, a) { return Tenants.admins(u, a[0]); } },
  clientAdminUpdate: { roles: ['admin'], write: true, fn: function (u, a) { return Tenants.adminUpdate(u, a[0], a[1]); } },
  clientDelete: { roles: ['admin'], write: true, fn: function (u, a) { return Tenants.remove(u, a[0], a[1]); } },
  editeurContact: { roles: ['admin'], fn: function (u) { Tenants.requireOwner(u); return Tenants.contact(); } },
  editeurContactSave: { roles: ['admin'], write: true, fn: function (u, a) { return Tenants.setContact(u, a[0] || {}); } },
  apropos: { roles: ['admin'], fn: function (u) { return Tenants.apropos(u); } },
  commentaire: { roles: ['admin'], write: true, fn: function (u, a) { return Tenants.commentaire(u, a[0] || {}); } },
  clientEnvoyer: { roles: ['admin'], fn: function (u, a) { return Tenants.envoyerMessage(u, a[0], a[1], a[2]); } },
  clientTest: { roles: ['admin'], fn: function (u, a) { return Tenants.test(u, a[0]); } },
  clientUpdate: { roles: ['admin'], write: true, fn: function (u, a) { return Tenants.update(u, a[0], a[1] || {}); } },
  backupCreate: { roles: ['admin'], write: true, fn: function (u) { return Setup.backup(u); } },
  backupList: { roles: ['admin'], fn: function () { return Setup.listBackups(); } },
  backupRestore: { roles: ['admin'], write: true, fn: function (u, a) { return Setup.restore(u, a[0], a[1]); } },
  backupDelete: { roles: ['admin'], write: true, fn: function (u, a) { return Setup.removeBackup(a[0]); } }
};

/** Seule fonction appelée par l'interface : enveloppe { ok, data | error, code }. */
function rpc(token, name, args) {
  Store.setTenant('', ''); // chaque appel repart du classeur principal ; la session désigne ensuite le client
  try {
    var h = HANDLERS[name];
    if (!h) throw httpErr_('Fonction inconnue : ' + name);
    var user = h.pub ? null : Auth.userFromToken(token);
    if (h.roles && h.roles.indexOf(user.role) < 0) throw httpErr_('Accès refusé', 'FORBIDDEN');
    if (h.setup && !Auth.canSetup(user)) throw httpErr_("Accès au Setup non autorisé (demandez-le à l'administrateur)", 'FORBIDDEN');
    var run = function () { return h.fn(user, args || [], token); };
    return { ok: true, data: h.write ? Store.withLock(run) : run() };
  } catch (e) {
    if (!e.code) Logger.log(e.stack || e.message);
    return { ok: false, error: e.message, code: e.code || 'ERR' };
  }
}
