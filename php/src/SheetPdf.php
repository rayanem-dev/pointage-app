<?php
/** Rendu PDF d'une Sheet (tableaux colorés, texte aligné, images) sans bibliothèque : polices standard Helvetica. */
final class SheetPdf {
    private const W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
    private const WB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

    private static function enc(string $s): string { $r = @mb_convert_encoding($s, 'Windows-1252', 'UTF-8'); return $r === false ? $s : $r; }
    private static function width(string $s, float $size, bool $bold): float {
        $t = $bold ? self::WB : self::W; $w = 0;
        foreach (preg_split('//u', Format::stripAccents($s), -1, PREG_SPLIT_NO_EMPTY) as $ch) { $o = ord($ch[0]); $w += ($o >= 32 && $o <= 126 && strlen($ch) === 1) ? $t[$o - 32] : 556; }
        return $w * $size / 1000;
    }
    private static function wrap(string $text, float $maxW, float $size, bool $bold): array {
        $lines = [];
        foreach (explode("\n", $text) as $para) {
            $cur = '';
            foreach (preg_split('/\s+/', $para) as $word) {
                $try = $cur === '' ? $word : $cur . ' ' . $word;
                if ($cur !== '' && self::width($try, $size, $bold) > $maxW) { $lines[] = $cur; $cur = $word; } else $cur = $try;
            }
            $lines[] = $cur;
        }
        return $lines;
    }
    private static function esc(string $s): string { return str_replace(['\\', '(', ')', "\r"], ['\\\\', '\\(', '\\)', ''], $s); }
    private static function color(?string $hex): string { $h = ltrim((string)$hex, '#'); if (strlen($h) !== 6) return '0 0 0'; return round(hexdec(substr($h, 0, 2)) / 255, 3) . ' ' . round(hexdec(substr($h, 2, 2)) / 255, 3) . ' ' . round(hexdec(substr($h, 4, 2)) / 255, 3); }

    public static function build(Sheet $sh): string {
        $landscape = $sh->landscape; $pw = $landscape ? 842.0 : 595.0; $ph = $landscape ? 595.0 : 842.0; $mg = 29.0;
        $mc = max($sh->maxCol(), count($sh->colW)); $mr = $sh->maxRow();
        $colsPx = []; $total = 0; for ($c = 1; $c <= $mc; $c++) { $colsPx[$c] = $sh->colWidth($c); $total += $colsPx[$c]; }
        $scale = min(1.4, ($pw - 2 * $mg) / max(1, $total * 0.75)); $px = 0.75 * $scale;
        $x0 = [1 => $mg]; for ($c = 1; $c <= $mc; $c++) $x0[$c + 1] = $x0[$c] + $colsPx[$c] * $px;
        // cellules couvertes par une fusion (hors cellule d'origine)
        $covered = []; $mergeAt = [];
        foreach ($sh->merges as [$r, $c, $nr, $nc]) { $mergeAt[$r][$c] = [$nr, $nc]; for ($i = $r; $i < $r + $nr; $i++) for ($j = $c; $j < $c + $nc; $j++) if ($i !== $r || $j !== $c) $covered[$i][$j] = true; }
        // hauteurs de lignes (px) : valeur imposée, sinon 21, agrandie si du texte à la ligne ne tient pas
        $rowH = [];
        for ($r = 1; $r <= $mr; $r++) {
            $h = $sh->rowH[$r] ?? 21;
            foreach ($sh->cells[$r] ?? [] as $c => $cell) {
                $s = $cell['s']; if (empty($s['wrap']) || !is_string($cell['v']) || isset($covered[$r][$c])) continue;
                $nr = $mergeAt[$r][$c][0] ?? 1; if ($nr > 1) continue;
                $nc = $mergeAt[$r][$c][1] ?? 1; $w = 0; for ($j = $c; $j < $c + $nc; $j++) $w += $colsPx[$j] ?? 100;
                $size = $s['size'] ?? 10; $lines = count(self::wrap($cell['v'], ($w - 6) * 0.75, $size, !empty($s['bold'])));
                $h = max($h, $lines * $size * 1.35 / 0.75 + 6);
            }
            $rowH[$r] = $h;
        }
        // pagination
        $pages = []; $cur = []; $y = $mg; $availH = $ph - $mg;
        for ($r = 1; $r <= $mr; $r++) { $hh = $rowH[$r] * $px; if ($y + $hh > $availH && $cur) { $pages[] = $cur; $cur = []; $y = $mg; } $cur[$r] = $y; $y += $hh; }
        if ($cur || !$pages) $pages[] = $cur;
        $objs = []; $add = function (string $body) use (&$objs) { $objs[] = $body; return count($objs); };
        $fontIds = []; foreach (['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'] as $fn) $fontIds[] = $add('<< /Type /Font /Subtype /Type1 /BaseFont /' . $fn . ' /Encoding /WinAnsiEncoding >>');
        $imgObjs = [];
        foreach ($sh->images as $k => $im) {
            $data = $im['bytes'];
            if ($im['mime'] !== 'image/jpeg' && function_exists('imagecreatefromstring')) { $g = @imagecreatefromstring($data); if ($g) { $w = imagesx($g); $h = imagesy($g); $f = imagecreatetruecolor($w, $h); imagefill($f, 0, 0, imagecolorallocate($f, 255, 255, 255)); imagecopy($f, $g, 0, 0, 0, 0, $w, $h); ob_start(); imagejpeg($f, null, 90); $data = (string)ob_get_clean(); } else continue; }
            $d = @getimagesizefromstring($data); if (!$d) continue;
            $id = $add('<< /Type /XObject /Subtype /Image /Width ' . $d[0] . ' /Height ' . $d[1] . ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' . strlen($data) . " >>\nstream\n" . $data . "\nendstream");
            $imgObjs[$k] = ['id' => $id, 'w' => $d[0], 'h' => $d[1]];
        }
        $pageIds = []; $pagesId = count($objs) + 1 + count($pages) * 2; // les objets pages/contenus viennent ensuite
        $contentIds = [];
        foreach ($pages as $pi => $rows) {
            $ops = '';
            $Y = fn(float $top) => $ph - $top;
            foreach ($rows as $r => $top) {
                $h = $rowH[$r] * $px;
                foreach ($sh->cells[$r] ?? [] as $c => $cell) {
                    if (isset($covered[$r][$c])) continue;
                    $nr = $mergeAt[$r][$c][0] ?? 1; $nc = $mergeAt[$r][$c][1] ?? 1;
                    $cx = $x0[$c]; $cw = $x0[$c + $nc] - $x0[$c]; $chh = 0; for ($i = $r; $i < $r + $nr; $i++) $chh += ($rowH[$i] ?? 21) * $px;
                    $s = $cell['s'];
                    if (!empty($s['bg']) && strtoupper($s['bg']) !== '#FFFFFF') $ops .= self::color($s['bg']) . ' rg ' . round($cx, 2) . ' ' . round($Y($top + $chh), 2) . ' ' . round($cw, 2) . ' ' . round($chh, 2) . " re f\n";
                    if (!empty($s['border'])) $ops .= '0.5 w 0 0 0 RG ' . round($cx, 2) . ' ' . round($Y($top + $chh), 2) . ' ' . round($cw, 2) . ' ' . round($chh, 2) . " re S\n";
                    $v = $cell['v']; if ($v === null || $v === '') continue;
                    $text = is_float($v) || is_int($v) ? (!empty($s['format']) ? Format::money($v) : (string)$v) : (string)$v;
                    $size = ($s['size'] ?? 10) * $scale; $bold = !empty($s['bold']); $ital = !empty($s['italic']); $fi = $bold ? ($ital ? 3 : 1) : ($ital ? 2 : 0);
                    $lines = !empty($s['wrap']) ? self::wrap($text, $cw - 4 * $scale, $size, $bold) : explode("\n", $text);
                    $lh = $size * 1.25; $blockH = count($lines) * $lh; $align = $s['align'] ?? (is_int($v) || is_float($v) ? 'right' : 'left');
                    $startY = ($s['valign'] ?? 'middle') === 'top' ? $top + 2 + $size : $top + ($chh - $blockH) / 2 + $size * 0.92;
                    $ops .= self::color($s['color'] ?? '#000000') . " rg BT\n";
                    foreach ($lines as $li => $ln) {
                        $tw = self::width($ln, $size, $bold);
                        $tx = $align === 'center' ? $cx + ($cw - $tw) / 2 : ($align === 'right' ? $cx + $cw - $tw - 2 * $scale : $cx + 2 * $scale);
                        $ty = $startY + $li * $lh;
                        $ops .= '/F' . ($fi + 1) . ' ' . round($size, 2) . ' Tf 1 0 0 1 ' . round($tx, 2) . ' ' . round($Y($ty), 2) . ' Tm (' . self::esc(self::enc($ln)) . ") Tj\n";
                        if (!empty($s['underline'])) $ops .= "ET 0.5 w " . self::color($s['color'] ?? '#000000') . ' RG ' . round($tx, 2) . ' ' . round($Y($ty + 1.5), 2) . ' m ' . round($tx + $tw, 2) . ' ' . round($Y($ty + 1.5), 2) . " l S BT\n";
                    }
                    $ops .= "ET\n";
                }
            }
            if ($pi === 0) foreach ($sh->images as $k => $im) {
                if (!isset($imgObjs[$k]) || !isset($rows[$im['r']])) continue;
                $hpt = $im['h'] * $px; $wpt = $hpt * $imgObjs[$k]['w'] / max(1, $imgObjs[$k]['h']);
                $ops .= "q " . round($wpt, 2) . ' 0 0 ' . round($hpt, 2) . ' ' . round($x0[$im['c']], 2) . ' ' . round($Y($rows[$im['r']] + $hpt), 2) . ' cm /Im' . $k . " Do Q\n";
            }
            $stream = gzcompress($ops);
            $contentIds[$pi] = $add('<< /Length ' . strlen($stream) . " /Filter /FlateDecode >>\nstream\n" . $stream . "\nendstream");
        }
        $res = '<< /Font << ' . implode(' ', array_map(fn($i, $id) => '/F' . ($i + 1) . ' ' . $id . ' 0 R', array_keys($fontIds), $fontIds)) . ' >>' . ($imgObjs ? ' /XObject << ' . implode(' ', array_map(fn($k, $o) => '/Im' . $k . ' ' . $o['id'] . ' 0 R', array_keys($imgObjs), $imgObjs)) . ' >>' : '') . ' >>';
        $firstPage = count($objs) + 1; $pagesObj = $firstPage + count($pages);
        foreach ($pages as $pi => $_) $add('<< /Type /Page /Parent ' . $pagesObj . ' 0 R /MediaBox [0 0 ' . $pw . ' ' . $ph . '] /Resources ' . $res . ' /Contents ' . $contentIds[$pi] . ' 0 R >>');
        $add('<< /Type /Pages /Kids [' . implode(' ', array_map(fn($i) => ($firstPage + $i) . ' 0 R', array_keys($pages))) . '] /Count ' . count($pages) . ' >>');
        $cat = $add('<< /Type /Catalog /Pages ' . $pagesObj . ' 0 R >>');
        $out = "%PDF-1.5\n%\xE2\xE3\xCF\xD3\n"; $off = [];
        foreach ($objs as $i => $b) { $off[$i + 1] = strlen($out); $out .= ($i + 1) . " 0 obj\n" . $b . "\nendobj\n"; }
        $xref = strlen($out); $out .= "xref\n0 " . (count($objs) + 1) . "\n0000000000 65535 f \n";
        for ($i = 1; $i <= count($objs); $i++) $out .= str_pad((string)$off[$i], 10, '0', STR_PAD_LEFT) . " 00000 n \n";
        return $out . "trailer\n<< /Size " . (count($objs) + 1) . ' /Root ' . $cat . " 0 R >>\nstartxref\n" . $xref . "\n%%EOF\n";
    }
}
