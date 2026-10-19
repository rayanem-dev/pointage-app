<?php
// Page de l'application (interface générée depuis la version Apps Script : voir README).
declare(strict_types=1);
$f = __DIR__ . '/app.html';
if (!is_file($f)) { http_response_code(500); echo 'app.html manquant : lancez « node appscript/dev/gen-php.js ».'; exit; }
header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: same-origin');
readfile($f);
