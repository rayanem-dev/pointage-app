/** Documents déposés dans le compte d'un agent (fiches d'émoluments, attestations, ATS…) : stockés dans Google Drive. */
var Documents = (function () {
  function folder() {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty('DOCS_FOLDER_ID');
    if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* dossier supprimé : on le recrée */ } }
    var f = DriveApp.createFolder('Pointage – Documents des agents');
    props.setProperty('DOCS_FOLDER_ID', f.getId());
    return f;
  }
  function canSee(user, agentId) {
    return user.role === 'admin' || user.id === agentId || Agents.visibleTo(user).some(function (a) { return a.id === agentId; });
  }
  function pub(d) { var o = {}; Object.keys(d).forEach(function (k) { if (k !== 'file_id') o[k] = d[k]; }); return o; }

  function list(user, agentId) {
    agentId = agentId || user.id;
    if (!canSee(user, agentId)) throw httpErr_('Accès refusé', 'FORBIDDEN');
    return Store.readTable('Documents').filter(function (d) { return d.agent_id === agentId; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(pub);
  }
  function upload(user, data) {
    if (user.role === 'agent') throw httpErr_('Accès refusé', 'FORBIDDEN');
    if (!Agents.visibleTo(user).some(function (a) { return a.id === data.agent_id; })) throw httpErr_("Cet agent n'est pas dans votre groupe", 'FORBIDDEN');
    if (!CFG.TYPES_DOC[data.type]) throw httpErr_('Type de document invalide');
    if (!data.base64 || !data.nom) throw httpErr_('Fichier manquant');
    var bytes = Utilities.base64Decode(data.base64);
    if (bytes.length > CFG.MAX_UPLOAD_BYTES) throw httpErr_('Fichier trop volumineux (6 Mo maximum)');
    var nom = String(data.nom).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
    var file = folder().createFile(Utilities.newBlob(bytes, data.mime || 'application/octet-stream', nom));
    var d = { id: newId_('G'), agent_id: data.agent_id, type: data.type, titre: String(data.titre || nom).trim(), file_id: file.getId(), nom_original: nom, depose_par: user.nom, date: new Date().toISOString() };
    Store.writeTable('Documents', Store.readTable('Documents').concat([d]));
    return pub(d);
  }
  function download(user, id) {
    var d = Store.readTable('Documents').filter(function (x) { return x.id === id; })[0];
    if (!d || !canSee(user, d.agent_id)) throw httpErr_('Document introuvable', 'FORBIDDEN');
    var blob = DriveApp.getFileById(d.file_id).getBlob();
    return { nom: d.nom_original, mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
  }
  function remove(user, id) {
    var all = Store.readTable('Documents');
    var d = all.filter(function (x) { return x.id === id; })[0];
    if (user.role === 'agent' || !d || !canSee(user, d.agent_id)) throw httpErr_('Document introuvable', 'FORBIDDEN');
    try { DriveApp.getFileById(d.file_id).setTrashed(true); } catch (e) { /* déjà supprimé */ }
    Store.writeTable('Documents', all.filter(function (x) { return x.id !== id; }));
  }
  function count(agentId) { return Store.readTable('Documents').filter(function (d) { return d.agent_id === agentId; }).length; }
  // Vidage : corbeille de tous les fichiers déposés.
  function purgeFiles() {
    Store.readTable('Documents').forEach(function (d) { try { DriveApp.getFileById(d.file_id).setTrashed(true); } catch (e) { /* ignore */ } });
  }
  return { list: list, upload: upload, download: download, remove: remove, count: count, purgeFiles: purgeFiles };
})();
