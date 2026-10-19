<?php
// Tâche planifiée : à lancer toutes les 30 minutes.
//   cPanel / hébergeur : */30 * * * *  php /chemin/vers/sijil/cron.php
//   ou par adresse : https://votre-domaine/sijil/cron.php?key=<cron_key de config.php>
declare(strict_types=1);
require __DIR__ . '/src/bootstrap.php';
if (PHP_SAPI !== 'cli' && !hash_equals((string)conf('cron_key', ''), (string)($_GET['key'] ?? ''))) { http_response_code(403); exit('Accès refusé'); }
try {
    $faits = Auto::run();
    Cache::purge();
    Documents::purgerAnciens();
    echo json_encode(['ok' => true, 'pointage_auto' => $faits]) . "\n";
} catch (Throwable $e) { error_log('cron : ' . $e->getMessage()); http_response_code(500); echo json_encode(['ok' => false, 'error' => $e->getMessage()]) . "\n"; }
