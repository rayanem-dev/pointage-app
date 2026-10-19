<?php
/** E-mails de Sijil : gabarit unique aux couleurs de l'application ; envoi par mail() ou par SMTP (config.php). */
final class Mail {
    const BLEU = '#16598D'; const BLEU2 = '#0E4377'; const FOND = '#F3F6FA';
    private static function esc($t): string { return htmlspecialchars((string)($t ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
    public static function shell(): string { return rtrim((string)conf('app_url', ''), '/') . '/'; }
    public static function lien(): string { return self::shell(); }
    private static function copyright(): string {
        $c = (string)CFG()['COPYRIGHT']; $m = (string)(CFG()['MARQUE'] ?? ''); $i = $m !== '' ? mb_strpos($c, $m) : false;
        if ($i === false) return self::esc($c);
        return self::esc(mb_substr($c, 0, $i)) . '<a href="' . self::esc(CFG()['MARQUE_URL']) . '" target="_blank" rel="noopener" style="color:' . self::BLEU . '">' . self::esc($m) . '</a>' . self::esc(mb_substr($c, $i + mb_strlen($m)));
    }
    private static function texteVersHtml(string $t): string {
        $h = self::esc($t);
        $h = preg_replace_callback('~(https?://[^\s<]+)~', function ($m) { $u = $m[1]; $fin = preg_match('/[.,;)]$/', $u) ? substr($u, -1) : ''; $url = $fin !== '' ? substr($u, 0, -1) : $u; return '<a href="' . $url . '" style="color:' . self::BLEU . '">' . $url . '</a>' . $fin; }, $h);
        return str_replace("\n", '<br>', $h);
    }
    public static function html(array $o): string {
        $contenu = $o['html'] ?? ('<div style="font-size:15px;line-height:1.55;color:#1f2933">' . self::texteVersHtml($o['body'] ?? '') . '</div>');
        $b = self::BLEU; $b2 = self::BLEU2; $f = self::FOND; $shell = self::shell();
        $bouton = !empty($o['cta']['url']) ? '<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 4px"><tr><td style="background:' . $b . ';border-radius:8px"><a href="' . self::esc($o['cta']['url']) . '" style="display:inline-block;padding:12px 24px;color:#ffffff;font-weight:bold;font-size:15px;text-decoration:none">' . self::esc($o['cta']['label'] ?? 'Ouvrir Sijil') . '</a></td></tr></table>' : '';
        $code = !empty($o['code']) ? '<div style="margin:18px 0;text-align:center"><span style="display:inline-block;background:' . $f . ';border:2px dashed ' . $b . ';border-radius:10px;padding:12px 26px;font-size:30px;letter-spacing:8px;font-weight:bold;color:' . $b2 . '">' . self::esc($o['code']) . '</span></div>' : '';
        $societe = !empty($o['societe']) ? '<tr><td style="padding:14px 24px 0;color:#5b6b7d;font-size:12px;text-transform:uppercase;letter-spacing:.8px">' . self::esc($o['societe']) . '</td></tr>' : '';
        return '<!doctype html><html><body style="margin:0;padding:0;background:' . $f . ';font-family:Arial,Helvetica,sans-serif">'
            . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:' . $f . ';padding:24px 12px"><tr><td align="center">'
            . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dde4ee">'
            . '<tr><td style="background:' . $b . ';background-image:linear-gradient(100deg,' . $b . ',' . $b2 . ');padding:18px 24px"><div style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:.5px">Sijil</div><div style="color:#ffffff;font-size:12px;opacity:.85">Pointage et suivi du personnel</div></td></tr>'
            . $societe
            . '<tr><td style="padding:' . (!empty($o['societe']) ? '8' : '22') . 'px 24px 22px">' . $contenu . $code . $bouton . '</td></tr>'
            . '<tr><td style="background:' . $f . ';padding:14px 24px;color:#7a8794;font-size:12px;line-height:1.5;border-top:1px solid #e6ecf3"><b style="color:' . $b . '">Sijil</b><br>' . self::copyright() . '</td></tr>'
            . '</table></td></tr></table></body></html>';
    }
    /** Messages envoyés pendant les tests (config « mail_capture ») au lieu d'être expédiés. */
    public static array $sent = [];
    public static function send(array $o): bool {
        $from = conf('mail_from', 'noreply@localhost'); $name = 'Sijil';
        if (conf('mail_capture')) { self::$sent[] = $o; return true; }
        $boundary = 'b' . bin2hex(random_bytes(8));
        $headers = ['MIME-Version: 1.0', 'From: =?UTF-8?B?' . base64_encode($name) . '?= <' . $from . '>', 'Content-Type: multipart/alternative; boundary="' . $boundary . '"'];
        if (!empty($o['replyTo'])) $headers[] = 'Reply-To: ' . $o['replyTo'];
        $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($o['body'] ?? '')) . "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode(self::html($o))) . "--$boundary--";
        $subject = '=?UTF-8?B?' . base64_encode($o['subject'] ?? '') . '?=';
        $ok = @mail($o['to'], $subject, $body, implode("\r\n", $headers));
        if (!$ok) throw httpErr("Envoi de l'e-mail impossible (vérifiez la configuration du serveur de messagerie)");
        return true;
    }
}
