/** Point d'entrée de l'application Web et dispatcher RPC (contrôle des droits). */
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Pointage')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

var STAFF = ['chef', 'admin'];

function inScope_(user, agentId) { return Agents.visibleTo(user).some(function (a) { return a.id === agentId; }); }
function monthOrNow_(m) { return Dates.isMonthKey(m) ? m : Dates.today().slice(0, 7); }

var HANDLERS = {
  // ----- public -----
  appInfo: { pub: true, fn: function () { var p = Params.get(); return { installed: Setup.hasAdmin(), prestataire: p.prestataire_nom, version: CFG.VERSION }; } },
  login: { pub: true, fn: function (u, a) { return Auth.login(a[0], a[1]); } },
  // ----- tout utilisateur connecté -----
  logout: { fn: function (u, a, token) { Auth.logout(token); return true; } },
  me: { fn: function (u) { return { user: Agents.publicAgent(u), canSetup: Auth.canSetup(u), params: Params.pub(Params.get()) }; } },
  params: { fn: function () { return Params.pub(Params.get()); } },
  passwordOwn: { write: true, fn: function (u, a) { Agents.changeOwnPassword(u, a[0], a[1]); return true; } },
  overview: {
    fn: function (u, a) {
      var key = monthOrNow_(a[0]);
      var ov = Pointage.overview(u);
      var g = Pointage.grid(key, [u]);
      var chef = u.chef_id ? Agents.get(u.chef_id) : null;
      var p = Params.get();
      return {
        agent: Agents.publicAgent(u), chef: chef ? { id: chef.id, nom: chef.nom } : null, cumul: ov.cumul, mois: ov.mois, cycle: ov.cycle, aujourdhui: ov.aujourdhui, today: ov.today,
        month: key, nd: g.nd, label: g.label, grid: g.rows[0], rotation: { travail: Number(p.jours_travail), repos: Number(p.jours_repos) },
        demandes: Demandes.counts(u), documents: Documents.count(u.id)
      };
    }
  },
  gridMonth: {
    fn: function (u, a) {
      var list = Agents.visibleTo(u);
      if (a[1]) list = list.filter(function (x) { return x.contrat === a[1]; });
      return Pointage.grid(monthOrNow_(a[0]), list);
    }
  },
  demandesList: { fn: function (u) { return Demandes.list(u); } },
  demandeCreate: { write: true, fn: function (u, a) { return Demandes.create(u, a[0] || {}); } },
  documentsList: { fn: function (u, a) { return Documents.list(u, a[0]); } },
  documentDownload: { fn: function (u, a) { return Documents.download(u, a[0]); } },
  // ----- chef de groupe / admin -----
  agentsVisible: { roles: STAFF, fn: function (u) { return Agents.visibleTo(u).map(Agents.publicAgent); } },
  pointer: {
    roles: STAFF, write: true,
    fn: function (u, a) {
      var o = a[0] || {};
      if (!inScope_(u, o.agent_id)) throw httpErr_("Cet agent n'est pas dans votre groupe", 'FORBIDDEN');
      return Pointage.setStatus(o.agent_id, o.date, o.date_fin || undefined, o.statut || '');
    }
  },
  contratsLite: { roles: STAFF, fn: function () { return { contrats: Contrats.contrats().map(function (c) { return { numero: c.numero, client: c.client }; }), fonctions: Contrats.fonctions().map(function (f) { return f.libelle || f.designation; }) }; } },
  agentsManage: {
    roles: STAFF,
    fn: function (u) {
      var all = Agents.list();
      if (u.role !== 'admin') all = all.filter(function (x) { return x.chef_id === u.id && x.role === 'agent'; });
      return all.map(Agents.publicAgent);
    }
  },
  agentCreate: { roles: STAFF, write: true, fn: function (u, a) { var r = Agents.create(u, a[0] || {}); return r; } },
  agentUpdate: { roles: STAFF, write: true, fn: function (u, a) { return Agents.update(u, a[0], a[1] || {}); } },
  agentPassword: { roles: STAFF, write: true, fn: function (u, a) { Agents.setPassword(u, a[0], String(a[1] || '')); return true; } },
  demandeRepondre: { roles: STAFF, write: true, fn: function (u, a) { return Demandes.repondre(u, a[0], a[1], a[2]); } },
  demandesEnvoyer: { roles: STAFF, write: true, fn: function (u, a) { return Demandes.envoyerDirection(u, a[0], a[1]); } },
  envoiTraiter: { roles: STAFF, write: true, fn: function (u, a) { return Demandes.traiterEnvoi(u, a[0], a[1], a[2]); } },
  documentUpload: { roles: STAFF, write: true, fn: function (u, a) { return Documents.upload(u, a[0] || {}); } },
  documentDelete: { roles: STAFF, write: true, fn: function (u, a) { Documents.remove(u, a[0]); return true; } },
  exportFiche: {
    roles: STAFF,
    fn: function (u, a) {
      var o = a[0] || {};
      var data = DocData.ficheData(o.month, o.contrat, { prevu: !!o.prevu, agents: Agents.visibleTo(u) });
      return Export.render('fiche', data, o.format, 'Fiche_pointage_' + o.month);
    }
  },
  // ----- onglet Setup : admin, ou chef avec accès accordé par l'admin -----
  setupGet: { setup: true, fn: function (u) { return { defs: Params.defsForClient(), values: Params.get(), isAdmin: u.role === 'admin', status: Setup.status() }; } },
  setupSave: { setup: true, write: true, fn: function (u, a) { return Params.set(a[0] || {}); } },
  contratsGet: { setup: true, fn: function () { return { contrats: Contrats.contrats(), fonctions: Contrats.fonctions() }; } },
  contratsSave: {
    setup: true, write: true,
    fn: function (u, a) { var o = a[0] || {}; return { contrats: Contrats.saveContrats(o.contrats), fonctions: Contrats.saveFonctions(o.fonctions) }; }
  },
  // ----- admin -----
  moisList: { roles: ['admin'], fn: function () { return Store.listTabs().filter(Dates.isMonthKey).sort(); } },
  attachementQte: { roles: ['admin'], write: true, fn: function (u, a) { Contrats.saveOverride(a[0] || {}); return true; } },
  attachementPreview: { roles: ['admin'], fn: function (u, a) { return DocData.attachementData(a[0], a[1]); } },
  exportAttachement: {
    roles: ['admin'],
    fn: function (u, a) { var o = a[0] || {}; var d = DocData.attachementData(o.month, o.contrat); return Export.render('attachement', d, o.format, 'Attachement_N' + d.numero + '_' + o.month); }
  },
  exportFacture: {
    roles: ['admin'],
    fn: function (u, a) {
      var o = a[0] || {};
      var d = DocData.factureData(o.month, o.contrat, { facture_numero: o.facture_numero, date: o.date });
      return Export.render('facture', d, o.format, 'Facture_' + String(d.facture_numero || o.month).replace(/[^\w-]+/g, '_'));
    }
  },
  repairStructure: { roles: ['admin'], write: true, fn: function () { return Setup.repairStructure(); } },
  vider: { roles: ['admin'], write: true, fn: function (u, a) { return Setup.vider(a[0], a[1]); } }
};

/** Seule fonction appelée par l'interface : enveloppe { ok, data | error, code }. */
function rpc(token, name, args) {
  Store.reset();
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
