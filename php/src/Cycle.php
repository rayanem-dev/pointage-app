<?php
/** Moteur de rotation (fonctions pures) : cycle T/R, prévisions, totaux, situation du jour. */
final class Cycle {
    /** months : ['AAAA-MM' => [agentId => [31 statuts]]] → carte date => statut (triée par date). */
    public static function timelineOf(array $months, string $agentId): array {
        $tl = []; $keys = array_keys($months); sort($keys);
        foreach ($keys as $key) {
            $days = $months[$key][$agentId] ?? null; if (!$days) continue;
            foreach ($days as $i => $st) if ($st !== '' && $st !== null) $tl[$key . '-' . Dates::pad($i + 1)] = $st;
        }
        return $tl;
    }
    public static function totalsOf(array $months, string $agentId, ?string $upToKey = null): array {
        $t = ['T' => 0, 'R' => 0, 'ABS' => 0];
        foreach ($months as $key => $m) {
            if ($upToKey && (string)$key > $upToKey) continue;
            foreach (($m[$agentId] ?? []) as $st) if (isset($t[$st])) $t[$st]++;
        }
        return ['T' => $t['T'], 'R' => $t['R'], 'ABS' => $t['ABS'], 'reliquat' => $t['T'] - $t['R']];
    }
    private static function other(string $s): string { return $s === 'T' ? 'R' : 'T'; }
    public static function simulate(array $tl, array $params, string $toDate): array {
        $nT = (float)$params['jours_travail']; $nR = (float)$params['jours_repos'];
        $out = ['forecast' => [], 'st' => null, 'run' => 0, 'last' => null];
        if (!($nT >= 1) || !($nR >= 1)) return $out;
        $first = null;
        foreach ($tl as $d => $v) if (($v === 'T' || $v === 'R') && ($first === null || $d < $first)) $first = $d;
        if ($first === null) return $out;
        $total = fn($s) => $s === 'T' ? $nT : $nR;
        $st = null; $run = 0;
        for ($d = $first; $d <= $toDate; $d = Dates::addDays($d, 1)) {
            if ($st && $run >= $total($st)) { $st = self::other($st); $run = 0; }
            $real = $tl[$d] ?? null;
            if ($real === 'T' || $real === 'R') { if ($st === $real) $run++; else { $st = $real; $run = 1; } }
            elseif ($real) { if ($st) $run++; }
            elseif ($st) { $out['forecast'][$d] = $st; $run++; }
            if ($real) { $out['last'] = $d; $out['st'] = $st; $out['run'] = $run; }
        }
        return $out;
    }
    public static function cycleOf(array $tl, array $params): ?array {
        $last = null; foreach ($tl as $d => $v) if ($last === null || $d > $last) $last = $d;
        if ($last === null) return null;
        $s = self::simulate($tl, $params, $last);
        if (!$s['st']) return null;
        $total = $s['st'] === 'T' ? (int)$params['jours_travail'] : (int)$params['jours_repos'];
        $remaining = max(0, $total - $s['run']);
        return ['last' => $last, 'status' => $s['st'], 'run' => $s['run'], 'total' => $total, 'remaining' => $remaining, 'next' => Dates::addDays($last, $remaining + 1), 'nextStatus' => self::other($s['st'])];
    }
    public static function forecastOf(array $tl, array $params, string $toDate): array { return self::simulate($tl, $params, $toDate)['forecast']; }
    public static function dayInfo(array $tl, array $params, string $date): ?array {
        $horizon = (int)$params['jours_travail'] + (int)$params['jours_repos'] + (int)$params['jours_travail'] + 5;
        $fc = self::forecastOf($tl, $params, Dates::addDays($date, $horizon));
        $st = $tl[$date] ?? ($fc[$date] ?? '');
        if (!$st) return null;
        if ($st === 'ABS') return ['status' => $st, 'prevu' => false, 'remaining' => 0, 'change' => null, 'changeStatus' => null];
        $d = Dates::addDays($date, 1); $n = 1; $s = '';
        for (; $n < $horizon; $n++) { $s = $tl[$d] ?? ($fc[$d] ?? ''); if ($s !== $st) break; $d = Dates::addDays($d, 1); }
        return ['status' => $st, 'prevu' => !isset($tl[$date]), 'remaining' => $n, 'change' => $s ? $d : null, 'changeStatus' => $s ?: null];
    }
}
