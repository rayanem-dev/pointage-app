/**
 * E-mails de Sijil : un seul gabarit aux couleurs de l'application (en-tête bleu avec le logo, bouton, pied de page),
 * pour que chaque message soit reconnaissable. Le texte brut reste envoyé tel quel (clients de messagerie sans HTML).
 *   Mail.send({ to, replyTo, subject, body, html?, cta?: { label, url }, code?, societe? })
 *  - body : texte simple (retours à la ligne et liens repris automatiquement dans la version HTML) ;
 *  - html : contenu HTML déjà prêt, à la place de body ; cta : bouton ; code : code à gros caractères (réinitialisation).
 */
var Mail = (function () {
  var BLEU = '#16598D'; var BLEU2 = '#0E4377'; var FOND = '#F3F6FA';
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function shell() { return CFG.APP_SHELL_URL; }
  // « © 2026 JawlaDev — Tous droits réservés » : JawlaDev est un lien vers le portfolio (nouvel onglet).
  function copyright() { var c = String(CFG.COPYRIGHT || ''); var m = CFG.MARQUE || ''; var i = m ? c.indexOf(m) : -1; return i < 0 ? esc(c) : esc(c.slice(0, i)) + '<a href="' + esc(CFG.MARQUE_URL) + '" target="_blank" rel="noopener" style="color:' + BLEU + '">' + esc(m) + '</a>' + esc(c.slice(i + m.length)); }
  /** Lien d'ouverture de l'espace courant (avec le code entreprise), sinon la page d'accueil. */
  function lien() { try { var c = Tenants.codeActuel(); return c ? Tenants.lien(c) : shell(); } catch (e) { return shell(); } }
  function texteVersHtml(t) {
    return esc(t).replace(/(https?:\/\/[^\s<]+)/g, function (u) { var fin = /[.,;)]$/.test(u) ? u.slice(-1) : ''; var url = fin ? u.slice(0, -1) : u; return '<a href="' + url + '" style="color:' + BLEU + '">' + url + '</a>' + fin; })
      .replace(/\n/g, '<br>');
  }
  function html(o) {
    var contenu = o.html || ('<div style="font-size:15px;line-height:1.55;color:#1f2933">' + texteVersHtml(o.body || '') + '</div>');
    var bouton = o.cta && o.cta.url ? '<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 4px"><tr><td style="background:' + BLEU + ';border-radius:8px"><a href="' + esc(o.cta.url) + '" style="display:inline-block;padding:12px 24px;color:#ffffff;font-weight:bold;font-size:15px;text-decoration:none">' + esc(o.cta.label || 'Ouvrir Sijil') + '</a></td></tr></table>' : '';
    var code = o.code ? '<div style="margin:18px 0;text-align:center"><span style="display:inline-block;background:' + FOND + ';border:2px dashed ' + BLEU + ';border-radius:10px;padding:12px 26px;font-size:30px;letter-spacing:8px;font-weight:bold;color:' + BLEU2 + '">' + esc(o.code) + '</span></div>' : '';
    var logo = shell() + 'icon-192.png';
    return '<!doctype html><html><body style="margin:0;padding:0;background:' + FOND + ';font-family:Arial,Helvetica,sans-serif">'
      + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:' + FOND + ';padding:24px 12px"><tr><td align="center">'
      + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dde4ee">'
      + '<tr><td style="background:' + BLEU + ';background-image:linear-gradient(100deg,' + BLEU + ',' + BLEU2 + ');padding:18px 24px">'
      + '<table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="padding-right:12px"><img src="' + logo + '" width="44" height="44" alt="Sijil" style="display:block;border-radius:10px;border:0;background:#ffffff;color:#16598D;font-size:11px"></td>'
      + '<td style="color:#ffffff"><div style="font-size:22px;font-weight:bold;letter-spacing:.5px">Sijil</div><div style="font-size:12px;opacity:.85">Pointage et suivi du personnel</div></td></tr></table></td></tr>'
      + (o.societe ? '<tr><td style="padding:14px 24px 0;color:#5b6b7d;font-size:12px;text-transform:uppercase;letter-spacing:.8px">' + esc(o.societe) + '</td></tr>' : '')
      + '<tr><td style="padding:' + (o.societe ? '8' : '22') + 'px 24px 22px">' + contenu + code + bouton + '</td></tr>'
      + '<tr><td style="background:' + FOND + ';padding:14px 24px;color:#7a8794;font-size:12px;line-height:1.5;border-top:1px solid #e6ecf3">'
      + '<b style="color:' + BLEU + '">Sijil</b> · <a href="' + shell() + '" style="color:' + BLEU + '">' + shell().replace(/^https?:\/\//, '').replace(/\/$/, '') + '</a><br>' + copyright() + '</td></tr>'
      + '</table></td></tr></table></body></html>';
  }
  function send(o) {
    var m = { to: o.to, subject: o.subject, body: o.body || '', htmlBody: html(o) };
    if (o.replyTo) m.replyTo = o.replyTo;
    if (o.name !== false) m.name = 'Sijil';
    return MailApp.sendEmail(m);
  }
  return { send: send, html: html, lien: lien };
})();
