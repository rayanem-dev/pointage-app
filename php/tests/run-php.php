<?php
// Rejoue le scénario sur la version PHP / MySQL : SIJIL_CONFIG=... php run-php.php sortie.json  (la base doit être VIDE : voir reset)
declare(strict_types=1);
require __DIR__ . '/../src/bootstrap.php';
$steps = json_decode(file_get_contents(__DIR__ . '/scenario.json'), true);
$USERS = ['admin' => ['admin@demo.local', 'admin1234'], 'karim' => ['karim@demo.local', 'demo1234'], 'samir' => ['hamlaoui@demo.local', 'demo1234'], 'amine' => ['boudiaf@demo.local', 'demo1234'], 'client' => ['client@demo.local', 'demo1234']];
// remise à zéro de la base de test
$pdo = Store::pdo(); $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t) $pdo->exec('DROP TABLE `' . $t . '`');
$vars = []; $tokens = []; $out = [];
function getp($o, string $p) { if ($p === '') return $o; foreach (explode('.', $p) as $k) { if (!is_array($o) || !array_key_exists($k, $o)) return null; $o = $o[$k]; } return $o; }
function resolve($v, array $vars) {
    if (is_array($v)) {
        if (array_key_exists('$', $v)) return getp($vars, $v['$']);
        if (array_key_exists('$patch', $v)) { $base = getp($vars, $v['$patch']); foreach ($v as $k => $x) if ($k !== '$patch') $base[$k] = $x; return $base; }
        if (array_key_exists('$merge', $v)) { $o = []; foreach ($v['$merge'] as $m) $o = array_merge($o, resolve($m, $vars)); return $o; }
        $o = []; foreach ($v as $k => $x) $o[$k] = resolve($x, $vars); return $o;
    }
    return $v;
}
foreach ($steps as $i => $s) {
    if ($s['name'] === '$install') { Setup::install($s['args'][0], $s['args'][1], $s['args'][2]); $out[] = ['i' => $i, 'name' => $s['name'], 'ok' => true, 'data' => null, 'rec' => false]; continue; }
    $token = null;
    if (!empty($s['as'])) {
        if (empty($tokens[$s['as']])) { $l = Rpc::call(null, 'login', [$USERS[$s['as']][0], $USERS[$s['as']][1]]); if (!$l['ok']) throw new RuntimeException('login ' . $s['as'] . ' : ' . $l['error']); $tokens[$s['as']] = $l['data']['token']; }
        $token = $tokens[$s['as']];
    }
    $args = resolve($s['args'], $vars);
    $r = Rpc::call($token, $s['name'], $args);
    if (!$r['ok'] && empty($s['expectError'])) fwrite(STDERR, 'PAS ' . $i . ' ' . $s['name'] . ' (' . ($s['as'] ?? '') . ') : ' . $r['error'] . "\n");
    if ($r['ok'] && !empty($s['save'])) foreach ($s['save'] as $k => $p) $vars[$k] = getp($r['data'], $p);
    $out[] = ['i' => $i, 'name' => $s['name'], 'as' => $s['as'] ?? null, 'ok' => $r['ok'], 'data' => $r['ok'] ? $r['data'] : null, 'error' => $r['ok'] ? null : $r['error'], 'rec' => !empty($s['rec'])];
}
file_put_contents($argv[1] ?? '/tmp/out-php.json', json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR));
echo 'php : ' . count($out) . ' pas, ' . count(array_filter($out, fn($o) => !$o['ok'])) . " erreurs\n";
