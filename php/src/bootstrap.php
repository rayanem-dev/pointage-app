<?php
// Chargement commun : configuration, base de données, classes. Équivalent PHP des fichiers .gs d'Apps Script.
declare(strict_types=1);
const SIJIL_ROOT = __DIR__ . '/..';
$GLOBALS['SIJIL_CONFIG'] = (function () {
    $f = getenv('SIJIL_CONFIG') ?: SIJIL_ROOT . '/config.php';
    if (!is_file($f)) throw new RuntimeException('config.php introuvable : copiez config.sample.php en config.php et renseignez la base de données.');
    return require $f;
})();
date_default_timezone_set($GLOBALS['SIJIL_CONFIG']['timezone'] ?? 'Africa/Algiers');
$G = require __DIR__ . '/Generated.php';
$GLOBALS['SIJIL_GEN'] = $G;
$cfg = $G['cfg'];
$cfg['VERSION_PHP'] = 'php-1';
$GLOBALS['CFG'] = $cfg;

final class SijilError extends Exception {
    public string $errCode;
    public function __construct(string $m, string $code = 'ERR') { parent::__construct($m); $this->errCode = $code; }
}
function httpErr(string $message, string $code = 'ERR'): SijilError { return new SijilError($message, $code); }
function CFG(): array { return $GLOBALS['CFG']; }
function newId(string $prefix): string { return $prefix . substr(bin2hex(random_bytes(8)), 0, 8); }
function uuid(): string { return bin2hex(random_bytes(16)); }
function nowIso(): string { return (new DateTime('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z'); }
function conf(string $k, $def = null) { return $GLOBALS['SIJIL_CONFIG'][$k] ?? $def; }

spl_autoload_register(function (string $c) {
    $f = __DIR__ . '/' . $c . '.php';
    if (is_file($f)) require $f;
});
