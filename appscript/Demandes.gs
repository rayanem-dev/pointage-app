/**
 * Demandes des agents. Toutes arrivent chez le chef de groupe (ou l'admin pour un agent sans chef).
 * Le chef les regroupe par thème et envoie UNE SEULE demande groupée à la direction.
 */
var Demandes = (function () {
  var T = CFG.TYPES_DEMANDE;

  function byId(list) { var m = {}; list.forEach(function (x) { m[x.id] = x; }); return m; }
  // Qui traite la demande d'un agent : son chef de groupe actif, sinon l'admin.
  function handlerId(agent, agentsById) {
    var chef = agent && agent.chef_id && agentsById[agent.chef_id];
    return chef && chef.actif === '1' ? chef.id : 'admin';
  }
  function canHandle(user, demande, agentsById) {
    if (user.role === 'admin') return true;
    return user.role === 'chef' && demande.agent_id !== user.id && handlerId(agentsById[demande.agent_id], agentsById) === user.id;
  }
  function enrich(d, agentsById) {
    var a = agentsById[d.agent_id] || {};
    var o = {};
    Object.keys(d).forEach(function (k) { o[k] = d[k]; });
    o.agent_nom = a.nom || '?'; o.agent_fonction = a.fonction || ''; o.type_label = T[d.type] || d.type;
    return o;
  }
  function sortDesc(a, b) { return a.date_creation < b.date_creation ? 1 : -1; }

  function create(user, data) {
    if (user.role === 'admin') throw httpErr_("L'administrateur ne fait pas de demande", 'FORBIDDEN');
    if (!T[data.type]) throw httpErr_('Type de demande invalide');
    ['date_debut', 'date_fin'].forEach(function (k) { if (data[k] && !Dates.isDate(data[k])) throw httpErr_('Date invalide'); });
    if (data.date_debut && data.date_fin && data.date_fin < data.date_debut) throw httpErr_('La date de fin précède la date de début');
    var d = {
      id: newId_('D'), agent_id: user.id, type: data.type, objet: String(data.objet || '').trim() || T[data.type], message: String(data.message || '').trim(),
      date_debut: data.date_debut || '', date_fin: data.date_fin || '', date_creation: new Date().toISOString(), statut: 'en_attente', envoi_id: '', reponse: '', traite_par: '', date_traitement: ''
    };
    Store.writeTable('Demandes', Store.readTable('Demandes').concat([d]));
    return d;
  }

  function groupBy(items) {
    var groups = {};
    items.forEach(function (d) { (groups[d.type] = groups[d.type] || []).push(d); });
    return Object.keys(T).filter(function (t) { return groups[t]; }).map(function (t) { return { type: t, label: T[t], items: groups[t] }; });
  }

  function list(user) {
    var agentsById = byId(Agents.list());
    var all = Store.readTable('Demandes').map(function (d) { return enrich(d, agentsById); });
    var mine = all.filter(function (d) { return d.agent_id === user.id; }).sort(sortDesc);
    var toHandle = user.role === 'agent' ? [] : all.filter(function (d) { return canHandle(user, d, agentsById); }).sort(sortDesc);
    var envois = [];
    if (user.role !== 'agent') {
      envois = Store.readTable('Envois').filter(function (e) { return user.role === 'admin' || e.chef_id === user.id; })
        .sort(function (a, b) { return a.date_envoi < b.date_envoi ? 1 : -1; }).slice(0, 40)
        .map(function (e) {
          var items = all.filter(function (d) { return d.envoi_id === e.id; });
          var o = {}; Object.keys(e).forEach(function (k) { o[k] = e[k]; });
          o.chef_nom = (agentsById[e.chef_id] || {}).nom || 'Administration'; o.groupes = groupBy(items);
          return o;
        });
    }
    return { mine: mine, toHandle: toHandle, envois: envois, types: T, statuts: CFG.STATUTS_DEMANDE };
  }

  // Décision directe (sans passer par la direction) ou réponse individuelle.
  function repondre(user, id, statut, reponse) {
    if (['acceptee', 'refusee', 'traitee'].indexOf(statut) < 0) throw httpErr_('Statut invalide');
    var agentsById = byId(Agents.list());
    var all = Store.readTable('Demandes');
    var d = all.filter(function (x) { return x.id === id; })[0];
    if (!d || !canHandle(user, d, agentsById)) throw httpErr_('Demande non accessible', 'FORBIDDEN');
    d.statut = statut; d.reponse = String(reponse || ''); d.traite_par = user.nom; d.date_traitement = new Date().toISOString();
    Store.writeTable('Demandes', all);
    return enrich(d, agentsById);
  }

  function buildMessage(envoi, groups, params, chef) {
    var lines = [];
    lines.push('Demande groupée N° ' + envoi.id + ' — ' + (params.prestataire_nom || 'Prestataire'));
    lines.push('Émise par : ' + (chef ? chef.nom : 'Administration') + ' le ' + Dates.frDate(envoi.date_envoi.slice(0, 10)));
    lines.push('Nombre de demandes : ' + envoi.nb);
    if (envoi.note) lines.push('Note : ' + envoi.note);
    groups.forEach(function (g) {
      lines.push(''); lines.push(g.label.toUpperCase() + ' (' + g.items.length + ')');
      g.items.forEach(function (d) {
        var periode = d.date_debut ? ' — du ' + Dates.frDate(d.date_debut) + (d.date_fin ? ' au ' + Dates.frDate(d.date_fin) : '') : '';
        lines.push(' • ' + d.agent_nom + (d.agent_fonction ? ' (' + d.agent_fonction + ')' : '') + periode + (d.message ? ' — ' + d.message : ''));
      });
    });
    return lines.join('\n');
  }

  // Regroupe les demandes en attente (par thème) en un seul envoi à la direction.
  function envoyerDirection(user, ids, note) {
    if (user.role === 'agent') throw httpErr_('Accès refusé', 'FORBIDDEN');
    var params = Params.get();
    var agentsById = byId(Agents.list());
    var all = Store.readTable('Demandes');
    var wanted = (ids && ids.length) ? ids : null;
    var chosen = all.filter(function (d) { return d.statut === 'en_attente' && canHandle(user, d, agentsById) && (!wanted || wanted.indexOf(d.id) >= 0); });
    if (!chosen.length) throw httpErr_('Aucune demande en attente à envoyer');
    var items = chosen.map(function (d) { return enrich(d, agentsById); });
    var groups = groupBy(items);
    var envoi = { id: newId_('E'), chef_id: user.id, date_envoi: new Date().toISOString(), nb: chosen.length, themes: groups.map(function (g) { return g.label + ' (' + g.items.length + ')'; }).join(', '), note: String(note || ''), statut: 'envoye', reponse: '', date_reponse: '' };
    chosen.forEach(function (d) { d.statut = 'envoyee'; d.envoi_id = envoi.id; });
    Store.writeTable('Demandes', all);
    Store.writeTable('Envois', Store.readTable('Envois').concat([envoi]));
    var text = buildMessage(envoi, groups, params, user);
    var mail = false;
    if (params.direction_email) {
      try {
        MailApp.sendEmail({ to: params.direction_email, subject: 'Demande groupée — ' + (params.prestataire_nom || 'Prestataire') + ' — ' + envoi.nb + ' demande(s)', body: text });
        mail = true;
      } catch (e) { Logger.log('Envoi e-mail impossible : ' + e.message); }
    }
    return { envoi: envoi, groupes: groups.map(function (g) { return { type: g.type, label: g.label, n: g.items.length }; }), mail: mail, texte: text };
  }

  // Réponse de la direction : applique le résultat à toutes les demandes encore « envoyées ».
  function traiterEnvoi(user, envoiId, statut, reponse) {
    if (['acceptee', 'refusee', 'traitee'].indexOf(statut) < 0) throw httpErr_('Statut invalide');
    var envois = Store.readTable('Envois');
    var e = envois.filter(function (x) { return x.id === envoiId; })[0];
    if (!e || (user.role !== 'admin' && e.chef_id !== user.id)) throw httpErr_('Envoi introuvable', 'FORBIDDEN');
    var all = Store.readTable('Demandes');
    var now = new Date().toISOString();
    all.forEach(function (d) {
      if (d.envoi_id === envoiId && d.statut === 'envoyee') { d.statut = statut; d.reponse = String(reponse || ''); d.traite_par = user.nom; d.date_traitement = now; }
    });
    e.statut = 'traite'; e.reponse = String(reponse || ''); e.date_reponse = now;
    Store.writeTable('Demandes', all); Store.writeTable('Envois', envois);
    return e;
  }
  function counts(user) {
    var agentsById = byId(Agents.list());
    var all = Store.readTable('Demandes');
    var mine = all.filter(function (d) { return d.agent_id === user.id; });
    return {
      total: mine.length, en_attente: mine.filter(function (d) { return d.statut === 'en_attente' || d.statut === 'envoyee'; }).length,
      a_traiter: user.role === 'agent' ? 0 : all.filter(function (d) { return d.statut === 'en_attente' && canHandle(user, d, agentsById); }).length
    };
  }
  return { create: create, list: list, repondre: repondre, envoyerDirection: envoyerDirection, traiterEnvoi: traiterEnvoi, counts: counts };
})();
