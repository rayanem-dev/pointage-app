/** Agents : le chef de groupe ET l'admin peuvent créer des agents ; seul l'admin gère rôles, groupes et accès au Setup. */
var Agents = (function () {
  function list() { return Store.readTable('Agents'); }
  function get(id) { return list().filter(function (a) { return a.id === id; })[0]; }
  function publicAgent(a) {
    var o = {};
    Object.keys(a).forEach(function (k) { if (k !== 'password_hash' && k !== 'salt') o[k] = a[k]; });
    return o;
  }
  function activeAdmins(all) { return all.filter(function (x) { return x.role === 'admin' && x.actif === '1'; }).length; }
  function validEmail(e) { return /^\S+@\S+\.\S+$/.test(e); }
  function randomPassword() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }

  // Agents visibles : admin = tous, chef = son groupe + lui-même, agent = lui-même.
  function visibleTo(user) {
    var all = list().filter(function (a) { return a.actif === '1' && a.role !== 'admin'; });
    if (user.role === 'admin') return all;
    if (user.role === 'chef') return all.filter(function (a) { return a.chef_id === user.id || a.id === user.id; });
    return all.filter(function (a) { return a.id === user.id; });
  }
  // Agents que l'utilisateur peut gérer (créer/modifier) : admin = tous, chef = les agents de son groupe.
  function manageable(user, a) { return user.role === 'admin' || (user.role === 'chef' && a.chef_id === user.id && a.role === 'agent'); }

  function create(user, data) {
    var nom = String(data.nom || '').trim();
    var email = String(data.email || '').trim().toLowerCase();
    if (!nom) throw httpErr_('Nom obligatoire');
    if (!validEmail(email)) throw httpErr_('Email invalide');
    var isAdmin = user.role === 'admin';
    var role = isAdmin ? (data.role || 'agent') : 'agent';
    if (CFG.ROLES.indexOf(role) < 0) throw httpErr_('Rôle invalide');
    var all = list();
    if (all.some(function (a) { return a.email.toLowerCase() === email; })) throw httpErr_('Email déjà utilisé');
    var password = data.password || randomPassword();
    var cred = Auth.makeCredentials(password);
    var agent = {
      id: newId_('A'), nom: nom, fonction: String(data.fonction || '').trim(), affectation: String(data.affectation || '').trim(),
      contrat: String(data.contrat || '').trim(), email: email, role: role,
      chef_id: isAdmin ? String(data.chef_id || '') : user.id, actif: '1',
      acces_setup: isAdmin && role === 'chef' && data.acces_setup ? '1' : '0',
      password_hash: cred.password_hash, salt: cred.salt, date_entree: String(data.date_entree || '')
    };
    Store.writeTable('Agents', all.concat([agent]));
    return { agent: publicAgent(agent), password: password };
  }

  function update(user, id, data) {
    var all = list();
    var a = all.filter(function (x) { return x.id === id; })[0];
    if (!a) throw httpErr_('Agent introuvable');
    if (!manageable(user, a)) throw httpErr_("Vous ne pouvez pas modifier cet agent", 'FORBIDDEN');
    var isAdmin = user.role === 'admin';
    ['nom', 'fonction', 'affectation', 'contrat', 'date_entree'].forEach(function (k) { if (data[k] !== undefined) a[k] = String(data[k]).trim(); });
    if (data.email !== undefined) {
      var email = String(data.email).trim().toLowerCase();
      if (!validEmail(email)) throw httpErr_('Email invalide');
      if (all.some(function (x) { return x.id !== id && x.email.toLowerCase() === email; })) throw httpErr_('Email déjà utilisé');
      a.email = email;
    }
    if (data.actif !== undefined) {
      var actif = data.actif === true || data.actif === '1' || data.actif === 1 ? '1' : '0';
      if (actif === '0' && a.role === 'admin' && activeAdmins(all) < 2) throw httpErr_('Il faut au moins un administrateur');
      a.actif = actif;
    }
    if (isAdmin) {
      if (data.chef_id !== undefined) a.chef_id = String(data.chef_id);
      if (data.role !== undefined) {
        if (CFG.ROLES.indexOf(data.role) < 0) throw httpErr_('Rôle invalide');
        if (a.role === 'admin' && data.role !== 'admin' && activeAdmins(all) < 2) throw httpErr_('Il faut au moins un administrateur');
        a.role = data.role;
      }
      if (data.acces_setup !== undefined) a.acces_setup = data.acces_setup === true || data.acces_setup === '1' || data.acces_setup === 1 ? '1' : '0';
      if (a.role !== 'chef') a.acces_setup = '0';
    }
    Store.writeTable('Agents', all);
    return publicAgent(a);
  }

  function setPassword(user, id, password) {
    var all = list();
    var a = all.filter(function (x) { return x.id === id; })[0];
    if (!a) throw httpErr_('Agent introuvable');
    if (id !== user.id && !manageable(user, a)) throw httpErr_('Accès refusé', 'FORBIDDEN');
    var cred = Auth.makeCredentials(password);
    a.password_hash = cred.password_hash; a.salt = cred.salt;
    Store.writeTable('Agents', all);
  }
  function changeOwnPassword(user, current, next) {
    if (!Auth.check(user, current)) throw httpErr_('Mot de passe actuel incorrect');
    setPassword(user, user.id, next);
  }
  // Création du premier administrateur (installation).
  function ensureAdmin(email, password, nom) {
    var all = list();
    if (all.some(function (a) { return a.role === 'admin'; })) return null;
    email = String(email || '').trim().toLowerCase();
    if (!validEmail(email)) throw httpErr_("E-mail de l'administrateur invalide");
    var cred = Auth.makeCredentials(password);
    var admin = { id: newId_('A'), nom: nom || 'Administrateur', fonction: '', affectation: '', contrat: '', email: email, role: 'admin', chef_id: '', actif: '1', acces_setup: '1', password_hash: cred.password_hash, salt: cred.salt, date_entree: '' };
    Store.writeTable('Agents', all.concat([admin]));
    return publicAgent(admin);
  }
  return { list: list, get: get, publicAgent: publicAgent, visibleTo: visibleTo, manageable: manageable, create: create, update: update, setPassword: setPassword, changeOwnPassword: changeOwnPassword, ensureAdmin: ensureAdmin };
})();
