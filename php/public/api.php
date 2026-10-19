<?php
declare(strict_types=1);
require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); echo json_encode(['ok' => false, 'error' => 'Méthode non autorisée']); exit; }
$raw = file_get_contents('php://input');
if (strlen((string)$raw) > 20 * 1024 * 1024) { http_response_code(413); echo json_encode(['ok' => false, 'error' => 'Requête trop volumineuse']); exit; }
$in = json_decode((string)$raw, true);
if (!is_array($in) || !isset($in['name'])) { echo json_encode(['ok' => false, 'error' => 'Requête invalide']); exit; }
if (random_int(1, 100) === 1) { try { Cache::purge(); } catch (Throwable $e) { /* sans importance */ } }
try { $res = Rpc::call($in['token'] ?? null, (string)$in['name'], $in['args'] ?? []); }
catch (Throwable $e) { error_log($e->getMessage()); $res = ['ok' => false, 'error' => 'Service indisponible (base de données ?)', 'code' => 'ERR']; }
echo json_encode($res, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
