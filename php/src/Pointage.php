<?php
/** Pointage : un jour pointé par ligne dans la table « pointage » (Apps Script : un onglet par mois). */
final class Pointage {
    public static function cell($v): string { $s = strtoupper(trim((string)($v ?? ''))); if ($s === 'CR') return 'R'; return in_array($s, CFG()['STATUTS'], true) ? $s : ''; }

    /** months : ['AAAA-MM' => [agentId => [31 statuts]]] ; $ids limite aux agents voulus (plus rapide). */
    public static function loadMonths(?array $ids = null): array {
        $months = [];
        if ($ids !== null && !$ids) return $months;
        $sql = 'SELECT agent_id, DATE_FORMAT(jour, "%Y-%m") AS m, DAY(jour) AS d, statut FROM pointage';
        $args = [];
        if ($ids !== null) { $sql .= ' WHERE agent_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')'; $args = array_values($ids); }
        $st = Store::pdo()->prepare($sql); $st->execute($args);
        foreach ($st->fetchAll() as $r) {
            if (!isset($months[$r['m']][$r['agent_id']])) $months[$r['m']][$r['agent_id']] = array_fill(0, 31, '');
            $months[$r['m']][$r['agent_id']][(int)$r['d'] - 1] = $r['statut'];
        }
        ksort($months);
        return $months;
    }
    public static function loadAllMonths(): array { return ['months' => self::loadMonths(), 'agents' => Agents::list()]; }
    public static function monthsWithData(): array { return Store::pdo()->query('SELECT DISTINCT DATE_FORMAT(jour, "%Y-%m") AS m FROM pointage ORDER BY m')->fetchAll(PDO::FETCH_COLUMN); }

    private static function put(string $agentId, string $date, string $statut): void {
        if ($statut === '') Store::pdo()->prepare('DELETE FROM pointage WHERE agent_id=? AND jour=?')->execute([$agentId, $date]);
        else Store::pdo()->prepare('INSERT INTO pointage (agent_id, jour, statut) VALUES (?,?,?) ON DUPLICATE KEY UPDATE statut=VALUES(statut)')->execute([$agentId, $date, $statut]);
    }
    public static function setStatus($agentId, $from, $to, $statut): array {
        $end = $to ?: $from;
        if (!Dates::isDate($from) || !Dates::isDate($end) || $end < $from) throw httpErr('Dates invalides');
        if ($statut !== '' && !in_array($statut, CFG()['STATUTS'], true)) throw httpErr('Statut invalide (T, R ou ABS)');
        $span = Dates::diffDays($from, $end);
        if ($span > 92) throw httpErr('Période trop longue (92 jours maximum)');
        $ok = false; foreach (Agents::list() as $a) if ($a['id'] === $agentId && Agents::isPerson($a)) { $ok = true; break; }
        if (!$ok) throw httpErr('Agent introuvable');
        for ($d = $from; $d <= $end; $d = Dates::addDays($d, 1)) self::put($agentId, $d, $statut);
        return ['jours' => $span + 1];
    }

    /** Complète les jours non pointés (dernier statut recopié, ou rotation prévue). o : tous, agent_ids, from, to, mode, apercu, auto. */
    public static function completer(array $user, ?array $o): array {
        $o = $o ?? [];
        $today = Dates::today(); $to = $o['to'] ?? '' ?: $today; $from = $o['from'] ?? '';
        if (!Dates::isDate($to) || ($from && !Dates::isDate($from))) throw httpErr('Dates invalides');
        if ($from && $from > $to) throw httpErr('La date de fin précède la date de début');
        $rotation = ($o['mode'] ?? '') === 'rotation';
        $params = Params::get();
        $chosen = array_flip((array)($o['agent_ids'] ?? []));
        $cibles = array_values(array_filter(Agents::visibleTo($user), fn($a) => Agents::isPerson($a) && $a['actif'] === '1' && (!empty($o['tous']) || isset($chosen[$a['id']]))));
        if (!$cibles) { if (!empty($o['auto'])) return ['applique' => false, 'agents' => [], 'ignores' => [], 'total' => 0, 'to' => $to]; throw httpErr('Aucun agent sélectionné'); }
        $months = self::loadMonths(array_map(fn($a) => $a['id'], $cibles));
        $plan = []; $ignores = []; $total = 0;
        foreach ($cibles as $a) {
            $tl = Cycle::timelineOf($months, $a['id']); $last = '';
            foreach ($tl as $d => $v) if ($last === '' || $d > $last) $last = $d;
            if ($last === '') { $ignores[] = ['id' => $a['id'], 'nom' => $a['nom'], 'raison' => 'aucun pointage']; continue; }
            $start = $from ?: Dates::addDays($last, 1);
            if ($start > $to) { $ignores[] = ['id' => $a['id'], 'nom' => $a['nom'], 'raison' => 'à jour']; continue; }
            if (Dates::diffDays($start, $to) > 92) {
                if (!empty($o['auto'])) { $ignores[] = ['id' => $a['id'], 'nom' => $a['nom'], 'raison' => 'dernier pointage trop ancien']; continue; }
                throw httpErr('Période trop longue (93 jours maximum par agent) : ' . $a['nom']);
            }
            $fc = $rotation ? Cycle::forecastOf($tl, Agents::rotationParams($a, $params), $to) : null; $dernier = $tl[$last];
            $jours = [];
            for ($d = $start; $d <= $to; $d = Dates::addDays($d, 1)) {
                if (isset($tl[$d])) continue;
                $st = $rotation ? ($fc[$d] ?? null) : $dernier;
                if ($st) $jours[] = ['date' => $d, 'statut' => $st];
            }
            if (!$jours) { $ignores[] = ['id' => $a['id'], 'nom' => $a['nom'], 'raison' => 'à jour']; continue; }
            $total += count($jours);
            $plan[] = ['id' => $a['id'], 'nom' => $a['nom'], 'dernier' => $last, 'dernier_statut' => $dernier, 'du' => $jours[0]['date'], 'au' => end($jours)['date'], 'jours' => count($jours), 'statut' => $rotation ? 'rotation' : $dernier, '_j' => $jours];
        }
        $resume = array_map(fn($x) => ['id' => $x['id'], 'nom' => $x['nom'], 'dernier' => $x['dernier'], 'dernier_statut' => $x['dernier_statut'], 'du' => $x['du'], 'au' => $x['au'], 'jours' => $x['jours'], 'statut' => $x['statut']], $plan);
        if (!empty($o['apercu']) || !$plan) return ['applique' => false, 'agents' => $resume, 'ignores' => $ignores, 'total' => $total, 'to' => $to];
        foreach ($plan as $x) foreach ($x['_j'] as $j) self::put($x['id'], $j['date'], $j['statut']);
        return ['applique' => true, 'agents' => $resume, 'ignores' => $ignores, 'total' => $total, 'to' => $to];
    }

    /** Import en masse : $lignesParMois = [['key' => 'AAAA-MM', 'lignes' => [['id' =>, 'jours' => [31]]]]]. mode « completer » ou « remplacer ». */
    public static function importEntries(array $lignesParMois, string $mode): array {
        $ecrits = 0; $conserves = 0; $touched = [];
        $ids = []; foreach ($lignesParMois as $m) foreach ($m['lignes'] as $l) $ids[$l['id']] = 1;
        $months = self::loadMonths(array_keys($ids));
        foreach ($lignesParMois as $m) {
            if (!Dates::isMonthKey($m['key'])) continue;
            $p = Dates::parseKey($m['key']); $nd = Dates::daysInMonth($p['y'], $p['m']);
            foreach ($m['lignes'] as $l) {
                $cur = $months[$m['key']][$l['id']] ?? array_fill(0, 31, '');
                for ($d = 0; $d < $nd; $d++) {
                    $v = self::cell($l['jours'][$d] ?? '');
                    if ($v === '') continue;
                    if ($cur[$d] !== '' && ($mode !== 'remplacer' || $cur[$d] === $v)) { if ($cur[$d] !== $v) $conserves++; continue; }
                    $cur[$d] = $v; $ecrits++; $touched[$m['key']] = true;
                    self::put($l['id'], $m['key'] . '-' . Dates::pad($d + 1), $v);
                }
                $months[$m['key']][$l['id']] = $cur;
            }
        }
        return ['ecrits' => $ecrits, 'conserves' => $conserves, 'mois' => count($touched)];
    }

    private static function sortVehLast(array $agents): array { usort($agents, fn($a, $b) => (($a['type'] === 'vehicule') <=> ($b['type'] === 'vehicule'))); return $agents; }

    public static function grid($key, array $visibleAgents, $prevu = true): array {
        if (!Dates::isMonthKey($key)) throw httpErr('Mois invalide (AAAA-MM)');
        $withForecast = $prevu !== false;
        $params = Params::get();
        $p = Dates::parseKey($key); $nd = Dates::daysInMonth($p['y'], $p['m']); $end = $key . '-' . Dates::pad($nd);
        $ordered = self::sortVehLast($visibleAgents);
        $months = self::loadMonths(array_map(fn($a) => $a['id'], $ordered));
        $rows = [];
        foreach ($ordered as $a) {
            $tl = Cycle::timelineOf($months, $a['id']); $ap = Agents::rotationParams($a, $params);
            $fc = $withForecast && $a['type'] !== 'vehicule' ? Cycle::forecastOf($tl, $ap, $end) : [];
            $cy = Cycle::cycleOf($tl, $ap);
            $prevision = ['etat' => $a['type'] === 'vehicule' ? 'vehicule' : ($cy ? 'ok' : 'aucun'), 'derniere' => $cy ? $cy['last'] : ''];
            $days = [];
            for ($i = 0; $i < $nd; $i++) { $d = $key . '-' . Dates::pad($i + 1); $days[] = ['statut' => $tl[$d] ?? '', 'prevu' => isset($tl[$d]) ? '' : ($fc[$d] ?? '')]; }
            $one = [$key => $months[$key] ?? []];
            $rows[] = ['id' => $a['id'], 'rotation' => $a['rotation'], 'nom' => $a['nom'], 'type' => $a['type'] === 'vehicule' ? 'vehicule' : 'personne', 'fonction' => $a['fonction'], 'affectation' => $a['affectation'], 'contrat' => $a['contrat'], 'chef_id' => $a['chef_id'], 'prevision' => $prevision, 'days' => $days, 'mois' => Cycle::totalsOf($one, $a['id']), 'cumul' => Cycle::totalsOf($months, $a['id'], $key)];
        }
        return ['month' => $key, 'label' => Dates::monthLabel($key), 'nd' => $nd, 'rows' => $rows, 'feries' => Holidays::between($key . '-01', $end, $params['feries_perso']), 'today' => Dates::today()];
    }

    public static function timeline($startKey, $n, array $visibleAgents, $prevu = true): array {
        if (!Dates::isMonthKey($startKey)) throw httpErr('Mois invalide (AAAA-MM)');
        $n = (int)$n;
        if (!in_array($n, [1, 3, 6, 12], true)) throw httpErr('Période invalide (1, 3, 6 ou 12 mois)');
        $withForecast = $prevu !== false; $params = Params::get();
        $keys = []; for ($i = 0; $i < $n; $i++) $keys[] = Dates::addMonths($startKey, $i);
        $spans = array_map(function ($k) { $p = Dates::parseKey($k); return ['key' => $k, 'label' => Dates::monthLabel($k), 'nd' => Dates::daysInMonth($p['y'], $p['m'])]; }, $keys);
        $last = $spans[$n - 1]; $from = $startKey . '-01'; $to = $last['key'] . '-' . Dates::pad($last['nd']);
        $dates = []; foreach ($spans as $s) for ($d = 1; $d <= $s['nd']; $d++) $dates[] = $s['key'] . '-' . Dates::pad($d);
        $ordered = self::sortVehLast($visibleAgents);
        $months = self::loadMonths(array_map(fn($a) => $a['id'], $ordered));
        $rows = [];
        foreach ($ordered as $a) {
            $tl = Cycle::timelineOf($months, $a['id']);
            $fc = $withForecast && $a['type'] !== 'vehicule' ? Cycle::forecastOf($tl, Agents::rotationParams($a, $params), $to) : [];
            $tot = ['T' => 0, 'R' => 0, 'ABS' => 0]; $chars = '';
            foreach ($dates as $d) {
                $real = $tl[$d] ?? null;
                if ($real) { if (isset($tot[$real])) $tot[$real]++; $chars .= $real === 'ABS' ? 'A' : $real; continue; }
                $f = $fc[$d] ?? null; $chars .= $f === 'T' ? 't' : ($f === 'R' ? 'r' : '.');
            }
            $rows[] = ['id' => $a['id'], 'nom' => $a['nom'], 'type' => $a['type'] === 'vehicule' ? 'vehicule' : 'personne', 'fonction' => $a['fonction'], 'd' => $chars, 'total' => $tot, 'cumul' => Cycle::totalsOf($months, $a['id'], $last['key'])];
        }
        return ['from' => $from, 'to' => $to, 'n' => $n, 'months' => $spans, 'rows' => $rows, 'feries' => Holidays::between($from, $to, $params['feries_perso']), 'today' => Dates::today()];
    }

    public static function overview(array $agent): array {
        $months = self::loadMonths([$agent['id']]); $params = Agents::rotationParams($agent, Params::get());
        $tl = Cycle::timelineOf($months, $agent['id']);
        $today = Dates::today(); $key = substr($today, 0, 7);
        $one = [$key => $months[$key] ?? []];
        $info = Cycle::dayInfo($tl, $params, $today); $cumul = Cycle::totalsOf($months, $agent['id']);
        $soldeChange = null;
        if ($info && $info['change']) {
            $endD = Dates::addDays($info['change'], -1); $t = 0; $r = 0;
            foreach (Cycle::forecastOf($tl, $params, $endD) as $d => $v) if ($d <= $endD) { if ($v === 'T') $t++; elseif ($v === 'R') $r++; }
            $soldeChange = $cumul['T'] + $t - ($cumul['R'] + $r);
        }
        return ['cumul' => $cumul, 'mois' => Cycle::totalsOf($one, $agent['id']), 'month' => $key, 'cycle' => Cycle::cycleOf($tl, $params), 'aujourdhui' => $info, 'soldeChange' => $soldeChange, 'today' => $today];
    }
}
