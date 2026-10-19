<?php
/** « Cache » avec expiration (sessions, tentatives de connexion, codes de réinitialisation). */
final class Cache {
    public static function get(string $k): ?string { $s = Store::pdo()->prepare('SELECT v FROM cache WHERE k=? AND expire>?'); $s->execute([$k, time()]); $v = $s->fetchColumn(); return $v === false ? null : (string)$v; }
    public static function put(string $k, string $v, int $seconds): void { Store::pdo()->prepare('INSERT INTO cache (k,v,expire) VALUES (?,?,?) ON DUPLICATE KEY UPDATE v=VALUES(v), expire=VALUES(expire)')->execute([$k, $v, time() + $seconds]); }
    public static function remove(string $k): void { Store::pdo()->prepare('DELETE FROM cache WHERE k=?')->execute([$k]); }
    public static function purge(): void { Store::pdo()->prepare('DELETE FROM cache WHERE expire<=?')->execute([time()]); }
}
