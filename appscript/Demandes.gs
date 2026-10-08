/**
 * Demandes des agents. Toutes arrivent chez le responsable d’équipe (ou l'admin pour un agent sans chef).
 * Le chef les regroupe par thème et envoie UNE SEULE demande groupée à la direction.
 */
var Demandes = (function () {
  // CFG est lu à l'appel (Apps Script charge les fichiers dans un ordre quelconque)
  var T = new Proxy({}, { get: function (t, k) { return CFG.TYPES_DEMANDE[k]; }, ownKeys: function () { return Object.keys(CFG.TYPES_DEMANDE); }, getOwnPropertyDescriptor: function (t, k) { return k in CFG.TYPES_DEMANDE ? { enumerable: true, configurable: true, value: CFG.TYPES_DEMANDE[k] } : undefined; } });

  var DECIDEES = ['acceptee', 'refusee', 'traitee'];
  function masque(t) { return CFG.TYPES_DEMANDE_MASQUES.indexOf(t) >= 0; }
  function byId(list) { var m = {}; list.forEach(function (x) { m[x.id] = x; }); return m; }
  // Qui traite la demande d'un agent : son responsable d’équipe actif, sinon l'admin.
  function handlerId(agent, agentsById) {
    var chef = agent && agent.chef_id && agentsById[agent.chef_id];
    return chef && chef.actif === '1' ? chef.id : 'admin';
  }
  function canHandle(user, demande, agentsById) {
    if (user.role === 'admin') return true;
    return user.role === 'chef' && demande.agent_id !== user.id && (Agents.tous(user) || handlerId(agentsById[demande.agent_id], agentsById) === user.id);
  }
  function enrich(d, agentsById) {
    var a = agentsById[d.agent_id] || {};
    var o = {};
    Object.keys(d).forEach(function (k) { o[k] = d[k]; });
    o.agent_nom = a.nom || '?'; o.agent_fonction = a.fonction || ''; o.type_label = T[d.type] || d.type;
    o.reprise = reprise(d, a);
    return o;
  }
  // Titre de congé : date de reprise = fin du congé + 1 jour ; sans date de fin, départ + durée du repos de la rotation de l'agent (ex. 16/10 + 28 j = 13/11).
  function reprise(d, agent) {
    if (d.type !== 'titre_conge' || !d.date_debut || !Dates.isDate(d.date_debut)) return '';
    var fin = d.date_fin && Dates.isDate(d.date_fin) ? d.date_fin : '';
    if (!fin) { var repos = Number(Agents.rotationParams(agent || {}, Params.get()).jours_repos) || 0; if (!repos) return ''; fin = Dates.addDays(d.date_debut, repos - 1); }
    return Dates.addDays(fin, 1);
  }
  function sortDesc(a, b) { return a.date_creation < b.date_creation ? 1 : -1; }

  function create(user, data) {
    if (user.role === 'admin') throw httpErr_("L'administrateur ne fait pas de demande", 'FORBIDDEN');
    if (!T[data.type] || masque(data.type)) throw httpErr_('Type de demande invalide');
    ['date_debut', 'date_fin'].forEach(function (k) { if (data[k] && !Dates.isDate(data[k])) throw httpErr_('Date invalide'); });
    if (data.date_debut && data.date_fin && data.date_fin < data.date_debut) throw httpErr_('La date de fin précède la date de début');
    if (!Format.allow('DEM_' + Store.tenantCode() + '_' + user.id, 20, 3600)) throw httpErr_('Trop de demandes en peu de temps, réessayez plus tard');
    var d = {
      id: newId_('D'), agent_id: user.id, type: data.type, objet: String(data.objet || '').trim().slice(0, 120) || T[data.type], message: String(data.message || '').trim().slice(0, 500),
      date_debut: data.date_debut || '', date_fin: data.date_fin || '', date_creation: new Date().toISOString(), statut: 'en_attente', envoi_id: '', reponse: '', traite_par: '', date_traitement: ''
    };
    Store.writeTable('Demandes', Store.readTable('Demandes').concat([d]));
    notifyHandler(user, d);
    return d;
  }
  // Prévient par e-mail celui qui traite la demande (responsable d’équipe de l'agent, sinon les administrateurs).
  function notifyHandler(user, d) {
    try {
      var all = Agents.list(); var byIdx = byId(all); var h = handlerId(user, byIdx);
      var dest = (h === 'admin' ? all.filter(function (a) { return a.role === 'admin' && a.actif === '1'; }) : [byIdx[h]]).filter(function (a) { return a && /^\S+@\S+\.\S+$/.test(a.email || ''); }).slice(0, 3);
      dest.forEach(function (a) {
        Mail.send({ to: a.email, replyTo: user.email || undefined, subject: 'Nouvelle demande — ' + user.nom + ' : ' + d.objet, cta: { label: 'Ouvrir les demandes', url: Mail.lien() }, societe: Params.get().prestataire_nom,
          body: 'Bonjour ' + a.nom + ',\n\n' + user.nom + (user.fonction ? ' (' + user.fonction + ')' : '') + ' a fait une demande : ' + (T[d.type] || d.type) + '\nObjet : ' + d.objet + (d.date_debut ? '\nDu ' + Dates.frDate(d.date_debut) + (d.date_fin ? ' au ' + Dates.frDate(d.date_fin) : '') : '') + (reprise(d, user) ? '\nReprise du travail prévue le ' + Dates.frDate(reprise(d, user)) : '') + (d.message ? '\n\n' + d.message : '') + '\n\nOuvrez Sijil, onglet Demandes, pour la traiter.' });
      });
    } catch (e) { Logger.log('Demande non notifiée : ' + e.message); }
  }

  // Correction d'une demande en attente (date oubliée ou erronée, mauvais type) : par l'agent lui-même ou par celui qui la traite.
  function modifier(user, id, data) {
    data = data || {};
    var agentsById = byId(Agents.list()); var all = Store.readTable('Demandes');
    var d = all.filter(function (x) { return x.id === id; })[0];
    if (!d) throw httpErr_('Demande introuvable');
    if (!(d.agent_id === user.id || canHandle(user, d, agentsById))) throw httpErr_('Demande non accessible', 'FORBIDDEN');
    var decidee = DECIDEES.indexOf(d.statut) >= 0 && !d.envoi_id;
    var attenteDirection = d.statut === 'envoyee'; // envoyée, la direction n'a pas encore répondu
    if (d.statut !== 'en_attente' && !((decidee || attenteDirection) && canHandle(user, d, agentsById))) throw httpErr_(attenteDirection ? 'Cette demande est déjà transmise à la direction : seul votre responsable peut la corriger' : 'La direction a répondu à cette demande : elle ne peut plus être modifiée');
    var type = data.type || d.type;
    if (!T[type] || (type !== d.type && masque(type))) throw httpErr_('Type de demande invalide');
    var debut = data.date_debut !== undefined ? data.date_debut : d.date_debut; var fin = data.date_fin !== undefined ? data.date_fin : d.date_fin;
    [debut, fin].forEach(function (x) { if (x && !Dates.isDate(x)) throw httpErr_('Date invalide'); });
    if (debut && fin && fin < debut) throw httpErr_('La date de fin précède la date de début');
    if (type !== d.type) d.objet = T[type];
    d.type = type; d.date_debut = debut || ''; d.date_fin = fin || '';
    if (data.message !== undefined) d.message = String(data.message || '').trim();
    if (decidee) {
      if (data.statut !== undefined) { if (DECIDEES.indexOf(data.statut) < 0) throw httpErr_('Statut invalide'); d.statut = data.statut; }
      if (data.reponse !== undefined) d.reponse = String(data.reponse || '').trim().slice(0, 500);
      d.traite_par = user.nom; d.date_traitement = new Date().toISOString();
    }
    Store.writeTable('Demandes', all);
    return enrich(d, agentsById);
  }

  // Annule une décision prise directement (acceptée, refusée, traitée) : la demande redevient « en attente » et peut être modifiée, transmise à la direction ou supprimée.
  function reouvrir(user, id) {
    var agentsById = byId(Agents.list()); var all = Store.readTable('Demandes');
    var d = all.filter(function (x) { return x.id === id; })[0];
    if (!d || !canHandle(user, d, agentsById)) throw httpErr_('Demande non accessible', 'FORBIDDEN');
    if (d.statut === 'en_attente') return enrich(d, agentsById);
    if (d.statut !== 'envoyee' && d.envoi_id) throw httpErr_('La direction a répondu à cette demande : elle ne peut plus être annulée');
    var envoi = d.envoi_id;
    d.statut = 'en_attente'; d.reponse = ''; d.traite_par = ''; d.date_traitement = ''; d.envoi_id = '';
    Store.writeTable('Demandes', all);
    if (envoi) majEnvoi(envoi, all);
    return enrich(d, agentsById);
  }

  // Supprime une demande : l'agent retire la sienne tant qu'elle est en attente ; celui qui la traite supprime aussi une décision directe. Jamais une demande déjà transmise à la direction.
  function supprimer(user, id) {
    var agentsById = byId(Agents.list()); var all = Store.readTable('Demandes');
    var d = all.filter(function (x) { return x.id === id; })[0];
    if (!d) throw httpErr_('Demande introuvable');
    var handler = canHandle(user, d, agentsById);
    if (!(handler || (d.agent_id === user.id && d.statut === 'en_attente'))) throw httpErr_('Demande non accessible', 'FORBIDDEN');
    if (d.statut !== 'envoyee' && d.envoi_id) throw httpErr_('La direction a répondu à cette demande : elle ne peut plus être supprimée');
    if (d.statut === 'envoyee' && !handler) throw httpErr_('Demande non accessible', 'FORBIDDEN');
    var reste = all.filter(function (x) { return x.id !== id; });
    Store.writeTable('Demandes', reste);
    if (d.envoi_id) majEnvoi(d.envoi_id, reste);
    return { ok: true, id: id };
  }

  // Après qu'une demande quitte un envoi (retirée ou supprimée) : l'envoi est recalculé, ou supprimé s'il est vide.
  function majEnvoi(envoiId, demandes) {
    var envois = Store.readTable('Envois'); var e = envois.filter(function (x) { return x.id === envoiId; })[0]; if (!e) return;
    var items = demandes.filter(function (d) { return d.envoi_id === envoiId; });
    if (!items.length) { Store.writeTable('Envois', envois.filter(function (x) { return x.id !== envoiId; })); return; }
    e.nb = items.length; e.themes = groupBy(items).map(function (g) { return g.label + ' (' + g.items.length + ')'; }).join(', ');
    Store.writeTable('Envois', envois);
  }
  // Annule un envoi dont la direction n'a pas encore répondu : toutes ses demandes redeviennent « en attente ».
  function annulerEnvoi(user, envoiId) {
    var envois = Store.readTable('Envois'); var e = envois.filter(function (x) { return x.id === envoiId; })[0];
    if (!e || (user.role !== 'admin' && !Agents.tous(user) && e.chef_id !== user.id)) throw httpErr_('Envoi introuvable', 'FORBIDDEN');
    if (e.statut !== 'envoye') throw httpErr_('La direction a répondu à cet envoi : il ne peut plus être annulé');
    var all = Store.readTable('Demandes'); var n = 0;
    all.forEach(function (d) { if (d.envoi_id === envoiId && d.statut === 'envoyee') { d.statut = 'en_attente'; d.envoi_id = ''; n += 1; } });
    Store.writeTable('Demandes', all); Store.writeTable('Envois', envois.filter(function (x) { return x.id !== envoiId; }));
    return { ok: true, remises: n };
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
      envois = Store.readTable('Envois').filter(function (e) { return user.role === 'admin' || Agents.tous(user) || e.chef_id === user.id; })
        .sort(function (a, b) { return a.date_envoi < b.date_envoi ? 1 : -1; }).slice(0, 40)
        .map(function (e) {
          var items = all.filter(function (d) { return d.envoi_id === e.id; });
          var o = {}; Object.keys(e).forEach(function (k) { o[k] = e[k]; });
          o.chef_nom = (agentsById[e.chef_id] || {}).nom || 'Administration'; o.groupes = groupBy(items);
          return o;
        });
    }
    var utilises = {}; all.forEach(function (d) { utilises[d.type] = 1; });
    var types = {}; Object.keys(T).forEach(function (k) { if (!masque(k) || utilises[k]) types[k] = T[k]; }); // les types retirés ne restent que s'ils servent encore
    return { mine: mine, toHandle: toHandle, envois: envois, types: types, statuts: CFG.STATUTS_DEMANDE };
  }

  // Décision directe (sans passer par la direction) ou réponse individuelle.
  function repondre(user, id, statut, reponse) {
    if (['acceptee', 'refusee', 'traitee'].indexOf(statut) < 0) throw httpErr_('Statut invalide');
    var agentsById = byId(Agents.list());
    var all = Store.readTable('Demandes');
    var d = all.filter(function (x) { return x.id === id; })[0];
    if (!d || !canHandle(user, d, agentsById)) throw httpErr_('Demande non accessible', 'FORBIDDEN');
    d.statut = statut; d.reponse = String(reponse || '').slice(0, 500); d.traite_par = user.nom; d.date_traitement = new Date().toISOString();
    Store.writeTable('Demandes', all);
    return enrich(d, agentsById);
  }

  // « Je vous remercie de bien vouloir préparer <…> pour : » : tournure propre à chaque type de demande.
  var PHRASE = { titre_conge: 'le(s) Titre(s) de congé', attestation_travail: 'l\'(les) Attestation(s) de travail', ats: 'l\'(les) ATS', fiche_emolument: 'la (les) Fiche(s) d\'émoluments', contrat: 'la (les) Copie(s) du contrat',
    attestation_cnas: 'l\'(les) Attestation(s) CNAS', maj_cnas: 'la (les) Mise(s) à jour CNAS', attestation_emoluments: 'l\'(les) Attestation(s) d\'émoluments', prolongation_conge: 'la (les) Prolongation(s) de congé', prolongation_sejour: 'la (les) Prolongation(s) de séjour' };
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // Message à la direction : un bloc par thème. Titre de congé : nom, date de sortie, durée (jours), date de reprise.
  // Retourne { text, html } (le texte brut sert aussi de secours à l'écran).
  function buildMessage(envoi, groups, params, chef) {
    var sig = 'Admin Sijil';
    var t = ['Bonjour,', '']; var hh = ['<p>Bonjour,</p>'];
    if (envoi.note) { t.push(envoi.note, ''); hh.push('<p>' + esc(envoi.note) + '</p>'); }
    groups.forEach(function (g) {
      var conge = g.type === 'titre_conge';
      var intro = 'Je vous remercie de bien vouloir préparer ' + (PHRASE[g.type] || (g.label + ' (' + g.items.length + ')')) + ' pour :';
      t.push(intro, ''); hh.push('<p>' + esc(intro) + '</p>');
      g.items.forEach(function (d) {
        var rep = d.reprise !== undefined ? d.reprise : reprise(d, Agents.get(d.agent_id));
        var nom = d.agent_nom + (d.agent_fonction ? ' (' + d.agent_fonction + ')' : '');
        var lignes = [];
        if (conge && d.date_debut) {
          lignes.push(['Date de sortie', Dates.frDate(d.date_debut)]);
          if (rep) lignes.push(['Durée', Dates.diffDays(d.date_debut, rep) + ' jours', true]);
          if (rep) lignes.push(['Date de reprise', Dates.frDate(rep)]);
        } else {
          if (d.date_debut && d.date_fin) { lignes.push(['Date de début', Dates.frDate(d.date_debut)]); lignes.push(['Date de fin', Dates.frDate(d.date_fin)]); lignes.push(['Durée', (Dates.diffDays(d.date_debut, d.date_fin) + 1) + ' jours', true]); }
          else if (d.date_debut) lignes.push(['À partir du', Dates.frDate(d.date_debut)]);
        }
        if (d.message) lignes.push(['Précisions', d.message]);
        t.push(nom); lignes.forEach(function (l) { t.push('    - ' + l[0] + ' : ' + l[1]); }); t.push('');
        hh.push('<p style="margin:0 0 4px"><b>' + esc(nom) + '</b></p><ul style="margin:0 0 14px">' + lignes.map(function (l) { return '<li>' + esc(l[0]) + ' : ' + (l[2] ? '<b>' + esc(l[1]) + '</b>' : esc(l[1])) + '</li>'; }).join('') + '</ul>');
      });
    });
    t.push('Cordialement,', '', sig); hh.push('<p>Cordialement,</p><p>' + esc(sig).replace(/\n/g, '<br>') + '</p>');
    return { text: t.join('\n'), html: '<div style="font-family:Arial,sans-serif;font-size:14px">' + hh.join('') + '</div>' };
  }

  // Regroupe les demandes en cours (en attente, ou déjà acceptées) (par thème) en un seul envoi à la direction.
  function envoyerDirection(user, ids, note) {
    if (user.role === 'agent') throw httpErr_('Accès refusé', 'FORBIDDEN');
    var params = Params.get();
    var agentsById = byId(Agents.list());
    var all = Store.readTable('Demandes');
    var wanted = (ids && ids.length) ? ids : null;
    var chosen = all.filter(function (d) { return (d.statut === 'en_attente' || (d.statut === 'acceptee' && !d.envoi_id)) && canHandle(user, d, agentsById) && (!wanted || wanted.indexOf(d.id) >= 0); });
    if (!chosen.length) throw httpErr_('Aucune demande à envoyer');
    var items = chosen.map(function (d) { return enrich(d, agentsById); });
    var groups = groupBy(items);
    var envoi = { id: newId_('E'), chef_id: user.id, date_envoi: new Date().toISOString(), nb: chosen.length, themes: groups.map(function (g) { return g.label + ' (' + g.items.length + ')'; }).join(', '), note: String(note || '').slice(0, 300), statut: 'envoye', reponse: '', date_reponse: '' };
    chosen.forEach(function (d) { d.statut = 'envoyee'; d.envoi_id = envoi.id; });
    Store.writeTable('Demandes', all);
    Store.writeTable('Envois', Store.readTable('Envois').concat([envoi]));
    var msg = buildMessage(envoi, groups, params, user); var text = msg.text;
    var mail = false;
    if (params.direction_email) {
      try {
        Mail.send({ to: params.direction_email, subject: 'Demande groupée — ' + (params.prestataire_nom || 'Prestataire') + ' — ' + envoi.nb + ' demande(s)', body: text, html: msg.html, societe: params.prestataire_nom });
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
    if (!e || (user.role !== 'admin' && !Agents.tous(user) && e.chef_id !== user.id)) throw httpErr_('Envoi introuvable', 'FORBIDDEN');
    var all = Store.readTable('Demandes');
    var now = new Date().toISOString();
    all.forEach(function (d) {
      if (d.envoi_id === envoiId && d.statut === 'envoyee') { d.statut = statut; d.reponse = String(reponse || '').slice(0, 500); d.traite_par = user.nom; d.date_traitement = now; }
    });
    e.statut = 'traite'; e.reponse = String(reponse || '').slice(0, 500); e.date_reponse = now;
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
  return { modifier: modifier, reouvrir: reouvrir, supprimer: supprimer, annulerEnvoi: annulerEnvoi, create: create, list: list, repondre: repondre, envoyerDirection: envoyerDirection, traiterEnvoi: traiterEnvoi, counts: counts };
})();
