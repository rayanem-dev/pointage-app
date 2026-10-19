<?php
// Assistant d'installation : crée les tables et le compte administrateur. SUPPRIMEZ CE FICHIER APRÈS L'INSTALLATION.
declare(strict_types=1);
require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: text/html; charset=utf-8');
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
$msg = ''; $ok = false;
try {
    if (Setup::hasAdmin()) { $msg = 'Sijil est déjà installé. Supprimez install.php.'; $ok = true; }
    elseif (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        $r = Setup::install($_POST['email'] ?? '', $_POST['password'] ?? '', $_POST['nom'] ?? '');
        $msg = 'Installation terminée. Administrateur : ' . $r['admin'] . '. Supprimez maintenant install.php, puis ouvrez l\'application.'; $ok = true;
    }
} catch (Throwable $e) { $msg = 'Erreur : ' . $e->getMessage(); }
?><!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Installation de Sijil</title>
<style>body{font:16px system-ui,sans-serif;background:#f5f3ec;margin:0;padding:24px}main{max-width:460px;margin:auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 12px #0001}input{width:100%;padding:10px;margin:4px 0 14px;box-sizing:border-box}button{background:#16598D;color:#fff;border:0;padding:12px 20px;border-radius:8px;font-size:16px}.m{padding:10px;border-radius:8px;background:#eef6ff;margin-bottom:12px}</style>
<main><h1>Installation de Sijil</h1>
<?php if ($msg): ?><p class="m"><?= $h($msg) ?></p><?php endif; ?>
<?php if (!$ok): ?><form method="post"><label>Nom de l'administrateur<input name="nom" value="Administrateur"></label><label>E-mail (identifiant)<input type="email" name="email" required></label><label>Mot de passe (6 caractères minimum)<input type="password" name="password" minlength="6" required></label><button>Installer</button></form><?php else: ?><p><a href="index.php">Ouvrir l'application</a></p><?php endif; ?></main></html>
