/**
 * Remarques du client sur le pointage : le compte client (consultation) signale un jour d'un agent de son contrat ;
 * le prestataire (chef de groupe, administrateur) les voit dans les grilles, les marque « vu » et peut répondre.
 */
var Remarques = (function () {
  function all() { return Store.readTable('Remarques'); }
  function clip(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]+/g, ' ').trim().slice(0, n); }
  function visibleIds(user) { var m = {}; Agents.visibleTo(user).forEach(function (a) { m[a.id] = a; }); return m; }

  function add(user, data) {
    if (user.role !== 'client') throw httpErr_('Réservé au compte client', 'FORBIDDEN');
    data = data || {};
    var agent = visibleIds(user)[data.agent_id];
    if (!agent) throw httpErr_('Agent introuvable');
    if (!Dates.isDate(data.date)) throw httpErr_('Date invalide');
    var texte = clip(data.texte, 600); if (!texte) throw httpErr_('Écrivez votre remarque');
    if (!Format.allow('REM_' + Store.tenantCode() + '_' + user.id, 30, 3600)) throw httpErr_('Trop de remarques en peu de temps, réessayez plus tard');
    var r = { id: newId_('R'), agent_id: agent.id, date: data.date, texte: texte, auteur_id: user.id, auteur_nom: user.nom, contrat: agent.contrat || user.contrat || '', date_creation: new Date().toISOString(), statut: 'nouveau', reponse: '', date_reponse: '' };
    Store.writeTable('Remarques', all().concat([r]));
    notify(user, agent, r);
    return enrich(r, visibleIds(user));
  }
  // Prévient par e-mail celui qui suit l'agent (chef de groupe, sinon les administrateurs).
  function notify(user, agent, r) {
    try {
      var agents = Agents.list(); var chef = agent.chef_id ? agents.filter(function (a) { return a.id === agent.chef_id && a.actif === '1'; })[0] : null;
      var dest = (chef ? [chef] : agents.filter(function (a) { return a.role === 'admin' && a.actif === '1'; })).filter(function (a) { return /^\S+@\S+\.\S+$/.test(a.email || ''); }).slice(0, 3);
      dest.forEach(function (a) {
        MailApp.sendEmail({ to: a.email, replyTo: user.email || undefined, subject: 'Remarque du client — ' + agent.nom + ' le ' + Dates.frDate(r.date),
          body: 'Bonjour ' + a.nom + ',\n\n' + user.nom + ' (client) a laissé une remarque sur le pointage de ' + agent.nom + ' du ' + Dates.frDate(r.date) + ' :\n\n« ' + r.texte + ' »\n\nOuvrez Sijil, onglet Pointage, pour la consulter et répondre.' });
      });
    } catch (e) { Logger.log('Remarque non notifiée : ' + e.message); }
  }
  function enrich(r, agentsById) { var a = agentsById[r.agent_id] || {}; var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; }); o.agent_nom = a.nom || '?'; return o; }
  // Remarques entre deux dates pour les agents visibles de l'utilisateur.
  function between(user, from, to) {
    var by = visibleIds(user);
    return all().filter(function (r) { return by[r.agent_id] && r.date >= from && r.date <= to; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.date_creation < b.date_creation ? -1 : 1; }).map(function (r) { return enrich(r, by); });
  }
  // Le prestataire marque une remarque « vu » et/ou y répond.
  function traiter(user, id, data) {
    data = data || {};
    var rows = all(); var r = rows.filter(function (x) { return x.id === id; })[0];
    if (!r) throw httpErr_('Remarque introuvable');
    if (!visibleIds(user)[r.agent_id]) throw httpErr_('Accès refusé', 'FORBIDDEN');
    r.statut = 'vu';
    if (data.reponse !== undefined) { r.reponse = clip(data.reponse, 600); r.date_reponse = r.reponse ? new Date().toISOString() : ''; }
    Store.writeTable('Remarques', rows);
    return enrich(r, visibleIds(user));
  }
  function countNew(user) {
    if (user.role === 'client' || user.role === 'agent') return 0;
    var by = visibleIds(user);
    return all().filter(function (r) { return r.statut === 'nouveau' && by[r.agent_id]; }).length;
  }
  return { add: add, between: between, traiter: traiter, countNew: countNew };
})();
