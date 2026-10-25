<?php
// Page de l'application (interface générée depuis la version Apps Script : voir README).
declare(strict_types=1);
$f = __DIR__ . '/app.html';
if (!is_file($f)) { http_response_code(500); echo 'app.html manquant : lancez « node appscript/dev/gen-php.js ».'; exit; }
header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: SAMEORIGIN');
header("Content-Security-Policy: frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'");
header('X-Content-Type-Options: nosniff');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') header('Strict-Transport-Security: max-age=31536000');
if (is_file(__DIR__ . '/install.php')) { header('X-Sijil-Alerte: install.php-present'); }
header('Referrer-Policy: same-origin');
readfile($f);
