<?php
// Tests propres à la version PHP (base de TEST jetable) : SIJIL_CONFIG=... php tests/unit.php
declare(strict_types=1);
require __DIR__ . '/../src/bootstrap.php';
$pdo = Store::pdo(); foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t) $pdo->exec('DROP TABLE `' . $t . '`');
$n = 0; $bad = 0;
function ok(string $name, bool $cond, string $info = ''): void { global $n, $bad; $n++; if (!$cond) { $bad++; echo "✗ $name $info\n"; } }
function call(?string $t, string $name, array $args = []): array { return Rpc::call($t, $name, $args); }
Setup::install('admin@demo.local', 'admin1234', 'Admin');
$r = call(null, 'login', ['admin@demo.local', 'admin1234', '', true]); ok('connexion', $r['ok'] && !empty($r['data']['remember']));
$tk = $r['data']['token']; $rm = $r['data']['remember'];
// mot de passe hérité d'Apps Script (sel + SHA-256 × 300) : accepté
$legacy = 'lUy23bQTetd2E713jfETr3UbWAzkz9ssCJL2H7BBk3A='; // calculé par l'algorithme d'Apps Script avec le sel « abc123salt »
$all = Agents::list(); $all[0]['salt'] = 'abc123salt'; $all[0]['password_hash'] = $legacy; Store::writeTable('Agents', $all);
ok('mot de passe Apps Script accepté', call(null, 'login', ['admin@demo.local', 'Secret!42'])['ok']);
ok('mauvais mot de passe refusé', !call(null, 'login', ['admin@demo.local', 'xxx'])['ok']);
// « rester connecté »
$res = call(null, 'resume', [$rm]); ok('reconnexion automatique', $res['ok'] && !empty($res['data']['remember']));
ok('jeton à usage unique', !call(null, 'resume', [$rm])['ok']);
$tk = $res['data']['token'];
// mot de passe oublié (e-mail capturé)
Mail::$sent = []; $f = call(null, 'passwordForgot', ['admin@demo.local']); ok('code envoyé', $f['ok'] && count(Mail::$sent) === 1);
$code = Mail::$sent[0]['code'] ?? ''; ok('code à 6 chiffres', preg_match('/^\d{6}$/', $code) === 1);
ok('mauvais code refusé', !call(null, 'passwordReset', ['admin@demo.local', '000000', 'nouveau1'])['ok'] || $code === '000000');
ok('réinitialisation', call(null, 'passwordReset', ['admin@demo.local', $code, 'nouveau1'])['ok']);
ok('nouveau mot de passe', call(null, 'login', ['admin@demo.local', 'nouveau1'])['ok']);
ok('ancien jeton oublié après réinitialisation', !call(null, 'resume', [$res['data']['remember']])['ok']);
// limite de tentatives
for ($i = 0; $i < 9; $i++) call(null, 'login', ['admin@demo.local', 'faux' . $i]);
ok('blocage après trop de tentatives', str_contains(call(null, 'login', ['admin@demo.local', 'nouveau1'])['error'] ?? '', 'Trop de tentatives'));
Cache::remove('L_admin@demo.local');
$tk = call(null, 'login', ['admin@demo.local', 'nouveau1'])['data']['token'];
// session invalide
ok('session invalide', (call('bidon', 'me')['code'] ?? '') === 'SESSION');
ok('fonction inconnue', !call($tk, 'nexistepas')['ok']);
// exports
call($tk, 'setupSave', [['prestataire_nom' => 'SARL TEST', 'client_entete' => "LIGNE 1\nLIGNE 2"]]);
call($tk, 'contratsSave', [['contrats' => [['numero' => 'C1', 'client' => 'CLIENT SA', 'objet' => 'Objet du contrat', 'ref_mois' => '2026-08', 'ref_attachement' => 1]], 'fonctions' => [['contrat' => 'C1', 'designation' => 'Soudeur', 'libelle' => 'Soudeur', 'positions' => 1, 'delai' => 100, 'prix_unitaire' => 1000]]]]);
$ag = call($tk, 'agentCreate', [['nom' => 'ALI SOUDEUR', 'fonction' => 'Soudeur', 'email' => 'ali@t.dz', 'contrat' => 'C1', 'password' => 'secret12']]); ok('agent créé', $ag['ok'], (string)($ag['error'] ?? ''));
$id = $ag['data']['agent']['id'];
call($tk, 'pointer', [['agent_id' => $id, 'date' => '2026-08-01', 'date_fin' => '2026-08-10', 'statut' => 'T']]);
foreach ([['exportFiche', ['month' => '2026-08', 'contrat' => 'C1']], ['exportAttachement', ['month' => '2026-08', 'contrat' => 'C1']]] as [$fn, $o]) foreach (['xlsx', 'pdf'] as $fmt) {
    $e = call($tk, $fn, [$o + ['format' => $fmt]]); $b = $e['ok'] ? base64_decode($e['data']['base64']) : '';
    ok("$fn $fmt", $e['ok'] && strlen($b) > 500, (string)($e['error'] ?? ''));
    if ($fmt === 'xlsx') ok("$fn : xlsx lisible", count(XlsxReader::sheets($b)) === 1);
    else ok("$fn : en-tête PDF", str_starts_with($b, '%PDF-') && str_contains($b, '%%EOF'));
}
call($tk, 'attachementValider', [['month' => '2026-08', 'contrat' => 'C1']]);
$fac = call($tk, 'exportFacture', [['month' => '2026-08', 'contrat' => 'C1', 'facture_numero' => 'F1', 'format' => 'pdf']]); ok('facture pdf', $fac['ok'], (string)($fac['error'] ?? ''));
// aller-retour Excel : export puis analyse d'import
$ex = call($tk, 'pointageExport', [['contrat' => 'C1']]); ok('export pointage', $ex['ok']);
$an = call($tk, 'pointageImportAnalyser', [['nom' => 'x.xlsx', 'base64' => $ex['data']['base64']]]);
ok('import : analyse', $an['ok'] && $an['data']['jours'] === 10 && $an['data']['personnes'][0]['suggestion']['id'] === $id, json_encode($an['error'] ?? null));
// image → PDF
$img = imagecreatetruecolor(40, 30); ob_start(); imagejpeg($img); $jpg = (string)ob_get_clean(); $pdf = Pdf::fromImage($jpg); ok('image → PDF (JPEG)', $pdf !== null && str_starts_with($pdf, '%PDF'));
ob_start(); imagepng($img); $png = (string)ob_get_clean(); ok('image → PDF (PNG)', Pdf::fromImage($png) !== null);
// pointage automatique (cron)
$u = Agents::get(Agents::list()[0]['id']); call($tk, 'autoPointageSet', [['on' => true, 'heure' => '00:00']]);
$faits = Auto::run('23:59'); ok('cron : pointage automatique', count($faits) === 1);
ok('cron : une seule exécution par jour', Auto::run('23:59') === []);
ok('cron détecté', Auto::hasTrigger());
// sauvegarde / restauration
$b = call($tk, 'backupCreate'); ok('sauvegarde', $b['ok']);
call($tk, 'pointer', [['agent_id' => $id, 'date' => '2026-08-01', 'statut' => '']]);
$rs = call($tk, 'backupRestore', [$b['data']['id'], 'RESTAURER']); ok('restauration', $rs['ok'], (string)($rs['error'] ?? ''));
$g = call($tk, 'gridMonth', ['2026-08']); ok('pointage restauré', $g['data']['rows'][0]['days'][0]['statut'] === 'T');
ok('sauvegarde supprimée', call($tk, 'backupDelete', [$b['data']['id']])['ok']);
// concurrence : deux écritures successives sous verrou
ok('verrou', call($tk, 'pointer', [['agent_id' => $id, 'date' => '2026-08-02', 'statut' => 'R']])['ok']);
// Unicode / emoji
$a2 = call($tk, 'agentCreate', [['nom' => 'Ça été — 日本 😀', 'email' => 'u@t.dz', 'password' => 'secret12']]); ok('unicode', $a2['ok'] && $a2['data']['agent']['nom'] === 'Ça été — 日本 😀', (string)($a2['error'] ?? ''));
echo $bad ? "$bad échec(s) sur $n\n" : "OK : $n vérifications\n"; exit($bad ? 1 : 0);
