/** Authentification : e-mail + mot de passe (haché + sel), sessions dans le cache du script. */
var Auth = (function () {
  var ITER = 300;
  function hash(password, salt) {
    var d = salt + password;
    for (var i = 0; i < ITER; i += 1) d = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, d));
    return d;
  }
  function newSalt() { return Utilities.getUuid().replace(/-/g, ''); }
  function makeCredentials(password) {
    if (!password || String(password).length < 6) throw httpErr_('Mot de passe : 6 caractères minimum');
    var salt = newSalt();
    return { salt: salt, password_hash: hash(String(password), salt) };
  }
  function check(agent, password) { return !!agent && !!agent.salt && hash(String(password || ''), agent.salt) === agent.password_hash; }

  function login(email, password) {
    email = String(email || '').trim().toLowerCase();
    var cache = CacheService.getScriptCache();
    var key = 'L_' + email;
    var tries = Number(cache.get(key) || 0);
    if (tries >= 8) throw httpErr_('Trop de tentatives, réessayez dans 15 minutes');
    var agent = Store.readTable('Agents').filter(function (a) { return a.email.toLowerCase() === email && a.actif === '1'; })[0];
    if (!check(agent, password)) { cache.put(key, String(tries + 1), 900); throw httpErr_('Email ou mot de passe incorrect'); }
    cache.remove(key);
    var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    cache.put('S_' + token, agent.id, CFG.SESSION_SECONDS);
    return { token: token, user: Agents.publicAgent(agent) };
  }
  function logout(token) { CacheService.getScriptCache().remove('S_' + token); }
  function userFromToken(token) {
    if (!token) throw httpErr_('Session expirée', 'SESSION');
    var id = CacheService.getScriptCache().get('S_' + token);
    var agent = id && Agents.get(id);
    if (!agent || agent.actif !== '1') throw httpErr_('Session expirée', 'SESSION');
    return agent;
  }
  function canSetup(user) { return user.role === 'admin' || (user.role === 'chef' && user.acces_setup === '1'); }
  return { makeCredentials: makeCredentials, check: check, login: login, logout: logout, userFromToken: userFromToken, canSetup: canSetup };
})();
