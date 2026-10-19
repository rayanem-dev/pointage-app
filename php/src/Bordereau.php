<?php
/** Lecture du bordereau des prix du contrat (PDF / image par OCR, Excel, CSV) : lignes détectées et fonctions proposées. Rien n'est enregistré ici. */
final class Bordereau {
    const NUM = '\d{1,3}(?:[ \x{00a0}]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?';
    const VH = '~vehicule|\bvh\b|pick.?up|4 ?x ?4|camion|voiture|engin|minibus|\bbus\b|ambulance|fourgon|camionnette|\bmoto|tracteur|grue~u';
    const SKIP = '~^(total|montant total|sous.?total|arret|tva|ttc|t\.v\.a|net a payer|somme|fait a|lu et)~u';
    const HEADER_WORDS = '~designation|nombre|tarif|journalier|delai|mobilisation|montant|quantite|unite|prix|total|annexe|bordereau|arrete|^contrat\b|n°|\bpage\b|hors taxes|dinars|^\(?da\)?$|^\(?jours?\)?$|^\(?ht\)?$~u';

    private static function noAcc($s): string { return trim(preg_replace('/\s+/u', ' ', mb_strtolower(Format::stripAccents((string)($s ?? ''))))); }
    private static function clean($s): string { return trim(preg_replace('/\s+/u', ' ', str_replace(["\u{00a0}", "\u{202f}"], ' ', (string)($s ?? '')))); }
    public static function toNumber($v): float {
        $s = preg_replace('/\s/u', '', self::clean($v)); $s = preg_replace('/(da|dzd|dinars?)$/i', '', $s);
        if (!preg_match('/^-?[\d.,]+$/', $s)) return NAN;
        $dot = strpos($s, '.'); $com = strpos($s, ',');
        if ($dot !== false && $com !== false) $s = strrpos($s, ',') > strrpos($s, '.') ? str_replace(',', '.', str_replace('.', '', $s)) : str_replace(',', '', $s);
        elseif ($com !== false) $s = preg_match('/^\d{1,3}(,\d{3})+$/', $s) ? str_replace(',', '', $s) : str_replace(',', '.', $s);
        elseif ($dot !== false && preg_match('/^\d{1,3}(\.\d{3})+$/', $s)) $s = str_replace('.', '', $s);
        return is_numeric($s) ? (float)$s : NAN;
    }
    private static function classify($h): string {
        $t = self::noAcc($h); if ($t === '') return '';
        if (preg_match('~position|nbre.*poste|nombre.*poste|nb.*poste~', $t)) return 'positions';
        if (preg_match('~delai|duree|mobilisation~', $t)) return 'delai';
        if (preg_match('~prix|p\.? ?u\b|unitaire|tarif~', $t)) return 'prix';
        if (preg_match('~montant|total~', $t)) return 'montant';
        if (preg_match('~nombre|nbre|\bnb\b~', $t)) return 'nombre';
        if (preg_match('~quantite|qte|\bqt\b~', $t)) return 'quantite';
        if (preg_match('~^(u\.?/?m\.?|unite|u)$|unite~', $t)) return 'unite';
        if (preg_match('~designation|libelle|intitule|poste|fonction|description|prestation|nature|ressource~', $t)) return 'designation';
        return '';
    }
    private static function mapHeader(array $row): ?array {
        $map = []; $hits = 0;
        foreach ($row as $i => $c) { $k = self::classify($c); if ($k !== '' && !isset($map[$k])) { $map[$k] = $i; $hits++; } }
        return isset($map['designation']) && (isset($map['prix']) || isset($map['quantite']) || isset($map['positions']) || isset($map['nombre'])) && $hits >= 2 ? $map : null;
    }
    private static function rowFromMap(array $cells, array $map): ?array {
        $d = self::clean($cells[$map['designation']] ?? '');
        if (!preg_match('/[a-zà-ÿ]{3}/iu', $d) || preg_match(self::SKIP, self::noAcc($d))) return null;
        $num = fn($k) => isset($map[$k]) ? self::toNumber($cells[$map[$k]] ?? '') : NAN;
        $pos = $num('positions');
        return ['designation' => $d, 'unite' => isset($map['unite']) ? self::clean($cells[$map['unite']] ?? '') : '', 'quantite' => $num('quantite'), 'prix_unitaire' => $num('prix'), 'montant' => $num('montant'), 'positions' => $pos > 0 ? $pos : $num('nombre'), 'delai' => $num('delai'), 'mapped' => true];
    }
    private static function rowHeuristic(array $cells): ?array {
        $di = -1; foreach ($cells as $i => $c) if ($di < 0 && preg_match('/[a-zà-ÿ]{3}/iu', self::clean($c)) && is_nan(self::toNumber($c))) $di = $i;
        if ($di < 0) return null;
        $d = self::clean($cells[$di]); if (preg_match(self::SKIP, self::noAcc($d))) return null;
        $rest = array_slice($cells, $di + 1); $nums = array_values(array_filter(array_map([self::class, 'toNumber'], $rest), fn($n) => !is_nan($n)));
        if (!$nums) return null;
        $r = ['designation' => $d, 'unite' => '', 'quantite' => NAN, 'prix_unitaire' => NAN, 'montant' => NAN, 'positions' => NAN, 'delai' => NAN, 'mapped' => false];
        foreach ($rest as $c) if (preg_match('/^(jours?|j|mois|h|u|ens|forfait|unit[eé])$/iu', self::clean($c))) { $r['unite'] = self::clean($c); break; }
        if (count($nums) >= 4) { $t = [$nums[0], $nums[1], $nums[2]]; sort($t); if (abs($t[0] * $t[1] * $t[2] - $nums[3]) <= max(1, $nums[3] * 0.01)) { $r['positions'] = $t[0]; $r['delai'] = $t[1]; $r['prix_unitaire'] = $t[2]; $r['montant'] = $nums[3]; return $r; } }
        if (count($nums) >= 3 && abs($nums[0] * $nums[1] - $nums[2]) <= max(1, $nums[2] * 0.01)) { $r['quantite'] = $nums[0]; $r['prix_unitaire'] = $nums[1]; $r['montant'] = $nums[2]; }
        elseif (count($nums) >= 2) { $r['quantite'] = $nums[0]; $r['prix_unitaire'] = $nums[1]; }
        else $r['prix_unitaire'] = $nums[0];
        return $r;
    }
    public static function parseRows(array $rows): array {
        $out = []; $map = null;
        foreach ($rows as $cells) {
            $cells = array_map([self::class, 'clean'], $cells);
            if (!array_filter($cells, fn($c) => $c !== '')) continue;
            $header = self::mapHeader($cells); if ($header) { $map = $header; continue; }
            $r = $map ? self::rowFromMap($cells, $map) : self::rowHeuristic($cells);
            if ($r) $out[] = $r;
        }
        return $out;
    }
    private static function splitLine(string $l): ?array {
        $l = trim(str_replace(["\u{00a0}", "\u{202f}"], ' ', $l)); $l = preg_replace('/^\d{1,3}\s*[.)-]?\s+(?=[A-Za-zÀ-ÿ])/u', '', $l);
        if (!preg_match('/^([A-Za-zÀ-ÿ][^\d]*?)\s+(\d[\s\S]*)$/u', $l, $m)) return null;
        $unit = preg_match('/\b(jours?|mois|forfait|ens|u)\b/iu', $m[2], $u) ? $u[1] : null;
        preg_match_all('~' . self::NUM . '~u', $m[2], $nums);
        return array_merge([self::clean($m[1])], $unit ? [$unit] : [], $nums[0]);
    }
    public static function parseText($text): array {
        $rows = [];
        foreach (preg_split('/\r?\n/', (string)($text ?? '')) as $l) {
            $cells = array_values(array_filter(array_map([self::class, 'clean'], preg_split('/\t| {3,}/', $l)), fn($c) => $c !== ''));
            $row = count($cells) >= 3 ? $cells : (self::splitLine($l) ?: []); if ($row) $rows[] = $row;
        }
        return array_values(array_filter(self::parseRows($rows), fn($l) => $l['montant'] > 0));
    }
    public static function detectDelai($text): int { return preg_match('/(?:d[ée]lai|dur[ée]e|mobilisation)[^\d]{0,40}(\d{2,4})\s*(?:jours?|j\b)/iu', (string)($text ?? ''), $m) ? (int)$m[1] : 0; }

    private static function numberTokens(string $text): array {
        $out = []; if (!preg_match_all('~' . self::NUM . '~u', $text, $ms, PREG_OFFSET_CAPTURE)) return $out;
        foreach ($ms[0] as [$s, $pos]) { $v = self::toNumber($s); if (!is_nan($v)) $out[] = ['pos' => $pos, 'v' => $v]; }
        return $out;
    }
    private static function designationCandidates(string $text): array {
        $out = []; $offset = 0;
        foreach (explode("\n", $text) as $idx => $line) {
            $t = self::clean(preg_replace('/\b(jours?|da|dzd)\b/iu', ' ', preg_replace('~' . self::NUM . '~u', ' ', $line))); $t = preg_replace('/^[-–.:()|\s]+|[-–.:()|\s]+$/u', '', $t);
            $letters = preg_match_all('/[A-Za-zÀ-ÿ]/u', $t);
            if ($letters >= 3 && !preg_match(self::HEADER_WORDS, self::noAcc($t))) $out[] = ['pos' => $offset, 'text' => $t, 'line' => $idx];
            $offset += strlen($line) + 1;
        }
        return $out;
    }
    public static function solveText($text): array {
        $text = (string)($text ?? ''); $tokens = self::numberTokens($text);
        $small = array_values(array_filter($tokens, fn($t) => $t['v'] >= 1 && $t['v'] <= 200 && fmod($t['v'], 1) == 0.0));
        $days = array_values(array_filter($tokens, fn($t) => $t['v'] >= 20 && $t['v'] <= 3650 && fmod($t['v'], 1) == 0.0));
        $rows = [];
        foreach ($tokens as $m) {
            if (!($m['v'] >= 1000)) continue; $best = null;
            foreach ($small as $n) { if ($n['pos'] === $m['pos']) continue;
                foreach ($days as $d) { if ($d['pos'] === $n['pos'] || $d['pos'] === $m['pos']) continue;
                    $p = $m['v'] / ($n['v'] * $d['v']); if ($p < 100) continue;
                    foreach ($tokens as $pt) {
                        if ($pt['pos'] === $m['pos'] || $pt['pos'] === $n['pos'] || $pt['pos'] === $d['pos'] || abs($pt['v'] - $p) >= 0.01) continue;
                        $ps = [$n['pos'], $d['pos'], $pt['pos'], $m['pos']]; $span = max($ps) - min($ps);
                        if (!$best || $span < $best['span']) $best = ['n' => $n, 'd' => $d, 'p' => $pt, 'm' => $m, 'span' => $span];
                    } } }
            if ($best) $rows[] = $best;
        }
        usort($rows, fn($a, $b) => $a['m']['pos'] <=> $b['m']['pos']);
        if (!$rows) return [];
        $firstPos = fn($r) => min($r['n']['pos'], $r['d']['pos'], $r['p']['pos'], $r['m']['pos']); $lastPos = fn($r) => max($r['n']['pos'], $r['d']['pos'], $r['p']['pos'], $r['m']['pos']);
        $cands = self::designationCandidates($text);
        $interleaved = count($rows) === 1;
        if (!$interleaved) { $interleaved = true; for ($i = 1; $i < count($rows); $i++) { $ok = false; foreach ($cands as $c) if ($c['pos'] > $lastPos($rows[$i - 1]) && $c['pos'] < $firstPos($rows[$i])) { $ok = true; break; } if (!$ok) { $interleaved = false; break; } } }
        $names = [];
        if ($interleaved) {
            foreach ($rows as $i => $r) {
                $gap = array_values(array_filter($cands, fn($c) => $c['pos'] > ($i ? $lastPos($rows[$i - 1]) : -1) && $c['pos'] < $firstPos($r)));
                $k = count($gap) - 1; $name = $k >= 0 ? $gap[$k]['text'] : '';
                while ($k > 0 && preg_match('/^[a-zà-ÿ]/u', $name) && $gap[$k - 1]['line'] === $gap[$k]['line'] - 1) { $k--; $name = $gap[$k]['text'] . ' ' . $name; }
                $names[] = $name;
            }
        } else {
            $minFirst = min(array_map($firstPos, $rows)); $before = array_values(array_filter($cands, fn($c) => $c['pos'] < $minFirst));
            $pick = array_slice($before, max(0, count($before) - count($rows)));
            foreach ($rows as $i => $r) $names[] = count($pick) === count($rows) ? $pick[$i]['text'] : '';
        }
        return array_map(fn($r, $i) => ['designation' => ($names[$i] ?? '') ?: '(à compléter)', 'unite' => 'Jour', 'quantite' => NAN, 'prix_unitaire' => $r['p']['v'], 'montant' => $r['m']['v'], 'positions' => $r['n']['v'], 'delai' => $r['d']['v'], 'mapped' => true, 'incertaine' => ($names[$i] ?? '') === ''], $rows, array_keys($rows));
    }
    public static function toFonctions(array $lines, $delai): array {
        return array_map(function ($r) use ($delai) {
            $d = $r['delai'] > 0 ? $r['delai'] : ((float)$delai > 0 ? (float)$delai : 0); $positions = NAN;
            if ($r['positions'] > 0) $positions = $r['positions'];
            elseif ($d > 0 && $r['prix_unitaire'] > 0 && $r['montant'] > 0) { $p = $r['montant'] / ($r['prix_unitaire'] * $d); if (abs($p - round($p)) < 0.01 && round($p) >= 1) $positions = round($p); }
            if (!($positions > 0) && $r['quantite'] > 0) $positions = $d > 0 ? ($r['quantite'] >= $d ? $r['quantite'] / $d : $r['quantite']) : ($r['quantite'] <= 100 ? $r['quantite'] : NAN);
            $posOk = is_finite($positions) && $positions > 0;
            $coherent = !($posOk && $d > 0 && $r['prix_unitaire'] > 0 && $r['montant'] > 0) || abs($positions * $d * $r['prix_unitaire'] - $r['montant']) <= max(1, $r['montant'] * 0.01);
            $nan = fn($x) => is_nan($x);
            return ['designation' => $r['designation'], 'libelle' => $r['designation'], 'nature' => preg_match(self::VH, self::noAcc($r['designation'])) ? 'vehicule' : 'personne', 'unite' => $r['unite'] ?: 'Jour', 'positions' => $posOk ? Format::num(round($positions * 100) / 100) : 1, 'delai' => $d ? Format::num($d) : '',
                'quantite_contrat' => $posOk && $d ? Format::num($positions * $d) : '', 'prix_unitaire' => $nan($r['prix_unitaire']) ? 0 : Format::num($r['prix_unitaire']), 'montant' => $nan($r['montant']) ? '' : Format::num($r['montant']),
                'fiable' => (bool)($r['prix_unitaire'] > 0 && $posOk && fmod($positions, 1) == 0.0 && $coherent && ($r['mapped'] || $r['montant'] > 0) && empty($r['incertaine']))];
        }, $lines);
    }
    public static function detectNumero($text): string {
        if (!preg_match('/contrat[^\n]{0,60}?N\s*[°ºo]\s*([A-Z0-9][A-Z0-9 \/.-]{3,40})/iu', (string)($text ?? ''), $m)) return '';
        $x = preg_replace('/\s*\/\s*/', '/', self::clean($m[1])); $x = preg_replace('/\s+(?=[A-Z]+-)/', '', $x); return preg_replace('/[.\s-]+$/', '', $x);
    }
    public static function detectParties($text): array {
        $lines = array_values(array_filter(array_map([self::class, 'clean'], preg_split('/\r?\n/', (string)($text ?? ''))), fn($l) => $l !== ''));
        $out = ['prestataire' => '', 'client' => ''];
        $legal = '/\b((?:SARL|SPA|EURL|SNC|SAS|EPE|ETS)\s+[A-Z0-9][A-Z0-9&.\'-]*(?:\s+[A-Z0-9][A-Z0-9&.\'-]*){0,2}?)(?=\s+N\s*[°ºo]|\s*$|\s*[,;(])/iu';
        $cl = null; foreach ($lines as $l) if (preg_match('/contrat/i', $l)) { $cl = $l; break; }
        if (preg_match($legal, $cl ?? '', $m) || preg_match($legal, implode("\n", array_slice($lines, 0, 12)), $m)) $out['prestataire'] = mb_strtoupper(self::clean($m[1]));
        if (preg_match('/^(?:client|maitre d\'ouvrage|maître d\'ouvrage)\s*[:\-]\s*(.{2,60})$/imu', implode("\n", $lines), $m)) $out['client'] = mb_strtoupper(self::clean($m[1]));
        else {
            $ci = -1; foreach ($lines as $i => $l) if ($ci < 0 && preg_match('/contrat/i', $l)) $ci = $i;
            $head = array_values(array_filter(array_slice($lines, 0, $ci < 0 ? 4 : $ci), fn($l) => preg_match('/^[A-Za-zÀ-ÿ\'. -]{3,40}$/u', $l) && count(explode(' ', $l)) <= 3 && !preg_match('/bordereau|annexe|prix|total|contrat/i', $l)));
            if ($head) $out['client'] = mb_strtoupper(end($head));
        }
        return $out;
    }
    public static function detectTotal($text): float {
        $t = (string)($text ?? '');
        $n = '(\d{1,3}(?:[ \x{00a0}]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)';
        if (preg_match('/total[^\d]{0,40}?' . $n . '/iu', $t, $m) || preg_match('/\(\s*(\d{1,3}(?:[ \x{00a0}]\d{3})+(?:[.,]\d+)?)\s*(?:DA|DZD)\s*\)/iu', $t, $m)) return self::toNumber($m[1]);
        return NAN;
    }
    /** @return array{rows: array, text: string} */
    private static function readFile(array $o): array {
        $name = (string)($o['nom'] ?? 'bordereau'); $ext = preg_match('/\.([a-z0-9]+)$/i', $name, $m) ? strtolower($m[1]) : '';
        $bytes = base64_decode((string)($o['base64'] ?? ''), true);
        if ($bytes === false || $bytes === '') throw httpErr('Fichier vide');
        if (strlen($bytes) > CFG()['MAX_UPLOAD_BYTES']) throw httpErr('Fichier trop volumineux (10 Mo maximum)');
        if ($ext === 'csv' || $ext === 'txt') { $text = mb_convert_encoding($bytes, 'UTF-8', 'UTF-8, Windows-1252'); $sep = strpos($text, ';') !== false ? ';' : (strpos($text, "\t") !== false ? "\t" : ','); return ['rows' => array_map(fn($l) => explode($sep, $l), preg_split('/\r?\n/', $text)), 'text' => $text]; }
        if ($ext === 'xlsx') { $rows = []; foreach (XlsxReader::sheets($bytes) as $s) $rows = array_merge($rows, $s['rows']); return ['rows' => $rows, 'text' => implode("\n", array_map(fn($r) => implode(' ', $r), $rows))]; }
        if ($ext === 'xls') throw httpErr('Ancien format Excel (.xls) : enregistrez le fichier au format .xlsx ou CSV');
        if (!in_array($ext, ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff'], true)) throw httpErr('Format non pris en charge (PDF, image, Excel ou CSV)');
        try { $text = Ocr::text($bytes, $ext); } catch (Throwable $e) { throw httpErr('Lecture du document impossible : ' . $e->getMessage() . '. Déposez plutôt un fichier Excel ou CSV, ou saisissez les lignes à la main.'); }
        return ['rows' => array_map(fn($l) => preg_split('/\t| {3,}/', $l), preg_split('/\r?\n/', $text)), 'text' => $text];
    }
    public static function matchContrat($numero): string {
        if (!$numero) return '';
        $loose = fn($x) => preg_replace('/\s+/', '', str_replace(['0'], ['O'], preg_replace('/[IL1|]/', 'I', strtoupper((string)$x))));
        foreach (Contrats::contrats() as $c) if ($loose($c['numero']) === $loose($numero)) return $c['numero'];
        return $numero;
    }
    public static function analyser(?array $o): array {
        $o = $o ?? []; $doc = self::readFile($o); $lines = self::parseRows($doc['rows']); $source = 'tableau';
        if (!$lines) { $byLine = self::parseText($doc['text']); $bySolver = self::solveText($doc['text']); $lines = count($bySolver) >= count($byLine) ? $bySolver : $byLine; $source = 'texte'; }
        $detecte = self::detectDelai($doc['text']); $existing = null; foreach (Contrats::fonctions() as $f) if ((float)$f['delai'] > 0) { $existing = $f; break; }
        $delai = (float)($o['delai'] ?? 0) > 0 ? (float)$o['delai'] : ($detecte ?: ($existing ? (float)$existing['delai'] : 0));
        $fonctions = self::toFonctions($lines, $delai); $somme = 0;
        foreach ($fonctions as $f) $somme += $f['montant'] !== '' && $f['montant'] > 0 ? $f['montant'] : $f['positions'] * ($f['delai'] ?: 0) * $f['prix_unitaire'];
        $total = self::detectTotal($doc['text']);
        return ['lignes' => $fonctions, 'delai' => Format::num($delai), 'delai_detecte' => $detecte, 'source' => $source, 'numero_detecte' => self::matchContrat(self::detectNumero($doc['text'])), 'parties' => self::detectParties($doc['text']),
            'total_detecte' => is_nan($total) ? '' : Format::num($total), 'total_calcule' => Format::num($somme), 'total_ok' => !is_nan($total) && abs($total - $somme) <= max(1, $total * 0.001),
            'apercu' => mb_substr(preg_replace('/[ \t]+/', ' ', (string)$doc['text']), 0, 2500)];
    }
}
