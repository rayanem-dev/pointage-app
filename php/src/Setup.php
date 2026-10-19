<?php
/** Installation, maintenance, remise à zéro et sauvegardes (JSON dans data/backups). */
final class Setup {
    const ORDER = ['Params', 'Agents', 'Contrats', 'Fonctions', 'Attachements', 'AttachementsValides', 'Demandes', 'Envois', 'Documents'];
    public static function hasAdmin(): bool { try { foreach (Agents::list() as $a) if ($a['role'] === 'admin' && $a['actif'] === '1') return true; } catch (Throwable $e) { return false; } return false; }
    public static function tablesOk(): bool {
        try { $have = Store::pdo()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN); } catch (Throwable $e) { return false; }
        $need = array_map('strtolower', array_merge(self::ORDER, ['pointage', 'props', 'cache', 'fichiers']));
        return !array_diff($need, array_map('strtolower', $have));
    }
    public static function status(): array { return ['installed' => self::tablesOk() && self::hasAdmin(), 'version' => CFG()['VERSION']]; }
    /** Crée les tables manquantes (schema.sql) sans toucher aux données. */
    public static function createTables(): void {
        $sql = file_get_contents(SIJIL_ROOT . '/schema.sql');
        foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) { if (stripos($stmt, 'CREATE TABLE') !== false || stripos($stmt, 'SET NAMES') === 0) Store::pdo()->exec($stmt); }
    }
    public static function repairStructure(): array { self::createTables(); Store::reset(); Params::set([]); return self::status(); }
    public static function install($email, $password, $nom = ''): array {
        self::createTables(); Store::reset();
        $created = Agents::ensureAdmin($email, $password, $nom ?: 'Administrateur');
        Params::set([]);
        return ['admin' => $created ? $created['email'] : null, 'status' => self::status()];
    }
    /** Remise à zéro. mode « donnees » : garde la configuration ; « tout » : coquille vide (hors comptes admin). */
    public static function vider($mode, $confirm): array {
        if ($confirm !== 'VIDER') throw httpErr('Confirmation incorrecte : tapez VIDER');
        Documents::purgeFiles();
        Store::pdo()->exec('DELETE FROM pointage');
        foreach (['Demandes', 'Envois', 'Documents', 'Depots', 'Attachements', 'AttachementsValides'] as $n) Store::writeTable($n, []);
        Store::writeTable('Agents', array_values(array_filter(Agents::list(), fn($a) => $a['role'] === 'admin' || $a['role'] === 'client')));
        if ($mode === 'tout') { Store::writeTable('Agents', array_values(array_filter(Agents::list(), fn($a) => $a['role'] === 'admin'))); foreach (['Params', 'Contrats', 'Fonctions'] as $n) Store::writeTable($n, []); Params::set([]); }
        Store::reset();
        return ['mode' => $mode === 'tout' ? 'tout' : 'donnees'];
    }
    // ----- sauvegardes -----
    private static function dir(): string { $d = rtrim((string)conf('data_dir', SIJIL_ROOT . '/data'), '/') . '/backups'; if (!is_dir($d) && !@mkdir($d, 0750, true) && !is_dir($d)) throw httpErr('Dossier de sauvegarde inaccessible'); return $d; }
    private static function file(string $id): string { if (!preg_match('/^B[0-9a-f]{16}$/', $id)) throw httpErr('Sauvegarde introuvable'); return self::dir() . '/' . $id . '.json'; }
    public static function backup(?array $user, $note = ''): array {
        $dump = ['version' => CFG()['VERSION'], 'tables' => [], 'pointage' => Store::pdo()->query('SELECT agent_id, DATE_FORMAT(jour,"%Y-%m-%d") AS jour, statut FROM pointage')->fetchAll()];
        foreach (array_keys(CFG()['TABLES']) as $t) $dump['tables'][$t] = Store::readTable($t);
        $id = 'B' . substr(bin2hex(random_bytes(8)), 0, 16); $stamp = date('Y-m-d H:i');
        $name = 'Sauvegarde ' . $stamp . ($note ? ' (' . $note . ')' : '');
        file_put_contents(self::file($id), json_encode(['nom' => $name, 'date' => nowIso(), 'dump' => $dump], JSON_UNESCAPED_UNICODE));
        return ['id' => $id, 'nom' => $name, 'par' => $user ? $user['nom'] : ''];
    }
    public static function listBackups(): array {
        $out = [];
        foreach (glob(self::dir() . '/B*.json') ?: [] as $f) { $j = json_decode((string)file_get_contents($f), true); if ($j) $out[] = ['id' => basename($f, '.json'), 'nom' => $j['nom'], 'date' => $j['date'], 'url' => '']; }
        usort($out, fn($a, $b) => strcmp($b['nom'], $a['nom']));
        return $out;
    }
    public static function restore(array $user, $id, $confirm): array {
        if ($confirm !== 'RESTAURER') throw httpErr('Confirmation incorrecte : tapez RESTAURER');
        $f = self::file((string)$id); if (!is_file($f)) throw httpErr('Sauvegarde introuvable');
        $j = json_decode((string)file_get_contents($f), true);
        if (empty($j['dump']['tables']['Params']) && !isset($j['dump']['tables']['Agents'])) throw httpErr("Ce fichier n'est pas une sauvegarde de l'application");
        $safety = self::backup($user, 'avant restauration');
        foreach ($j['dump']['tables'] as $t => $rows) if (isset(CFG()['TABLES'][$t])) Store::writeTable($t, $rows);
        Store::pdo()->exec('DELETE FROM pointage');
        $st = Store::pdo()->prepare('INSERT INTO pointage (agent_id, jour, statut) VALUES (?,?,?)');
        foreach ($j['dump']['pointage'] ?? [] as $r) $st->execute([$r['agent_id'], $r['jour'], $r['statut']]);
        Store::reset();
        return ['restaure' => count($j['dump']['tables']), 'securite' => $safety['nom']];
    }
    public static function removeBackup($id): bool { $f = self::file((string)$id); if (!is_file($f)) throw httpErr('Sauvegarde introuvable'); unlink($f); return true; }
}
