<?php
/** Dates « AAAA-MM-JJ » et mois « AAAA-MM » (UTC, sans heure d'été). */
final class Dates {
    const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    public static function pad(int $n): string { return ($n < 10 ? '0' : '') . $n; }
    public static function daysInMonth(int $y, int $m): int { return (int)gmdate('t', gmmktime(0, 0, 0, $m, 1, $y)); }
    public static function monthKey(int $y, int $m): string { return $y . '-' . self::pad($m); }
    public static function parseKey(string $k): array { $p = explode('-', $k); return ['y' => (int)$p[0], 'm' => (int)$p[1]]; }
    public static function isMonthKey($k): bool { return is_string($k) && preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $k) === 1; }
    public static function isDate($s): bool {
        if (!is_string($s) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) return false;
        return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
    }
    public static function ts(string $s): int { return gmmktime(0, 0, 0, (int)substr($s, 5, 2), (int)substr($s, 8, 2), (int)substr($s, 0, 4)); }
    public static function addDays(string $s, int $n): string { return gmdate('Y-m-d', self::ts($s) + $n * 86400); }
    public static function diffDays(string $a, string $b): int { return (int)round((self::ts($b) - self::ts($a)) / 86400); }
    public static function today(): string { return date('Y-m-d'); }
    public static function monthLabel(string $k): string { $p = self::parseKey($k); return self::MOIS[$p['m'] - 1] . ' ' . $p['y']; }
    public static function addMonths(string $k, int $n): string { $p = self::parseKey($k); $t = $p['y'] * 12 + ($p['m'] - 1) + $n; return self::monthKey(intdiv($t, 12), ($t % 12) + 1); }
    public static function monthDiff(string $a, string $b): int { $x = self::parseKey($a); $y = self::parseKey($b); return ($y['y'] - $x['y']) * 12 + ($y['m'] - $x['m']); }
    public static function monthEnd(string $k): string { $p = self::parseKey($k); return $k . '-' . self::pad(self::daysInMonth($p['y'], $p['m'])); }
    public static function frDate(?string $s): string { return $s ? substr($s, 8, 2) . '/' . substr($s, 5, 2) . '/' . substr($s, 0, 4) : ''; }
}
