<?php
/** « Propriétés du script » : petites valeurs durables (clé → texte). */
final class Props {
    public static function get(string $k): ?string { $s = Store::pdo()->prepare('SELECT v FROM props WHERE k=?'); $s->execute([$k]); $v = $s->fetchColumn(); return $v === false ? null : (string)$v; }
    public static function set(string $k, string $v): void { Store::pdo()->prepare('INSERT INTO props (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)')->execute([$k, $v]); }
    public static function delete(string $k): void { Store::pdo()->prepare('DELETE FROM props WHERE k=?')->execute([$k]); }
    public static function prefix(string $p): array { $s = Store::pdo()->prepare('SELECT k,v FROM props WHERE k LIKE ?'); $s->execute([addcslashes($p, '%_\\') . '%']); $o = []; foreach ($s->fetchAll() as $r) $o[$r['k']] = $r['v']; return $o; }
}
