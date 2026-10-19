<?php
/** Jours fériés algériens : fêtes nationales fixes et fêtes religieuses estimées (calendrier hégirien civil). */
final class Holidays {
    const FIXES = [[1, 1, 'Nouvel an'], [1, 12, 'Yennayer (Nouvel an amazigh)'], [5, 1, 'Fête du travail'], [7, 5, "Fête de l'indépendance"], [11, 1, 'Anniversaire de la Révolution']];
    const RELIGIEUSES = [[1, 1, 'Nouvel an hégirien', 1], [1, 10, 'Achoura', 1], [3, 12, 'Mawlid Ennabaoui', 1], [10, 1, 'Aïd el-Fitr', 2], [12, 10, 'Aïd el-Adha', 2]];
    private static function iso(int $y, int $m, int $d): string { return $y . '-' . Dates::pad($m) . '-' . Dates::pad($d); }
    private static function hijriToJd(int $y, int $m, int $d): float { return $d + ceil(29.5 * ($m - 1)) + ($y - 1) * 354 + floor((3 + 11 * $y) / 30) + 1948439.5 - 1; }
    private static function jdToIso(float $jd): string {
        $z = floor($jd + 0.5); $a = $z;
        if ($z >= 2299161) { $al = floor(($z - 1867216.25) / 36524.25); $a = $z + 1 + $al - floor($al / 4); }
        $b = $a + 1524; $c = floor(($b - 122.1) / 365.25); $dd = floor(365.25 * $c); $e = floor(($b - $dd) / 30.6001);
        $day = $b - $dd - floor(30.6001 * $e); $month = $e < 14 ? $e - 1 : $e - 13; $year = $month > 2 ? $c - 4716 : $c - 4715;
        return self::iso((int)$year, (int)$month, (int)$day);
    }
    public static function ofYear(int $y): array {
        $out = [];
        foreach (self::FIXES as $f) $out[] = ['date' => self::iso($y, $f[0], $f[1]), 'nom' => $f[2], 'type' => 'nationale'];
        $h = (int)floor(($y - 622) * 33 / 32);
        foreach ([$h - 1, $h, $h + 1, $h + 2] as $hy) {
            foreach (self::RELIGIEUSES as $r) {
                $start = self::hijriToJd($hy, $r[0], $r[1]);
                for ($i = 0; $i < $r[3]; $i++) {
                    $date = self::jdToIso($start + $i);
                    if (substr($date, 0, 4) === (string)$y) $out[] = ['date' => $date, 'nom' => $r[3] > 1 ? $r[2] . ' (jour ' . ($i + 1) . ')' : $r[2], 'type' => 'religieuse'];
                }
            }
        }
        return $out;
    }
    public static function parsePerso($text): array {
        $add = []; $del = [];
        foreach (preg_split('/\r?\n/', (string)$text) as $line) {
            $line = trim($line); if ($line === '') continue;
            if (preg_match('/^-\s*(\d{4}-\d{2}-\d{2})/', $line, $m)) { $del[$m[1]] = true; continue; }
            if (preg_match('/^(\d{4}-\d{2}-\d{2})\s*(.*)$/', $line, $m)) $add[] = ['date' => $m[1], 'nom' => trim($m[2]) ?: 'Jour férié', 'type' => 'perso'];
        }
        return ['add' => $add, 'del' => $del];
    }
    public static function between(string $from, string $to, $perso): array {
        $p = self::parsePerso($perso); $out = []; $seen = [];
        for ($y = (int)substr($from, 0, 4); $y <= (int)substr($to, 0, 4); $y++) {
            $extra = array_filter($p['add'], fn($x) => substr($x['date'], 0, 4) === (string)$y);
            foreach (array_merge(self::ofYear($y), $extra) as $h) {
                if ($h['date'] < $from || $h['date'] > $to || isset($p['del'][$h['date']])) continue;
                $k = $h['date'] . '|' . $h['nom']; if (isset($seen[$k])) continue; $seen[$k] = true; $out[] = $h;
            }
        }
        usort($out, fn($a, $b) => strcmp($a['date'], $b['date']));
        return $out;
    }
}
