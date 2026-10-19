<?php
/** Accès à la base MySQL : une table par « onglet » de la version Apps Script (lecture/écriture groupées, mêmes noms et colonnes). */
final class Store {
    private static ?PDO $pdo = null;
    private static array $memo = [];

    public static function pdo(): PDO {
        if (!self::$pdo) {
            $c = conf('db');
            $dsn = 'mysql:host=' . ($c['host'] ?? 'localhost') . ';' . (isset($c['port']) ? 'port=' . $c['port'] . ';' : '') . 'dbname=' . $c['name'] . ';charset=utf8mb4';
            self::$pdo = new PDO($dsn, $c['user'], $c['pass'] ?? '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
            self::$pdo->exec("SET time_zone = '+00:00'");
        }
        return self::$pdo;
    }
    public static function reset(): void { self::$memo = []; }
    private static function table(string $name): string {
        if (!isset(CFG()['TABLES'][$name])) throw new InvalidArgumentException("Table inconnue : $name");
        return '`' . strtolower($name) . '`';
    }
    /** Lignes de la table sous forme de tableaux associatifs de chaînes (comme Store.readTable). */
    public static function readTable(string $name): array {
        if (isset(self::$memo[$name])) return self::$memo[$name];
        $cols = CFG()['TABLES'][$name];
        $rows = self::pdo()->query('SELECT `' . implode('`,`', $cols) . '` FROM ' . self::table($name) . ' ORDER BY seq')->fetchAll();
        $out = [];
        foreach ($rows as $r) { $o = []; foreach ($cols as $c) $o[$c] = (string)($r[$c] ?? ''); $out[] = $o; }
        return self::$memo[$name] = $out;
    }
    /** Remplace le contenu de la table (comme Store.writeTable) ; sans effet si rien n'a changé. */
    public static function writeTable(string $name, array $objs): void {
        $cols = CFG()['TABLES'][$name];
        $new = [];
        foreach ($objs as $o) { $r = []; foreach ($cols as $c) $r[] = isset($o[$c]) ? (string)$o[$c] : ''; $new[] = $r; }
        $cur = array_map('array_values', self::readTable($name));
        if ($cur === $new) return;
        $pdo = self::pdo(); $own = !$pdo->inTransaction();
        if ($own) $pdo->beginTransaction();
        try {
            // Lignes inchangées en tête de table conservées ; le reste est réécrit.
            $same = 0; $n = min(count($cur), count($new));
            while ($same < $n && $cur[$same] === $new[$same]) $same++;
            if ($same === 0) $pdo->exec('DELETE FROM ' . self::table($name));
            else $pdo->exec('DELETE FROM ' . self::table($name) . ' WHERE seq > (SELECT m FROM (SELECT seq AS m FROM ' . self::table($name) . ' ORDER BY seq LIMIT 1 OFFSET ' . ($same - 1) . ') t)');
            $ins = array_slice($new, $same);
            if ($ins) {
                $ph = '(' . implode(',', array_fill(0, count($cols), '?')) . ')';
                foreach (array_chunk($ins, 200) as $chunk) {
                    $st = $pdo->prepare('INSERT INTO ' . self::table($name) . ' (`' . implode('`,`', $cols) . '`) VALUES ' . implode(',', array_fill(0, count($chunk), $ph)));
                    $st->execute(array_merge(...$chunk));
                }
            }
            if ($own) $pdo->commit();
        } catch (Throwable $e) { if ($own && $pdo->inTransaction()) $pdo->rollBack(); self::$memo = []; throw $e; }
        self::$memo[$name] = array_map(function ($r) use ($cols) { return array_combine($cols, $r); }, $new);
    }
    /** Verrou global pour toute écriture (transaction + verrou nommé : une seule écriture à la fois). */
    public static function withLock(callable $fn) {
        $pdo = self::pdo();
        if ($pdo->inTransaction()) return $fn();
        $ok = $pdo->query("SELECT GET_LOCK('sijil_write', 25)")->fetchColumn();
        if (!$ok) throw httpErr("Le serveur est occupé, réessayez dans un instant");
        $pdo->beginTransaction();
        try { $r = $fn(); $pdo->commit(); return $r; }
        catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); self::$memo = []; throw $e; }
        finally { $pdo->query("DO RELEASE_LOCK('sijil_write')"); }
    }
}
/** « Propriétés du script » : petites valeurs durables (clé → texte). */
final class Props {
    public static function get(string $k): ?string { $s = Store::pdo()->prepare('SELECT v FROM props WHERE k=?'); $s->execute([$k]); $v = $s->fetchColumn(); return $v === false ? null : (string)$v; }
    public static function set(string $k, string $v): void { Store::pdo()->prepare('INSERT INTO props (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)')->execute([$k, $v]); }
    public static function delete(string $k): void { Store::pdo()->prepare('DELETE FROM props WHERE k=?')->execute([$k]); }
    public static function prefix(string $p): array { $s = Store::pdo()->prepare('SELECT k,v FROM props WHERE k LIKE ?'); $s->execute([addcslashes($p, '%_\\') . '%']); $o = []; foreach ($s->fetchAll() as $r) $o[$r['k']] = $r['v']; return $o; }
}
/** « Cache » avec expiration (sessions, tentatives de connexion, codes de réinitialisation). */
final class Cache {
    public static function get(string $k): ?string { $s = Store::pdo()->prepare('SELECT v FROM cache WHERE k=? AND expire>?'); $s->execute([$k, time()]); $v = $s->fetchColumn(); return $v === false ? null : (string)$v; }
    public static function put(string $k, string $v, int $seconds): void { Store::pdo()->prepare('INSERT INTO cache (k,v,expire) VALUES (?,?,?) ON DUPLICATE KEY UPDATE v=VALUES(v), expire=VALUES(expire)')->execute([$k, $v, time() + $seconds]); }
    public static function remove(string $k): void { Store::pdo()->prepare('DELETE FROM cache WHERE k=?')->execute([$k]); }
    public static function purge(): void { Store::pdo()->prepare('DELETE FROM cache WHERE expire<=?')->execute([time()]); }
}
