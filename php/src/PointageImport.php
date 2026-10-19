<?php
/** Import d'un pointage depuis un classeur Excel / CSV (un onglet par mois : « AAAA-MM » ou titre « Mois de : Mai 2025 »). analyser → appliquer. */
final class PointageImport {
    const MOIS = [['jan', 1], ['fev', 2], ['mar', 3], ['avr', 4], ['mai', 5], ['juil', 7], ['juin', 6], ['jui', 6], ['aou', 8], ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12]];
    private static function norm($s): string { return Format::norm($s); }
    private static function monthNum($word): int { $w = self::norm($word); foreach (self::MOIS as $m) if (strpos($w, $m[0]) === 0) return $m[1]; return 0; }
    private static function key(int $y, int $m): string { return $y . '-' . ($m < 10 ? '0' : '') . $m; }
    public static function monthOf($name, array $rows): string {
        for ($i = 0; $i < min(count($rows), 12); $i++) foreach ($rows[$i] as $cell) {
            if (preg_match('/mois\s*de\s*:?\s*([a-zA-Zéèêûôîàù]+)\s*(\d{4})/iu', (string)$cell, $m) && self::monthNum($m[1])) return self::key((int)$m[2], self::monthNum($m[1]));
        }
        $n = trim((string)$name);
        if (preg_match('/^(\d{4})-(\d{2})$/', $n, $m)) return self::key((int)$m[1], (int)$m[2]);
        if (preg_match('/^([a-zA-Zéèêûôîàù]+)\s*[-_ ]?\s*(\d{2}|\d{4})$/u', $n, $m) && self::monthNum($m[1])) return self::key(strlen($m[2]) === 2 ? 2000 + (int)$m[2] : (int)$m[2], self::monthNum($m[1]));
        return '';
    }
    private static function status($v): string { $s = strtoupper(trim((string)($v ?? ''))); if ($s === 'T') return 'T'; if ($s === 'R' || $s === 'CR') return 'R'; if ($s === 'ABS' || $s === 'AB' || $s === 'A') return 'ABS'; return ''; }
    public static function parseSheet($name, array $rows): ?array {
        $h = -1; foreach ($rows as $i => $r) if (self::norm($r[0] ?? '') === 'nom et prenom') { $h = $i; break; }
        if ($h < 0) return null;
        $k = self::monthOf($name, $rows); if ($k === '') return null;
        $p = Dates::parseKey($k); $nd = Dates::daysInMonth($p['y'], $p['m']); $c0 = 2;
        foreach ($rows[$h] as $i => $v) if (trim((string)$v) === '1') { $c0 = $i; break; }
        $lignes = [];
        for ($i = $h + 1; $i < count($rows); $i++) {
            $nom = trim(preg_replace('/\s+/u', ' ', (string)($rows[$i][0] ?? '')));
            if ($nom === '') continue;
            if (preg_match('/^(p\/|le prestataire)/i', $nom)) break;
            if (self::norm($nom) === 'personnel' || preg_match('/^\d+([.,]\d+)?$/', $nom)) continue;
            $jours = []; for ($d = 0; $d < 31; $d++) $jours[] = $d < $nd ? self::status($rows[$i][$c0 + $d] ?? '') : '';
            $lignes[] = ['nom' => $nom, 'fonction' => trim((string)($rows[$i][1] ?? '')), 'jours' => $jours];
        }
        return ['key' => $k, 'lignes' => $lignes];
    }
    private static function ratio(string $a, string $b): float { $m = max(strlen($a), strlen($b)); return $m ? 1 - levenshtein(substr($a, 0, 250), substr($b, 0, 250)) / $m : 1.0; }
    private static function phon(string $s): string { return str_replace(['ou', 'y'], ['u', 'i'], $s); }
    private static function tokens($s): array { return array_values(array_filter(explode(' ', self::phon(preg_replace('/[^a-z0-9 ]/', ' ', self::norm($s)))), fn($x) => $x !== '')); }
    public static function similarity($a, $b): float {
        $ta = self::tokens($a); $tb = self::tokens($b); if (!$ta || !$tb) return 0.0;
        $sa = $ta; sort($sa); $sb = $tb; sort($sb);
        $best = max(self::ratio(implode(' ', $sa), implode(' ', $sb)), self::ratio(implode('', $ta), implode('', $tb)));
        $shorter = count($ta) <= count($tb) ? $ta : $tb; $longer = count($ta) <= count($tb) ? $tb : $ta;
        if (count($shorter) < count($longer) && array_filter($shorter, fn($t) => strlen($t) >= 5)) {
            $used = []; $all = true;
            foreach ($shorter as $t) { $found = false; foreach ($longer as $i => $l) if (!isset($used[$i]) && self::ratio($t, $l) >= 0.85) { $used[$i] = true; $found = true; break; } if (!$found) { $all = false; break; } }
            if ($all) $best = max($best, 0.9);
        }
        return $best;
    }
    public static function groupNames(array $counts): array {
        $names = array_keys($counts);
        usort($names, fn($a, $b) => ($counts[$b] <=> $counts[$a]) ?: (strlen($b) <=> strlen($a)));
        $groups = [];
        foreach ($names as $n) {
            $g = null; foreach ($groups as $i => $x) if (self::similarity($x['nom'], $n) >= 0.85) { $g = $i; break; }
            if ($g !== null) $groups[$g]['variantes'][] = $n; else $groups[] = ['nom' => $n, 'variantes' => [$n]];
        }
        return $groups;
    }
    private static function readSheets(array $o): array {
        $name = (string)($o['nom'] ?? 'pointage'); $ext = preg_match('/\.([a-z0-9]+)$/i', $name, $m) ? strtolower($m[1]) : '';
        $bytes = base64_decode((string)($o['base64'] ?? ''), true);
        if ($bytes === false || $bytes === '') throw httpErr('Fichier vide');
        if (strlen($bytes) > CFG()['MAX_UPLOAD_BYTES']) throw httpErr('Fichier trop volumineux (10 Mo maximum)');
        if ($ext === 'csv') {
            $text = mb_convert_encoding($bytes, 'UTF-8', 'UTF-8, Windows-1252');
            $sep = strpos($text, ';') !== false ? ';' : (strpos($text, "\t") !== false ? "\t" : ',');
            return [['name' => (string)($o['mois'] ?? preg_replace('/\.csv$/i', '', $name)), 'rows' => array_map(fn($l) => explode($sep, $l), preg_split('/\r?\n/', $text))]];
        }
        if ($ext !== 'xlsx') throw httpErr($ext === 'xls' ? 'Ancien format Excel (.xls) : enregistrez le fichier au format .xlsx ou CSV' : 'Format non pris en charge (Excel .xlsx ou CSV)');
        return XlsxReader::sheets($bytes);
    }
    public static function analyser(?array $o): array {
        $o = $o ?? []; $sheets = self::readSheets($o); $warnings = []; $byKey = []; $arch = Archive::parse($sheets);
        foreach ($sheets as $s) {
            $nn = self::norm($s['name']);
            if (preg_match('/cumul|global|lisez|demarrage|synth|recap|total/', $nn) || preg_match('/^(contrat|fonctions|agents|attachements|attachementsvalides|params)$/', preg_replace('/[^a-z]/', '', $nn))) continue;
            $r = self::parseSheet($s['name'], $s['rows']);
            if (!$r) { if (count($s['rows']) > 5) $warnings[] = 'Onglet « ' . $s['name'] . ' » ignoré : mois ou tableau « Nom Et Prenom » non reconnu.'; continue; }
            $n = 0; foreach ($r['lignes'] as $l) $n += count(array_filter($l['jours']));
            if (isset($byKey[$r['key']])) { $warnings[] = 'Mois ' . $r['key'] . ' présent dans deux onglets (« ' . $byKey[$r['key']]['onglet'] . ' » et « ' . $s['name'] . ' ») : celui qui a le plus de jours pointés est retenu.'; if ($byKey[$r['key']]['n'] >= $n) continue; }
            $byKey[$r['key']] = ['key' => $r['key'], 'onglet' => $s['name'], 'lignes' => $r['lignes'], 'n' => $n];
        }
        $keys = array_keys($byKey); sort($keys);
        if (!$keys && !$arch) throw httpErr("Aucun mois reconnu : un onglet par mois, avec « Nom Et Prenom » en A et « Mois de : Mai 2025 » (ou un onglet nommé 2025-05).");
        $counts = []; foreach ($keys as $k) foreach ($byKey[$k]['lignes'] as $l) $counts[$l['nom']] = ($counts[$l['nom']] ?? 0) + 1;
        $groups = self::groupNames($counts); $cleOf = [];
        foreach ($groups as $i => &$g) { $g['cle'] = 'p' . $i; foreach ($g['variantes'] as $v) $cleOf[$v] = $g['cle']; $g['mois'] = 0; $g['jours'] = 0; $g['fonction'] = ''; $g['debut'] = ''; $g['fin'] = ''; }
        unset($g);
        $agents = array_values(array_filter(Agents::list(), fn($a) => Agents::isPerson($a) && $a['type'] !== 'vehicule'));
        $mois = [];
        foreach ($keys as $k) {
            $lignes = [];
            foreach ($byKey[$k]['lignes'] as $l) {
                $gi = null; foreach ($groups as $i => $x) if ($x['cle'] === $cleOf[$l['nom']]) $gi = $i;
                $n = count(array_filter($l['jours']));
                if ($n) { $groups[$gi]['mois']++; $groups[$gi]['jours'] += $n; if ($l['fonction'] !== '') $groups[$gi]['fonction'] = $l['fonction']; if ($groups[$gi]['debut'] === '') $groups[$gi]['debut'] = $k; $groups[$gi]['fin'] = $k; }
                $lignes[] = ['cle' => $groups[$gi]['cle'], 'nom' => $l['nom'], 'fonction' => $l['fonction'], 'jours' => $l['jours']];
            }
            $mois[] = ['key' => $k, 'label' => Dates::monthLabel($k), 'onglet' => $byKey[$k]['onglet'], 'lignes' => $lignes];
        }
        $personnes = [];
        foreach ($groups as $g) {
            $best = null; foreach ($agents as $a) { $sc = self::similarity($g['nom'], $a['nom']); if (!$best || $sc > $best['score']) $best = ['id' => $a['id'], 'nom' => $a['nom'], 'score' => $sc]; }
            $inf = Archive::agentInfo($arch, $g['nom']);
            $personnes[] = ['cle' => $g['cle'], 'nom' => $g['nom'], 'variantes' => array_values(array_filter($g['variantes'], fn($v) => $v !== $g['nom'])), 'fonction' => $g['fonction'] ?: ($inf ? $inf['fonction'] : ''), 'info' => $inf ? ['contrat' => $inf['contrat'], 'rotation' => $inf['rotation'], 'affectation' => $inf['affectation'], 'type' => $inf['type']] : null, 'mois' => $g['mois'], 'jours' => $g['jours'], 'debut' => $g['debut'], 'fin' => $g['fin'], 'suggestion' => $best && $best['score'] >= 0.7 ? $best : null];
        }
        return ['fichier' => (string)($o['nom'] ?? ''), 'mois' => $mois, 'personnes' => $personnes, 'jours' => array_sum(array_map(fn($p) => $p['jours'], $personnes)), 'avertissements' => $warnings, 'premier' => $keys[0] ?? '', 'dernier' => $keys ? end($keys) : '', 'archive' => $arch];
    }
    private static function slug($s): string { $x = trim(preg_replace('/[^a-z0-9]+/', '.', self::norm($s)), '.'); return $x ?: 'agent'; }
    public static function appliquer(array $user, ?array $o): array {
        $o = $o ?? []; $mois = $o['mois'] ?? []; $choix = $o['choix'] ?? [];
        if (!$mois && empty($o['archive']['resume'])) throw httpErr('Rien à importer');
        $mode = ($o['mode'] ?? '') === 'remplacer' ? 'remplacer' : 'completer';
        $debut = Dates::isMonthKey($o['debut'] ?? null) ? $o['debut'] : ''; $fin = Dates::isMonthKey($o['fin'] ?? null) ? $o['fin'] : '';
        $dep = Archive::apply($o['archive'] ?? null, $o['reprendre'] ?? []);
        $all = Agents::list(); $ids = []; $crees = []; $infos = []; $identifiants = []; $avert = [];
        foreach ($mois as $m) foreach ($m['lignes'] as $l) { if (!isset($infos[$l['cle']])) $infos[$l['cle']] = ['nom' => $l['nom'], 'fonction' => $l['fonction']]; if ($l['fonction']) $infos[$l['cle']]['fonction'] = $l['fonction']; }
        foreach ($choix as $cle => $v) {
            if (!$v || !isset($infos[$cle])) continue;
            if ($v === '__new') {
                $nom = $infos[$cle]['nom']; $s = self::slug($nom); $email = 'import.' . $s . '@a-completer.invalid'; $k2 = 1;
                $exists = fn($e) => (bool)array_filter($all, fn($a) => mb_strtolower($a['email']) === mb_strtolower($e));
                while ($exists($email)) { $k2++; $email = 'import.' . $s . $k2 . '@a-completer.invalid'; }
                $inf = Archive::agentInfo($o['archive'] ?? null, $nom) ?: []; $vh = ($inf['type'] ?? '') === 'vehicule';
                $mail = !empty($inf['email']) && Format::validEmail($inf['email']) && !$exists($inf['email']) ? $inf['email'] : $email;
                try { $rot = Agents::normRotation($inf['rotation'] ?? ''); } catch (Throwable $e) { $rot = ''; }
                $base = ['nom' => $nom, 'email' => $mail, 'fonction' => ($inf['fonction'] ?? '') ?: $infos[$cle]['fonction'], 'role' => 'agent', 'type' => $vh ? 'vehicule' : 'personne', 'affectation' => $inf['affectation'] ?? '', 'rotation' => $rot, 'date_entree' => $inf['date_entree'] ?? ''];
                $contratOk = !empty($inf['contrat']) && (bool)array_filter(Contrats::contrats(), fn($c) => $c['numero'] === $inf['contrat']);
                try { $r = Agents::create($user, $base + ($contratOk ? ['contrat' => $inf['contrat']] : [])); }
                catch (Throwable $e) { if (!$contratOk) throw $e; $avert[] = $nom . ' : créé sans contrat (' . $e->getMessage() . ')'; $r = Agents::create($user, $base); }
                $all[] = $r['agent']; $ids[$cle] = $r['agent']['id']; $crees[] = $r['agent']['nom'];
                if (!$vh) $identifiants[] = ['nom' => $r['agent']['nom'], 'email' => $r['agent']['email'], 'password' => $r['password']];
            } elseif (array_filter($all, fn($a) => $a['id'] === $v && Agents::isPerson($a))) $ids[$cle] = $v;
            else throw httpErr('Agent introuvable pour ' . $infos[$cle]['nom']);
        }
        $lignes = [];
        foreach ($mois as $m) { if (($debut && $m['key'] < $debut) || ($fin && $m['key'] > $fin)) continue; $lignes[] = ['key' => $m['key'], 'lignes' => array_values(array_map(fn($l) => ['id' => $ids[$l['cle']], 'jours' => $l['jours']], array_filter($m['lignes'], fn($l) => isset($ids[$l['cle']]))))]; }
        $res = Pointage::importEntries($lignes, $mode);
        return ['jours_ecrits' => $res['ecrits'], 'jours_conserves' => $res['conserves'], 'mois' => $res['mois'], 'agents_crees' => $crees, 'agents_lies' => count($ids) - count($crees), 'dependances' => $dep, 'identifiants' => $identifiants, 'avertissements' => $avert];
    }
}
