/**
 * Pointage automatique : chaque jour à l'heure choisie (6 h 30 par défaut), Sijil recopie pour chaque agent le pointage du jour précédent
 * (son dernier statut, absence comprise) — comme « Copier le dernier pointage », mais tout seul. Un jour déjà pointé n'est jamais remplacé :
 * si une personne habilitée corrige à la main, c'est elle qui a raison, et l'automatique repart de là le lendemain.
 * Le réglage est propre à la personne qui l'active : un administrateur couvre tous les agents, un responsable d'équipe son équipe.
 * Une tâche planifiée Google passe toutes les 30 minutes ; une exécution manquée est rattrapée à la suivante (la date de dernière exécution est conservée).
 */
var Auto = (function () {
  var TICK = 'autoPointageTick';
  var DEFAUT = '06:30';
  function props() { return PropertiesService.getScriptProperties(); }
  function tkey(code) { return code || 'MAIN'; }
  function key(code, userId) { return 'AUTO_' + tkey(code) + '_' + userId; }
  function read(code, userId) { try { return JSON.parse(props().getProperty(key(code, userId)) || '{}') || {}; } catch (e) { return {}; } }
  function validHeure(h) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || '')); }
  function maintenant() { return Utilities.formatDate(new Date(), 'Africa/Algiers', 'HH:mm'); }
  function hasTrigger() { try { return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === TICK; }); } catch (e) { return false; } }
  // Crée la tâche planifiée (une seule pour tous les clients) ; demande une autorisation Google la première fois.
  function ensureTrigger() {
    if (hasTrigger()) return { ok: true };
    try { ScriptApp.newTrigger(TICK).timeBased().everyMinutes(30).create(); return { ok: true }; }
    catch (e) { return { ok: false, erreur: e.message }; }
  }
  function get(user) {
    var s = read(Store.tenantCode(), user.id);
    return { on: !!s.on, heure: s.heure || DEFAUT, derniere: s.last || '', total: s.n || 0, quand: s.at || '', erreur: s.err || '', declencheur: hasTrigger() };
  }
  function set(user, o) {
    o = o || {}; var heure = o.heure ? String(o.heure) : DEFAUT;
    if (!validHeure(heure)) throw httpErr_('Heure invalide (HH:MM, par exemple 06:30)');
    var code = Store.tenantCode(); var prev = read(code, user.id);
    var s = { on: o.on === true || o.on === '1' || o.on === 1, heure: heure, last: prev.last || '', n: prev.n || 0, at: prev.at || '', err: '' };
    props().setProperty(key(code, user.id), JSON.stringify(s));
    var res = get(user);
    if (s.on) { var t = ensureTrigger(); res.declencheur = t.ok; if (!t.ok) res.avertissement = 'Autorisation requise : ouvrez l\'éditeur Apps Script, exécutez « autoPointageAutoriser » une fois et acceptez (' + t.erreur + ').'; }
    return res;
  }
  // Exécution (appelée par la tâche planifiée) : pour chaque réglage actif dont l'heure est passée et qui n'a pas encore tourné aujourd'hui.
  function run(now) {
    var heureNow = now || maintenant(); var all = props().getProperties(); var faits = [];
    Object.keys(all).filter(function (k) { return k.indexOf('AUTO_') === 0; }).forEach(function (k) {
      var cut = k.lastIndexOf('_'); var code = k.slice(5, cut); var userId = k.slice(cut + 1); var s;
      try { s = JSON.parse(all[k]); } catch (e) { return; }
      if (!s || !s.on) return;
      try {
        Store.setTenant('', ''); if (code !== 'MAIN') Tenants.use(code);
        var today = Dates.today();
        if (s.last === today || heureNow < (s.heure || DEFAUT)) return;
        var user = Agents.get(userId);
        if (!user || user.actif !== '1' || (user.role !== 'admin' && user.role !== 'chef')) return;
        var r = Store.withLock(function () { return Pointage.completer(user, { tous: true, to: today, mode: 'meme', auto: true }); });
        s.last = today; s.n = r.total || 0; s.at = new Date().toISOString(); s.err = ''; props().setProperty(k, JSON.stringify(s));
        faits.push({ code: code, user: userId, total: s.n });
      } catch (e) {
        Logger.log('Pointage automatique (' + k + ') : ' + e.message);
        s.err = String(e.message).slice(0, 200); props().setProperty(k, JSON.stringify(s));
      }
    });
    Store.setTenant('', '');
    return faits;
  }
  return { get: get, set: set, run: run, ensureTrigger: ensureTrigger, hasTrigger: hasTrigger };
})();

/** Appelée par la tâche planifiée Google (toutes les 30 minutes). */
function autoPointageTick() { return Auto.run(); }
/** À exécuter UNE fois depuis l'éditeur Apps Script après une mise à jour : accorde l'autorisation « tâches planifiées » et crée la tâche. */
function autoPointageAutoriser() { var r = Auto.ensureTrigger(); Logger.log(r.ok ? 'Tâche planifiée prête.' : 'Impossible : ' + r.erreur); return r; }
