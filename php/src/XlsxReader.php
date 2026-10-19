<?php
/** Lecture de classeurs Excel (.xlsx) : onglets → lignes de textes. Les dates stockées comme dates Excel sont ignorées (comme sur Apps Script). */
final class XlsxReader {
    private static function colIndex(string $ref): int { preg_match('/^([A-Z]+)/', $ref, $m); $n = 0; foreach (str_split($m[1] ?? 'A') as $ch) $n = $n * 26 + ord($ch) - 64; return $n - 1; }
    /** @return array<int, array{name: string, rows: array}> */
    public static function sheets(string $bytes): array {
        $tmp = tempnam(sys_get_temp_dir(), 'xr'); file_put_contents($tmp, $bytes);
        $zip = new ZipArchive();
        if ($zip->open($tmp) !== true) { @unlink($tmp); throw httpErr("Ce fichier n'est pas un classeur Excel (.xlsx) valide"); }
        try {
            $strings = [];
            if (($ss = $zip->getFromName('xl/sharedStrings.xml')) !== false) {
                $x = @simplexml_load_string($ss); if ($x) foreach ($x->si as $si) { $t = ''; if (isset($si->t)) $t = (string)$si->t; else foreach ($si->r as $r) $t .= (string)$r->t; $strings[] = $t; }
            }
            $wb = @simplexml_load_string((string)$zip->getFromName('xl/workbook.xml')); if (!$wb) throw httpErr("Classeur Excel illisible");
            $rels = []; $rx = @simplexml_load_string((string)$zip->getFromName('xl/_rels/workbook.xml.rels'));
            if ($rx) foreach ($rx->Relationship as $r) $rels[(string)$r['Id']] = (string)$r['Target'];
            $wb->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
            $out = [];
            foreach ($wb->sheets->sheet as $sh) {
                $rid = (string)$sh->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'];
                $target = $rels[$rid] ?? null; if (!$target) continue;
                $path = strpos($target, '/') === 0 ? ltrim($target, '/') : 'xl/' . $target;
                $xml = $zip->getFromName($path); if ($xml === false) continue;
                $ws = @simplexml_load_string($xml); if (!$ws) continue;
                $rows = []; $maxR = 0;
                foreach ($ws->sheetData->row as $row) {
                    $ri = (int)$row['r'] - 1; if ($ri < 0) $ri = count($rows);
                    $line = [];
                    foreach ($row->c as $c) {
                        $ci = self::colIndex((string)$c['r']); $t = (string)$c['t']; $v = '';
                        if ($t === 's') $v = $strings[(int)$c->v] ?? '';
                        elseif ($t === 'inlineStr') { $v = isset($c->is->t) ? (string)$c->is->t : ''; if ($v === '' && isset($c->is->r)) foreach ($c->is->r as $r) $v .= (string)$r->t; }
                        elseif ($t === 'str' || $t === 'b' || $t === 'e') $v = (string)$c->v;
                        else { $raw = (string)$c->v; $v = $raw; if ($raw !== '' && is_numeric($raw)) { $f = (float)$raw; $v = $f == floor($f) && abs($f) < 1e15 ? (string)(int)$f : (string)$f; } }
                        $line[$ci] = $v;
                    }
                    $w = $line ? max(array_keys($line)) + 1 : 0; $dense = array_fill(0, $w, ''); foreach ($line as $i => $v) $dense[$i] = $v;
                    $rows[$ri] = $dense; $maxR = max($maxR, $ri + 1);
                }
                $dense = []; for ($i = 0; $i < $maxR; $i++) $dense[] = $rows[$i] ?? [];
                if ($dense) $out[] = ['name' => (string)$sh['name'], 'rows' => $dense];
            }
            return $out;
        } finally { $zip->close(); @unlink($tmp); }
    }
}
