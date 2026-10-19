<?php
/** Image → PDF d'une page (JPEG repris tel quel, autres formats via GD) ; l'orientation EXIF des photos est respectée. */
final class Pdf {
    private static function jpegInfo(string $a): ?array {
        $n = strlen($a); if ($n < 4 || ord($a[0]) !== 255 || ord($a[1]) !== 216) return null;
        $U = fn($i) => ord($a[$i] ?? "\0"); $be16 = fn($i) => $U($i) * 256 + $U($i + 1);
        $i = 2; $orient = 1; $info = null;
        while ($i + 4 < $n) {
            if ($U($i) !== 255) { $i++; continue; }
            $m = $U($i + 1); if ($m === 255) { $i++; continue; }
            if ($m === 216 || ($m >= 208 && $m <= 215) || $m === 1) { $i += 2; continue; }
            $len = $be16($i + 2);
            if ($m === 225 && substr($a, $i + 4, 4) === 'Exif') {
                $t = $i + 10; $le = $U($t) === 73;
                $r16 = fn($p) => $le ? $U($p) + $U($p + 1) * 256 : $U($p) * 256 + $U($p + 1);
                $r32 = fn($p) => $le ? $U($p) + $U($p + 1) * 256 + $U($p + 2) * 65536 + $U($p + 3) * 16777216 : (($U($p) * 256 + $U($p + 1)) * 256 + $U($p + 2)) * 256 + $U($p + 3);
                $ifd = $t + $r32($t + 4); $cnt = $r16($ifd);
                for ($k = 0; $k < $cnt && $k < 60; $k++) { $e = $ifd + 2 + $k * 12; if ($r16($e) === 274) { $orient = $r16($e + 8); break; } }
            }
            if ($m >= 192 && $m <= 207 && $m !== 196 && $m !== 200 && $m !== 204) { $info = ['bits' => $U($i + 4), 'h' => $be16($i + 5), 'w' => $be16($i + 7), 'comps' => $U($i + 9)]; break; }
            $i += 2 + $len;
        }
        if (!$info || !$info['w'] || !$info['h'] || ($info['comps'] !== 1 && $info['comps'] !== 3) || $info['bits'] !== 8) return null;
        $info['orient'] = $orient; return $info;
    }
    /** Vrai si l'image peut être convertie (JPEG simple, ou format lisible par GD). */
    public static function convertible(string $bytes): bool { return self::jpegInfo($bytes) !== null || (function_exists('imagecreatefromstring') && @imagecreatefromstring($bytes) !== false); }
    /** PDF d'une page contenant l'image ; null si le format n'est pas pris en charge. */
    public static function fromImage(string $bytes): ?string {
        $j = self::jpegInfo($bytes); $rot = 0;
        if ($j) { $rot = [3 => 180, 6 => 90, 8 => 270][$j['orient']] ?? 0; $w = $j['w']; $h = $j['h']; $cs = $j['comps'] === 1 ? '/DeviceGray' : '/DeviceRGB'; $data = $bytes; }
        else {
            if (!function_exists('imagecreatefromstring')) return null;
            $im = @imagecreatefromstring($bytes); if ($im === false) return null;
            $w = imagesx($im); $h = imagesy($im);
            $flat = imagecreatetruecolor($w, $h); imagefill($flat, 0, 0, imagecolorallocate($flat, 255, 255, 255)); imagecopy($flat, $im, 0, 0, 0, 0, $w, $h);
            ob_start(); imagejpeg($flat, null, 90); $data = (string)ob_get_clean(); $cs = '/DeviceRGB';
        }
        $scale = 842 / max($w, $h); $pw = max(1, round($w * $scale, 2)); $ph = max(1, round($h * $scale, 2));
        $out = "%PDF-1.5\n"; $off = [];
        $obj = function (int $n, string $body) use (&$out, &$off) { $off[$n] = strlen($out); $out .= "$n 0 obj\n$body\nendobj\n"; };
        $obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
        $obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
        $obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $pw $ph] /Rotate $rot /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>");
        $content = "q $pw 0 0 $ph 0 0 cm /Im0 Do Q";
        $obj(4, '<< /Length ' . strlen($content) . " >>\nstream\n$content\nendstream");
        $obj(5, "<< /Type /XObject /Subtype /Image /Width $w /Height $h /ColorSpace $cs /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($data) . " >>\nstream\n" . $data . "\nendstream");
        $xref = strlen($out); $tab = "xref\n0 6\n0000000000 65535 f \n";
        for ($n = 1; $n <= 5; $n++) $tab .= str_pad((string)$off[$n], 10, '0', STR_PAD_LEFT) . " 00000 n \n";
        return $out . $tab . "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n$xref\n%%EOF\n";
    }
}
