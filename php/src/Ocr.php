<?php
/** Lecture du texte d'un document (OCR). Facultatif : utilise pdftotext (PDF) et tesseract (images) s'ils sont installés sur le serveur. */
final class Ocr {
    private static function which(string $bin): bool { $p = @shell_exec('command -v ' . escapeshellarg($bin) . ' 2>/dev/null'); return is_string($p) && trim($p) !== ''; }
    private static function run(string $cmd, string $stdin): string {
        $d = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $p = @proc_open($cmd, $d, $pipes); if (!is_resource($p)) return '';
        fwrite($pipes[0], $stdin); fclose($pipes[0]);
        $out = stream_get_contents($pipes[1]); fclose($pipes[1]); fclose($pipes[2]); proc_close($p);
        return (string)$out;
    }
    public static function text(string $bytes, string $ext): string {
        if (!conf('ocr', true)) throw httpErr('lecture automatique non activée sur ce serveur');
        $ext = strtolower($ext);
        if ($ext === 'pdf') {
            if (!function_exists('proc_open') || !self::which('pdftotext')) throw httpErr('pdftotext non installé sur le serveur');
            return mb_scrub(self::run('pdftotext -layout -q - -', $bytes));
        }
        if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff'], true)) {
            if (!function_exists('proc_open') || !self::which('tesseract')) throw httpErr('tesseract non installé sur le serveur');
            return mb_scrub(self::run('tesseract stdin stdout -l fra 2>/dev/null', $bytes));
        }
        throw httpErr('format non lisible automatiquement');
    }
}
