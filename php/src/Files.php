<?php
/** Fichiers (documents, logos) : contenu dans le dossier data/ (hors du site), métadonnées dans la table « fichiers ». Remplace Google Drive. */
final class Files {
    private static function dir(): string {
        $d = rtrim((string)conf('data_dir', SIJIL_ROOT . '/data'), '/') . '/files';
        if (!is_dir($d) && !@mkdir($d, 0750, true) && !is_dir($d)) throw httpErr("Dossier de stockage inaccessible : $d");
        return $d;
    }
    public static function put(string $nom, string $mime, string $bytes): string {
        $id = 'F' . uuid();
        if (file_put_contents(self::dir() . '/' . $id, $bytes) === false) throw httpErr("Écriture du fichier impossible");
        Store::pdo()->prepare('INSERT INTO fichiers (id, nom, mime, taille, cree_le) VALUES (?,?,?,?,?)')->execute([$id, mb_substr($nom, 0, 255), $mime, strlen($bytes), gmdate('Y-m-d H:i:s')]);
        return $id;
    }
    public static function meta(string $id): ?array { $s = Store::pdo()->prepare('SELECT * FROM fichiers WHERE id=?'); $s->execute([$id]); $r = $s->fetch(); return $r ?: null; }
    public static function bytes(string $id): ?string { if (!preg_match('/^F[0-9a-f]{32}$/', $id)) return null; $f = self::dir() . '/' . $id; return is_file($f) ? (string)file_get_contents($f) : null; }
    public static function delete(?string $id): void {
        if (!$id || !preg_match('/^F[0-9a-f]{32}$/', $id)) return;
        @unlink(self::dir() . '/' . $id);
        Store::pdo()->prepare('DELETE FROM fichiers WHERE id=?')->execute([$id]);
    }
}
