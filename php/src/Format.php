<?php
/** Mise en forme : nombres en lettres, montants, adresses e-mail, limites d'envoi. */
final class Format {
    const U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
    const T = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
    private static function below100(int $n, bool $final): string {
        if ($n < 20) return self::U[$n];
        if ($n < 70) { $t = intdiv($n, 10); $u = $n % 10; return self::T[$t] . ($u === 1 ? ' et un' : ($u ? '-' . self::U[$u] : '')); }
        if ($n < 80) return $n === 71 ? 'soixante et onze' : 'soixante-' . self::U[$n - 60];
        return $n === 80 ? ($final ? 'quatre-vingts' : 'quatre-vingt') : 'quatre-vingt-' . self::U[$n - 80];
    }
    private static function below1000(int $n, bool $final): string {
        $c = intdiv($n, 100); $r = $n % 100;
        $s = $c === 1 ? 'cent' : ($c > 1 ? self::U[$c] . ' cent' . ($r === 0 && $final ? 's' : '') : '');
        if ($r) $s .= ($s !== '' ? ' ' : '') . self::below100($r, $final);
        return $s;
    }
    public static function words(int $n): string {
        if ($n === 0) return 'zéro';
        $bil = intdiv($n, 1000000000); $mil = intdiv($n % 1000000000, 1000000); $k = intdiv($n % 1000000, 1000); $r = $n % 1000;
        $p = [];
        if ($bil) $p[] = self::below1000($bil, true) . ' milliard' . ($bil > 1 ? 's' : '');
        if ($mil) $p[] = self::below1000($mil, true) . ' million' . ($mil > 1 ? 's' : '');
        if ($k) $p[] = $k === 1 ? 'mille' : self::below1000($k, false) . ' mille';
        if ($r) $p[] = self::below1000($r, true);
        return implode(' ', $p);
    }
    private static function group(string $s): string { return preg_replace('/\B(?=(\d{3})+(?!\d))/', ' ', $s); }
    public static function money($n): string { $p = explode('.', number_format((float)$n, 2, '.', '')); return self::group($p[0]) . ',' . $p[1]; }
    public static function int($n): string { return self::group((string)(int)round((float)$n)); }
    public static function stripAccents($s): string {
        $s = (string)$s;
        if (class_exists('Normalizer')) $s = Normalizer::normalize($s, Normalizer::FORM_D) ?: $s;
        return preg_replace('/\p{Mn}+/u', '', $s);
    }
    public static function amountInWords($n): string {
        $total = (int)round((float)$n * 100); $d = intdiv($total, 100); $c = $total % 100;
        $s = self::words($d) . ' dinar' . ($d > 1 ? 's' : '') . ' algérien' . ($d > 1 ? 's' : '');
        if ($c) $s .= ' et ' . self::words($c) . ' centime' . ($c > 1 ? 's' : '');
        return self::stripAccents(mb_strtoupper($s));
    }
    public static function norm($s): string { return trim(preg_replace('/\s+/u', ' ', mb_strtolower(self::stripAccents($s)))); }
    /** Limite d'envois : true si l'action est encore permise (compteur par clé, fenêtre en secondes). */
    public static function allow(string $key, int $max, int $seconds): bool {
        $n = (int)(Cache::get($key) ?? 0);
        if ($n >= $max) return false;
        Cache::put($key, (string)($n + 1), $seconds); return true;
    }
    /** Liste d'adresses (séparées par virgule, point-virgule ou espace), minuscules, sans doublon. */
    public static function emails($v, string $label, int $max = 4): array {
        $parts = preg_split('/[\s,;]+/', mb_strtolower((string)($v ?? ''))) ?: [];
        $list = array_values(array_unique(array_filter($parts, fn($x) => $x !== '')));
        foreach ($list as $x) if (!self::validEmail($x)) throw httpErr($label . ' : adresse invalide (' . $x . ')');
        if (count($list) > $max) throw httpErr($label . ' : ' . $max . ' adresses au maximum');
        return $list;
    }
    public static function validEmail(string $e): bool { return preg_match('/^\S+@\S+\.\S+$/', $e) === 1; }
    /** Nombre comme en JavaScript : entier si la valeur est entière. */
    public static function num($v) { $f = (float)$v; return $f == floor($f) && abs($f) < 1e15 ? (int)$f : $f; }
}
