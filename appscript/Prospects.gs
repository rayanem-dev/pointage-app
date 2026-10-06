/**
 * Prospects : demandes d'essai déposées depuis la page d'accueil (formulaire public), suivies dans la console de l'éditeur
 * et transformées en client en essai en un clic. Stockées dans le classeur principal (onglet « Prospects »).
 */
var Prospects = (function () {
  var MAX_PAR_HEURE = 30;
  function all() { return Store.withMaster(function () { return Store.readTable('Prospects'); }); }
  function save(rows) { Store.withMaster(function () { Store.writeTable('Prospects', rows); }); }
  function clip(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n); }

  // Dépôt public (aucune connexion) : champ piège, limite horaire, un seul dossier ouvert par e-mail.
  function soumettre(raw) {
    raw = raw || {};
    if (clip(raw.site, 50)) return { ok: true }; // champ piège rempli (robot) : on fait comme si tout allait bien
    var societe = clip(raw.societe, 80); var email = clip(raw.email, 120).toLowerCase();
    if (societe.length < 2) throw httpErr_('Indiquez le nom de votre société');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw httpErr_('Adresse e-mail invalide');
    var cache = CacheService.getScriptCache(); var n = Number(cache.get('PROSP_RL') || 0);
    if (n >= MAX_PAR_HEURE) throw httpErr_('Trop de demandes pour le moment, réessayez plus tard');
    cache.put('PROSP_RL', String(n + 1), 3600);
    var rows = all();
    var open = rows.filter(function (p) { return p.email === email && (p.statut === 'nouveau' || p.statut === 'contacté'); })[0];
    var data = { societe: societe, nom: clip(raw.nom, 80), tel: clip(raw.tel, 30), message: clip(raw.message, 1000) };
    var isNew = !open;
    if (open) { Object.keys(data).forEach(function (k) { if (data[k]) open[k] = data[k]; }); open.date = new Date().toISOString().slice(0, 16).replace('T', ' '); }
    else rows.push({ id: newId_('P'), date: new Date().toISOString().slice(0, 16).replace('T', ' '), societe: societe, nom: data.nom, email: email, tel: data.tel, message: data.message, statut: 'nouveau', note: '', client: '' });
    save(rows);
    if (isNew) {
      try {
        var to = Store.withMaster(function () { return Tenants.contact().email; });
        if (to) Mail.send({ to: to, replyTo: email, subject: '[Sijil] Demande d\'essai — ' + societe, body: 'Nouvelle demande d\'essai\n\nSociété : ' + societe + '\nContact : ' + data.nom + ' <' + email + '>\nTéléphone : ' + data.tel + '\n\n' + data.message + '\n\n(Console → Prospects pour créer l\'essai.)' });
      } catch (e) { Logger.log('Prospect non notifié : ' + e.message); }
    }
    return { ok: true };
  }
  function list(user) {
    Tenants.requireOwner(user);
    return all().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  function update(user, id, patch) {
    Tenants.requireOwner(user); patch = patch || {};
    var rows = all(); var p = rows.filter(function (x) { return x.id === id; })[0];
    if (!p) throw httpErr_('Demande introuvable');
    if (patch.statut !== undefined) { if (['nouveau', 'contacté', 'converti', 'rejeté'].indexOf(patch.statut) < 0) throw httpErr_('Statut invalide'); p.statut = patch.statut; }
    if (patch.note !== undefined) p.note = clip(patch.note, 500);
    save(rows);
    return p;
  }
  // Prospect -> client en essai (30 jours par défaut), avec message de bienvenue ; envoi facultatif par e-mail au prospect.
  function convertir(user, id, o) {
    Tenants.requireOwner(user); o = o || {};
    var p = all().filter(function (x) { return x.id === id; })[0];
    if (!p) throw httpErr_('Demande introuvable');
    if (p.statut === 'converti') throw httpErr_('Cette demande est déjà transformée en client (' + p.client + ')');
    var jours = Math.max(1, Math.min(365, Number(o.jours) || 30));
    var res = Tenants.create(user, { code: o.code, nom: p.societe, admin_email: p.email, admin_nom: p.nom, contact: p.tel, statut: 'essai', fin_licence: Dates.addDays(Dates.today(), jours) });
    var rows = all(); var q = rows.filter(function (x) { return x.id === id; })[0]; q.statut = 'converti'; q.client = res.client.code; save(rows);
    var envoye = false;
    if (o.envoyer) {
      var reply = Tenants.contact().email;
      Mail.send({ to: p.email, replyTo: reply || undefined, cta: { label: 'Ouvrir Sijil', url: CFG.APP_SHELL_URL }, subject: 'Votre essai Sijil — ' + p.societe, body: res.message + '\n\nEssai gratuit jusqu\'au ' + res.client.fin_licence.split('-').reverse().join('/') + '.' });
      envoye = true;
    }
    return { client: res.client, admin: res.admin, message: res.message, envoye: envoye };
  }
  return { soumettre: soumettre, list: list, update: update, convertir: convertir };
})();
