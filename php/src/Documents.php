<?php
/**
 * Documents déposés dans le compte d'un agent (fiches de paie, titres de congé, contrats, attestations…).
 * Le type, l'agent et les dates sont reconnus (nom du fichier, sinon contenu si pdftotext/tesseract sont installés), puis le fichier est renommé selon des règles fixes.
 * Dépôt en vrac : les fichiers sont d'abord « en attente » avec une proposition ; rien n'est envoyé aux agents avant validation.
 */
final class Documents {
    const CODES = ['titre_conge' => 'TC', 'fiche_emolument' => 'FDP', 'contrat' => 'CONTRAT', 'attestation_cnas' => 'ACNAS', 'maj_cnas' => 'MAJCNAS', 'attestation_travail' => 'AT', 'certificat_travail' => 'CT', 'attestation_emoluments' => 'AE', 'ats' => 'ATS', 'autre' => 'DOC'];
    const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
    const MOIS_AFF = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
    const MOIS_RE = '\b(janvier|janv|jan|fevrier|fevr|fev|mars|mar|avril|avr|mai|juin|juillet|juil|aout|aou|septembre|sept|sep|octobre|oct|novembre|nov|decembre|dec)\b\.?';
    const ANNEE_RE = '(20\d{2}|\d{2})(?!\d)';
    const ALIAS = ['jan' => 1, 'janv' => 1, 'janvier' => 1, 'fev' => 2, 'fevr' => 2, 'fevrier' => 2, 'mar' => 3, 'mars' => 3, 'avr' => 4, 'avril' => 4, 'mai' => 5, 'juin' => 6, 'juil' => 7, 'juillet' => 7, 'aou' => 8, 'aout' => 8, 'sep' => 9, 'sept' => 9, 'septembre' => 9, 'oct' => 10, 'octobre' => 10, 'nov' => 11, 'novembre' => 11, 'dec' => 12, 'decembre' => 12];
    const REQUIS = ['titre_conge' => ['date'], 'fiche_emolument' => ['mois'], 'contrat' => ['date'], 'attestation_cnas' => ['date'], 'maj_cnas' => ['mois', 'mois2'], 'attestation_travail' => ['date'], 'certificat_travail' => ['date'], 'attestation_emoluments' => ['mois', 'mois2'], 'ats' => ['date'], 'autre' => []];
    const DEPOT_JOURS = 3;

    private static function an4($y): string { return strlen((string)$y) === 2 ? '20' . $y : (string)$y; }
    private static function n($s): string { return mb_scrub(Format::norm($s)); }
    private static function label(array $a): string { return preg_replace_callback('/(^|[\s\'-])([a-zà-ÿ])/u', fn($m) => $m[1] . mb_strtoupper($m[2]), mb_strtolower(trim((string)($a['nom'] ?? '')))); }

    // ----- dates et mois -----
    private static function isoOf($d, $m, $y): string { $iso = $y . '-' . ((int)$m < 10 ? '0' : '') . (int)$m . '-' . ((int)$d < 10 ? '0' : '') . (int)$d; return Dates::isDate($iso) ? $iso : ''; }
    private static function moisKey($m, $y): string { return self::MOIS[(int)$m - 1] . $y; }
    private static function moisLabel($k): string { if (!preg_match('/^([a-z]+)(20\d{2})$/', (string)($k ?? ''), $m)) return ''; $i = array_search($m[1], self::MOIS, true); return $i === false ? '' : self::MOIS_AFF[$i] . $m[2]; }
    private static function allDates(string $t): array {
        $out = [];
        $re = '~(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(20\d{2})|(20\d{2})-(\d{2})-(\d{2})|(\d{1,2})(?:er)?\s+' . self::MOIS_RE . '\s+(20\d{2})~u';
        if (!preg_match_all($re, $t, $ms, PREG_SET_ORDER | PREG_OFFSET_CAPTURE | PREG_UNMATCHED_AS_NULL)) return $out;
        foreach ($ms as $m) {
            $g = fn($i) => $m[$i][0] ?? null;
            $iso = $g(1) !== null ? self::isoOf($g(1), $g(2), $g(3)) : ($g(4) !== null ? self::isoOf($g(6), $g(5), $g(4)) : self::isoOf($g(7), self::ALIAS[$g(8)] ?? 0, self::an4($g(9))));
            if ($iso !== '') $out[] = ['iso' => $iso, 'i' => $m[0][1], 'len' => strlen($m[0][0])];
        }
        return $out;
    }
    private static function dateAfter(string $t, string $re): string {
        if (!preg_match($re, $t, $m, PREG_OFFSET_CAPTURE)) return '';
        $rest = substr($t, $m[0][1] + strlen($m[0][0]), 40); $d = self::allDates($rest)[0] ?? null;
        return $d && $d['i'] < 25 ? $d['iso'] : '';
    }
    private static function moisOfIso($iso): string { return $iso ? self::moisKey(substr($iso, 5, 2), substr($iso, 0, 4)) : ''; }
    private static function mk($nom, $an): string { return self::MOIS[self::ALIAS[$nom] - 1] . self::an4($an); }
    private static function moisRange(string $t): array {
        $ds = self::allDates($t);
        for ($i = 0; $i + 1 < count($ds); $i++) {
            $between = substr($t, $ds[$i]['i'] + $ds[$i]['len'], $ds[$i + 1]['i'] - ($ds[$i]['i'] + $ds[$i]['len']));
            if (preg_match('/^\s*(au|a|-|jusqu\s?au|jusqu a)\s*$/', $between) && $ds[$i + 1]['iso'] >= $ds[$i]['iso']) return ['mois' => self::moisOfIso($ds[$i]['iso']), 'mois2' => self::moisOfIso($ds[$i + 1]['iso'])];
        }
        if (preg_match('~' . self::MOIS_RE . '\s*(?:' . self::ANNEE_RE . ')?\s*(?:a|au|-|jusqu a|jusqu au|et)\s*' . self::MOIS_RE . '\s*' . self::ANNEE_RE . '~u', $t, $r)) return ['mois' => self::mk($r[1], ($r[2] ?? '') ?: $r[4]), 'mois2' => self::mk($r[3], $r[4])];
        if (preg_match('~\b(0?[1-9]|1[0-2])\s*[/.\-]\s*(20\d{2})\s*(?:a|au|-)\s*(0?[1-9]|1[0-2])\s*[/.\-]\s*(20\d{2})\b~', $t, $s2)) return ['mois' => self::moisKey($s2[1], $s2[2]), 'mois2' => self::moisKey($s2[3], $s2[4])];
        $one = self::moisSeul($t);
        return $one !== '' ? ['mois' => $one, 'mois2' => $one] : ['mois' => '', 'mois2' => ''];
    }
    private static function moisSeul(string $t): string {
        if (preg_match('~(?:periode|mois d[eu]|mois|paie d[eu]|au titre d[eu])[^a-z0-9]{0,8}(?:d[eu]\s*)?' . self::MOIS_RE . '\s*[-_/.]?\s*' . self::ANNEE_RE . '~u', $t, $c)) return self::mk($c[1], $c[2]);
        $all = [];
        if (preg_match_all('~' . self::MOIS_RE . '\s*(?:d[eu]\s*)?[-_/.]?\s*' . self::ANNEE_RE . '~u', $t, $ms, PREG_SET_ORDER)) foreach ($ms as $m) $all[] = self::mk($m[1], $m[2]);
        $sans = preg_replace('~\d{1,2}\s*[/.\-]\s*\d{1,2}\s*[/.\-]\s*20\d{2}~', ' ', $t);
        if (preg_match_all('~\b(0?[1-9]|1[0-2])\s*[/.\-]\s*(20\d{2})\b~', $sans, $m2, PREG_SET_ORDER)) foreach ($m2 as $m) $all[] = self::moisKey($m[1], $m[2]);
        if (!$all) { $d = self::allDates($t)[0] ?? null; return $d ? self::moisOfIso($d['iso']) : ''; }
        $rang = function ($k) { preg_match('/^([a-z]+)(20\d{2})$/', $k, $x); return (int)$x[2] * 12 + array_search($x[1], self::MOIS, true); };
        usort($all, fn($p, $q) => $rang($q) <=> $rang($p));
        return $all[0];
    }
    private static function nssOf(string $t): string {
        $digits = '';
        if (preg_match('~(?:immatriculation|securite sociale|n[°o]?\s*ss\b|nss|assure social|n[°o]\s*d.?assure)[^0-9]{0,40}(\d[\d\s]{8,16}\d)~u', $t, $m)) $digits = preg_replace('/\s+/', '', $m[1]);
        if (strlen($digits) >= 9 && strlen($digits) <= 14) return $digits;
        if (preg_match('~\b(\d{10,12})\b~', preg_replace('~(\d)\s(?=\d{3}\b)~', '$1', $t), $any)) return $any[1];
        return '';
    }

    // ----- reconnaissance du type et des champs (t : texte normalisé) -----
    public static function detectType(string $t): string {
        if (preg_match('~\bats\b|attestation de travail et de salaire~', $t)) return 'ats';
        if (preg_match('~titre de conge|titre.?conge|\btc\b~', $t)) return 'titre_conge';
        if (preg_match('~(mise a jour|\bmaj\b).{0,40}(cnas|assurances? sociales?|affiliation)|(cnas|affiliation).{0,40}(mise a jour|\bmaj\b)~', $t)) return 'maj_cnas';
        if (preg_match('~attestation d.?affiliation|attestation.{0,10}cnas|\bcnas\b|caisse nationale des assurances sociales~', $t)) return 'attestation_cnas';
        if (preg_match('~attestations? (?:d|des|de)[^a-z]{0,3}emoluments?|attestations? de salaire~', $t)) return 'attestation_emoluments';
        if (preg_match('~fiche de paie|bulletin de paie|bulletin de salaire|fiche de salaire|fiche d.?emoluments?|\bfdp\b~', $t)) return 'fiche_emolument';
        if (preg_match('~certificat de travail~', $t)) return 'certificat_travail';
        if (preg_match('~attestation de travail~', $t)) return 'attestation_travail';
        if (preg_match('~contrat de travail|contrat a duree|\bcontrat\b~', $t)) return 'contrat';
        return '';
    }
    public static function extract(string $type, string $t): array {
        $f = ['date' => '', 'mois' => '', 'mois2' => '', 'nss' => '']; $first = self::allDates($t)[0]['iso'] ?? '';
        if ($type === 'titre_conge') $f['date'] = self::dateAfter($t, '~(a compter du|a partir du|depart le|debut(?: du conge)?\s*:?|du)\s*~') ?: $first;
        elseif ($type === 'contrat') $f['date'] = self::dateAfter($t, '~(a compter du|prenant effet le|debut(?:ant)? le|date d.?effet|effet le|du)\s*~') ?: $first;
        elseif ($type === 'attestation_travail') $f['date'] = self::dateAfter($t, '~(fait a [a-z ]{2,30},? le|delivree? le|etablie? le|alger,? le|le)\s*~') ?: $first;
        elseif ($type === 'attestation_cnas') { $f['date'] = self::dateAfter($t, '~(fait a [a-z ]{2,30},? le|delivree? le|etablie? le|edition le|date d.?edition|le)\s*~') ?: $first; $f['nss'] = self::nssOf($t); }
        elseif ($type === 'ats') $f['date'] = $first;
        elseif ($type === 'fiche_emolument') $f['mois'] = self::moisSeul($t);
        elseif ($type === 'maj_cnas' || $type === 'attestation_emoluments') { $r = self::moisRange($t); $f['mois'] = $r['mois']; $f['mois2'] = $r['mois2']; }
        return $f;
    }
    private static function missing(string $type, array $f): array { return array_values(array_filter(self::REQUIS[$type] ?? [], fn($k) => empty($f[$k]))); }
    private static function merge(array $a, array $b): array { $o = []; foreach (['date', 'mois', 'mois2', 'nss'] as $k) $o[$k] = ($a[$k] ?? '') ?: (($b[$k] ?? '') ?: ''); return $o; }
    private static function adapt(string $type, array $f): array {
        $o = self::merge($f, []);
        if ($o['mois'] === '' && $o['date'] !== '') $o['mois'] = self::moisOfIso($o['date']);
        if ($o['mois2'] === '') $o['mois2'] = $o['mois'];
        if ($o['date'] === '' && $o['mois'] !== '' && preg_match('/^([a-z]+)(20\d{2})$/', $o['mois'], $m)) $o['date'] = self::isoOf(1, array_search($m[1], self::MOIS, true) + 1, $m[2]);
        return $o;
    }

    // ----- nom final : NOM_Prenom et règles par type -----
    private static function whoOf(array $a): string {
        $toks = preg_split('/\s+/', trim(Format::stripAccents($a['nom'] ?: 'agent')), -1, PREG_SPLIT_NO_EMPTY);
        $nom = mb_strtoupper(array_shift($toks) ?: 'AGENT');
        $pre = implode('-', array_map(fn($x) => mb_strtoupper(mb_substr($x, 0, 1)) . mb_strtolower(mb_substr($x, 1)), $toks));
        return preg_replace('/[^A-Za-z0-9_-]/', '', $nom . ($pre !== '' ? '_' . $pre : ''));
    }
    private static function stemOf($nom): string { $s = preg_replace('/\.[a-z0-9]+$/i', '', (string)($nom ?? '')); $s = preg_replace('/[^A-Za-z0-9À-ÿ]+/u', '-', $s); return mb_substr(preg_replace('/^-+|-+$/u', '', $s), 0, 40); }
    private static function extOf($nom): string { return preg_match('/\.([a-z0-9]{1,8})$/i', (string)($nom ?? ''), $m) ? strtolower($m[1]) : ''; }
    public static function nameFor(string $type, array $agent, array $f, ?string $stem): string {
        $who = self::whoOf($agent); $today = Dates::today();
        $date = ($f['date'] ?? '') ?: $today; $m1 = self::moisLabel($f['mois'] ?? '') ?: self::moisLabel(self::moisOfIso($today)); $m2 = self::moisLabel($f['mois2'] ?? '') ?: $m1;
        switch ($type) {
            case 'titre_conge': return 'TC_' . $who . '_' . $date;
            case 'fiche_emolument': return $who . '_FDP_' . $m1;
            case 'contrat': return $who . '_' . $date . '_Contrat';
            case 'attestation_cnas': return $who . '_AttestationCNAS_' . (!empty($f['nss']) ? $f['nss'] . '_' : '') . $date;
            case 'maj_cnas': return $who . '_MAJCNAS_' . $m1 . '_' . $m2;
            case 'attestation_travail': return $who . '_AttestationTravail_' . $date;
            case 'certificat_travail': return $who . '_CertificatTravail_' . $date;
            case 'attestation_emoluments': return $who . '_AttestationEmoluments_' . $m1 . '_' . $m2;
            case 'ats': return $who . '_ATS_' . $date;
            default: return $who . '_' . ($stem ?: 'Document');
        }
    }
    public static function fileName(string $type, array $agent, array $f, $ext, ?string $stem): string { return self::nameFor($type, $agent, $f, $stem) . ($ext ? '.' . $ext : ''); }
    private static function periodeOf(string $type, array $f): string {
        if ($type === 'fiche_emolument') return self::moisLabel($f['mois'] ?? '');
        if ($type === 'maj_cnas' || $type === 'attestation_emoluments') return self::moisLabel($f['mois'] ?? '') . (!empty($f['mois2']) && $f['mois2'] !== ($f['mois'] ?? '') ? ' → ' . self::moisLabel($f['mois2']) : '');
        if ($type === 'attestation_cnas') return (!empty($f['nss']) ? $f['nss'] . ' · ' : '') . ($f['date'] ?? '');
        return $f['date'] ?? '';
    }
    private static function uniqueName(string $agentId, string $name): string {
        $ext = self::extOf($name); $base = $ext !== '' ? substr($name, 0, -(strlen($ext) + 1)) : $name; $k = 1; $cur = $name;
        $used = []; foreach (Store::readTable('Documents') as $d) if ($d['agent_id'] === $agentId) $used[$d['nom_original']] = 1;
        while (isset($used[$cur])) { $k++; $cur = $base . '_' . $k . ($ext !== '' ? '.' . $ext : ''); }
        return $cur;
    }
    private static function parsePeriode(string $type, $text): array {
        $f = self::extract($type, self::n($text));
        if ($type === 'fiche_emolument' && $f['mois'] === '') throw httpErr('Période : indiquez un mois et une année (ex. mars 2026 ou 03/2026)');
        if (($type === 'maj_cnas' || $type === 'attestation_emoluments') && !($f['mois'] && $f['mois2'])) throw httpErr('Période : indiquez deux mois (ex. janvier 2026 à mars 2026)');
        if (in_array('date', self::REQUIS[$type] ?? [], true) && $f['date'] === '') throw httpErr('Date : jj/mm/aaaa');
        return $f;
    }

    // ----- reconnaissance de l'agent concerné -----
    /** @return array{0: array, 1: bool} [agents proposés, orthographe approchée] */
    private static function findAgents(string $t, array $agents): array {
        $words = []; foreach (preg_split('/[^a-z0-9]+/', $t) as $w) if ($w !== '') $words[$w] = true;
        $scored = [];
        foreach ($agents as $a) {
            $toks = array_values(array_filter(explode(' ', self::n($a['nom'])), fn($x) => strlen($x) >= 2));
            $hit = count(array_filter($toks, fn($x) => isset($words[$x])));
            if ($hit > 0 && $hit === count($toks) && count($toks) >= 2) $scored[] = $a;
        }
        $ids = array_map(fn($a) => $a['id'], $scored);
        $partial = array_values(array_filter($agents, function ($a) use ($words, $ids) { $toks = explode(' ', self::n($a['nom'])); return count($toks) >= 2 && isset($words[$toks[0]]) && !in_array($a['id'], $ids, true); }));
        $res = $scored ?: $partial;
        if ($res) return [$res, false];
        $mots = array_values(array_filter(array_keys($words), fn($w) => strlen((string)$w) >= 4 && !preg_match('/^\d+$/', (string)$w)));
        $flou = array_values(array_filter($agents, function ($a) use ($mots) { foreach (explode(' ', self::n($a['nom'])) as $tok) { if (strlen($tok) < 4) continue; foreach ($mots as $w) if ($w !== $tok && levenshtein($tok, (string)$w) <= (strlen($tok) >= 7 ? 2 : 1)) return true; } return false; }));
        return [$flou, true];
    }
    private static function detect(array $data, string $chosen, ?array $agent, ?array $agents): array {
        $base = str_replace('_', ' ', preg_replace('/\.[a-z0-9]+$/i', '', (string)($data['nom'] ?? '')));
        $tn = self::n($base); $type = $chosen ?: self::detectType($tn); $source = $chosen ? 'choix' : ($type ? 'nom' : '');
        $f = $type ? self::extract($type, $tn) : ['date' => '', 'mois' => '', 'mois2' => '', 'nss' => ''];
        [$cands, $flou] = $agent ? [[$agent], false] : self::findAgents($tn, $agents ?? []); $avert = [];
        $besoin = !$type || count(self::missing($type, $f)) > 0 || (!$agent && count($cands) !== 1);
        if ($besoin) {
            $text = '';
            try { $text = mb_substr(self::n(Ocr::text((string)$data['_bytes'], self::extOf($data['nom'] ?? ''))), 0, 12000); } catch (Throwable $e) { $avert[] = 'Lecture automatique impossible (' . $e->getMessage() . ').'; }
            if ($text !== '') {
                if (!$type) { $tt = self::detectType($text); if ($tt) { $type = $tt; $source = 'contenu'; } }
                if ($type) { $avant = self::merge($f, []); $f = self::merge($f, self::extract($type, $text)); foreach (['date', 'mois', 'mois2'] as $k) if ($f[$k] && !$avant[$k]) { $avert[] = 'Dates lues dans le contenu du document : à vérifier.'; break; } }
                if (!$agent && count($cands) !== 1) { [$byText] = self::findAgents($text, $agents ?? []); if ($byText) { $cands = $byText; $flou = false; } }
                if ($agent) {
                    foreach (($agents ?? Agents::list()) as $x) if ($x['id'] !== $agent['id'] && Agents::isPerson($x) && strpos(self::n($x['nom']), ' ') > 0 && strpos($text, self::n($x['nom'])) !== false) { if (strpos($text, self::n($agent['nom'])) === false) $avert[] = 'Ce document semble concerner ' . $x['nom'] . ', pas ' . $agent['nom'] . '.'; break; }
                }
            }
        }
        if (!$type) { $type = 'autre'; $source = 'defaut'; $avert[] = 'Type non reconnu : classé « Autre » (corrigeable).'; }
        $manque = self::missing($type, $f);
        if ($manque) $avert[] = 'À compléter : ' . implode(', ', array_map(fn($k) => ['date' => 'date', 'mois' => 'mois', 'mois2' => 'mois de fin'][$k] ?? $k, $manque)) . '.';
        if ($type === 'attestation_cnas' && $f['nss'] === '') $avert[] = 'N° de sécurité sociale non lu : à compléter si besoin.';
        return ['type' => $type, 'source' => $source, 'champs' => $f, 'avertissement' => implode(' ', $avert), 'candidats' => $cands, 'flou' => $flou];
    }

    // ----- API -----
    private static function canSee(array $user, $agentId): bool { if ($user['role'] === 'admin' || $user['id'] === $agentId) return true; foreach (Agents::visibleTo($user) as $a) if ($a['id'] === $agentId) return true; return false; }
    private static function pub(array $d): array { unset($d['file_id'], $d['champs'], $d['empreinte']); return $d; }
    public static function list(array $user, $agentId = null): array {
        $agentId = $agentId ?: $user['id'];
        if (!self::canSee($user, $agentId)) throw httpErr('Accès refusé', 'FORBIDDEN');
        $l = array_values(array_filter(Store::readTable('Documents'), fn($d) => $d['agent_id'] === $agentId));
        usort($l, fn($a, $b) => strcmp($b['date'], $a['date']));
        return array_map([self::class, 'pub'], $l);
    }
    const MIME_OK = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp', 'bmp' => 'image/bmp'];
    /** Type déduit de l'extension : celui annoncé par le navigateur n'est jamais retenu. */
    private static function mimeOf($ext): string { return self::MIME_OK[strtolower((string)$ext)] ?? 'application/octet-stream'; }
    private static function readBytes(array $data): string {
        if (empty($data['base64']) || empty($data['nom'])) throw httpErr('Fichier manquant');
        $b = base64_decode((string)$data['base64'], true);
        if ($b === false) throw httpErr('Fichier manquant');
        if (strlen($b) > CFG()['MAX_UPLOAD_BYTES']) throw httpErr('Fichier trop volumineux (10 Mo maximum)');
        return $b;
    }
    private static function maybePdf(array $data, string $bytes): array {
        $ext = self::extOf($data['nom']); $motif = '';
        if (!empty($data['pdf']) && in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'bmp'], true)) {
            try { $pdf = Pdf::fromImage($bytes); if ($pdf !== null) return ['bytes' => $pdf, 'mime' => 'application/pdf', 'ext' => 'pdf', 'converti' => true]; $motif = "format d'image non géré"; } catch (Throwable $e) { $motif = $e->getMessage(); }
            return ['bytes' => $bytes, 'mime' => self::mimeOf($ext), 'ext' => $ext, 'converti' => false, 'echec' => $motif ?: 'conversion indisponible'];
        }
        return ['bytes' => $bytes, 'mime' => self::mimeOf($ext), 'ext' => $ext, 'converti' => false];
    }
    private static function hashOf(string $bytes): string { return hash('sha256', $bytes); }
    private static function docRow(array $user, array $agent, string $type, array $f, string $name, string $fileId, ?string $empreinte): array {
        return ['id' => newId('G'), 'agent_id' => $agent['id'], 'type' => $type, 'titre' => preg_replace('/\.[a-z0-9]{1,8}$/i', '', $name), 'file_id' => $fileId, 'nom_original' => $name, 'depose_par' => $user['nom'], 'date' => nowIso(), 'code' => self::CODES[$type] ?? '', 'periode' => self::periodeOf($type, $f), 'dossier' => 'Documents/' . self::label($agent), 'champs' => json_encode($f, JSON_UNESCAPED_UNICODE), 'empreinte' => $empreinte ?: '', 'nouveau' => '1'];
    }
    public static function upload(array $user, ?array $data): array {
        $data = $data ?? [];
        if ($user['role'] === 'agent') throw httpErr('Accès refusé', 'FORBIDDEN');
        $ok = false; foreach (Agents::visibleTo($user) as $a) if ($a['id'] === ($data['agent_id'] ?? '')) $ok = true;
        if (!$ok) throw httpErr("Cet agent n'est pas dans votre groupe", 'FORBIDDEN');
        $agent = Agents::get($data['agent_id']);
        if ($agent && $agent['type'] === 'vehicule') throw httpErr("Un véhicule n'a pas de dossier de documents");
        $chosen = isset(CFG()['TYPES_DOC'][$data['type'] ?? '']) ? $data['type'] : '';
        if (!empty($data['type']) && $data['type'] !== 'auto' && !isset(CFG()['TYPES_DOC'][$data['type']])) throw httpErr('Type de document invalide');
        $bytes = self::readBytes($data); $data['_bytes'] = $bytes;
        $info = self::detect($data, $chosen, $agent, null);
        $conv = self::maybePdf($data, $bytes);
        $name = self::uniqueName($agent['id'], self::fileName($info['type'], $agent, $info['champs'], $conv['ext'], self::stemOf($data['nom'])));
        $fileId = Files::put($name, $conv['mime'], $conv['bytes']);
        $emp = self::hashOf($bytes); $tous = Store::readTable('Documents');
        $d = self::docRow($user, $agent, $info['type'], $info['champs'], $name, $fileId, $emp);
        $meme = null; foreach ($tous as $x) if ($x['empreinte'] !== '' && $x['empreinte'] === $emp) { $meme = $x; break; }
        $memeP = null; foreach ($tous as $x) if ($x['agent_id'] === $agent['id'] && $x['type'] === $d['type'] && $d['type'] !== 'autre' && $x['periode'] !== '' && $x['periode'] === $d['periode']) { $memeP = $x; break; }
        $alerte = ($meme ? ' ⚠ Doublon : ce fichier est déjà classé (' . $meme['nom_original'] . ').' : '') . (!$meme && $memeP ? ' ⚠ Un document du même type et de la même période est déjà classé (' . $memeP['nom_original'] . ').' : '');
        Store::writeTable('Documents', array_merge($tous, [$d]));
        $mail = self::notifyMany($user, $agent, [$d]);
        $out = self::pub($d); $out['mail'] = $mail; $out['detecte'] = ['type' => $info['type'], 'source' => $info['source'], 'avertissement' => trim($info['avertissement'] . $alerte), 'original' => $data['nom']];
        return $out;
    }
    private static function notifyMany(array $user, ?array $agent, array $docs): array {
        if (!$agent || !$docs) return ['ok' => false, 'raison' => 'agent introuvable'];
        if ($agent['id'] === $user['id']) return ['ok' => false, 'raison' => 'dépôt dans votre propre espace'];
        if (!Format::validEmail($agent['email'] ?? '')) return ['ok' => false, 'raison' => 'adresse e-mail absente ou invalide'];
        try {
            $noms = array_map(fn($d) => $d['nom_original'], $docs);
            Mail::send(['to' => $agent['email'], 'replyTo' => $user['email'] ?: null, 'cta' => ['label' => 'Ouvrir mes documents', 'url' => Mail::lien()], 'societe' => Params::get()['prestataire_nom'], 'subject' => 'Nouveau document — ' . $noms[0] . (count($noms) > 1 ? ' (+' . (count($noms) - 1) . ')' : ''),
                'body' => 'Bonjour ' . $agent['nom'] . ",\n\n" . (count($noms) > 1 ? "Nouveaux documents dans votre espace Sijil :\n - " . implode("\n - ", $noms) : 'Nouveau document dans votre espace Sijil : ' . $noms[0]) . "\nDéposé par " . $user['nom'] . ".\n\nConnectez-vous, onglet « Mes documents », pour le télécharger."]);
            return ['ok' => true, 'raison' => ''];
        } catch (Throwable $e) { error_log('Document non notifié : ' . $e->getMessage()); return ['ok' => false, 'raison' => $e->getMessage()]; }
    }
    public static function update(array $user, $id, ?array $data): array {
        $data = $data ?? [];
        if ($user['role'] === 'agent') throw httpErr('Accès refusé', 'FORBIDDEN');
        $all = Store::readTable('Documents'); $i = null; foreach ($all as $k => $x) if ($x['id'] === $id) $i = $k;
        if ($i === null || !self::canSee($user, $all[$i]['agent_id'])) throw httpErr('Document introuvable', 'FORBIDDEN');
        $d = &$all[$i]; $agent = Agents::get($d['agent_id']);
        $type = !empty($data['type']) && isset(CFG()['TYPES_DOC'][$data['type']]) ? $data['type'] : $d['type'];
        $f = json_decode($d['champs'] ?: '', true); if (!is_array($f)) $f = self::extract($d['type'], self::n(str_replace('.', '/', (string)$d['periode'])));
        if (array_key_exists('periode', $data) && trim((string)$data['periode']) !== '') $f = self::parsePeriode($type, $data['periode']);
        elseif ($type !== $d['type']) $f = self::adapt($type, $f);
        $who = self::whoOf($agent) . '_'; $reste = preg_replace('/\.[a-z0-9]{1,8}$/i', '', (string)$d['nom_original']);
        $name = self::fileName($type, $agent, $f, self::extOf($d['nom_original']), strpos($reste, $who) === 0 ? substr($reste, strlen($who)) : self::stemOf($reste));
        if ($name !== $d['nom_original']) { $name = self::uniqueName($agent['id'], $name); Store::pdo()->prepare('UPDATE fichiers SET nom=? WHERE id=?')->execute([$name, $d['file_id']]); }
        $d['type'] = $type; $d['code'] = self::CODES[$type] ?? ''; $d['periode'] = self::periodeOf($type, $f); $d['champs'] = json_encode($f, JSON_UNESCAPED_UNICODE); $d['nom_original'] = $name; $d['titre'] = preg_replace('/\.[a-z0-9]{1,8}$/i', '', $name);
        $copy = $d; unset($d);
        Store::writeTable('Documents', $all);
        return self::pub($copy);
    }
    private static function fileData(string $nom, string $fileId): array {
        $m = Files::meta($fileId); $b = Files::bytes($fileId);
        if (!$m || $b === null) throw httpErr('Fichier introuvable sur le serveur');
        return ['nom' => $nom, 'mime' => $m['mime'], 'base64' => base64_encode($b)];
    }
    public static function download(array $user, $id): array {
        foreach (Store::readTable('Documents') as $d) if ($d['id'] === $id) { if (!self::canSee($user, $d['agent_id'])) break; return self::fileData($d['nom_original'], $d['file_id']); }
        throw httpErr('Document introuvable', 'FORBIDDEN');
    }
    public static function remove(array $user, $id): void {
        $all = Store::readTable('Documents'); $d = null; foreach ($all as $x) if ($x['id'] === $id) $d = $x;
        if ($user['role'] === 'agent' || !$d || !self::canSee($user, $d['agent_id'])) throw httpErr('Document introuvable', 'FORBIDDEN');
        Files::delete($d['file_id']);
        Store::writeTable('Documents', array_values(array_filter($all, fn($x) => $x['id'] !== $id)));
    }
    public static function marquerLus(array $user): array {
        $all = Store::readTable('Documents'); $n = 0;
        foreach ($all as &$d) if ($d['agent_id'] === $user['id'] && $d['nouveau'] === '1') { $d['nouveau'] = ''; $n++; }
        unset($d);
        if ($n) Store::writeTable('Documents', $all);
        return ['lus' => $n];
    }
    public static function nouveaux(array $user): array {
        $l = array_values(array_filter(Store::readTable('Documents'), fn($d) => $d['agent_id'] === $user['id'] && $d['nouveau'] === '1'));
        usort($l, fn($a, $b) => strcmp($b['date'], $a['date']));
        return array_map(fn($d) => ['date' => $d['date'], 'nom' => $d['nom_original'] ?: $d['titre']], array_slice($l, 0, 20));
    }
    public static function count($agentId): int { return count(array_filter(Store::readTable('Documents'), fn($d) => $d['agent_id'] === $agentId)); }
    public static function purgeFiles(): void { foreach (array_merge(Store::readTable('Documents'), Store::readTable('Depots')) as $d) Files::delete($d['file_id']); }

    // ----- dépôt en vrac -----
    private static function visibles(array $user): array { return array_values(array_filter(Agents::visibleTo($user), fn($a) => Agents::isPerson($a) && $a['type'] !== 'vehicule')); }
    private static function champsOf(array $r): array { $f = json_decode($r['champs'] ?: '{}', true); return self::merge(is_array($f) ? $f : [], []); }
    private static function ctxDepots(): array { return ['docs' => Store::readTable('Documents'), 'rows' => Store::readTable('Depots')]; }
    private static function doublonsOf(array $r, array $ctx, array $by): array {
        $out = [];
        if ($r['empreinte'] !== '') {
            foreach ($ctx['docs'] as $d) if ($d['empreinte'] !== '' && $d['empreinte'] === $r['empreinte']) { $out[] = ['niveau' => 'exact', 'message' => 'Fichier identique déjà classé' . (isset($by[$d['agent_id']]) ? ' chez ' . $by[$d['agent_id']]['nom'] : '') . ' : ' . (isset($by[$d['agent_id']]) ? $d['nom_original'] : '')]; break; }
            foreach ($ctx['rows'] as $q) if ($q['id'] !== $r['id'] && $q['empreinte'] === $r['empreinte']) { $out[] = ['niveau' => 'exact', 'message' => 'Fichier identique déjà dans la liste : ' . $q['nom_original']]; break; }
        }
        if ($r['agent_id'] !== '' && $r['type'] !== 'autre') {
            $per = self::periodeOf($r['type'], self::champsOf($r));
            if ($per !== '') {
                foreach ($ctx['docs'] as $m) if ($m['agent_id'] === $r['agent_id'] && $m['type'] === $r['type'] && $m['periode'] === $per) { $out[] = ['niveau' => 'periode', 'message' => 'Un document du même type et de la même période est déjà classé : ' . $m['nom_original']]; break; }
                foreach ($ctx['rows'] as $p) if ($p['id'] !== $r['id'] && $p['agent_id'] === $r['agent_id'] && $p['type'] === $r['type'] && self::periodeOf($p['type'], self::champsOf($p)) === $per) { $out[] = ['niveau' => 'periode', 'message' => 'Un document du même type et de la même période est déjà dans la liste : ' . $p['nom_original']]; break; }
            }
        }
        return $out;
    }
    private static function depotPub(array $r, array $by, ?array $ctx = null): array {
        $f = self::champsOf($r); $a = $by[$r['agent_id']] ?? null; $ids = json_decode($r['candidats'] ?: '[]', true) ?: [];
        $manque = self::missing($r['type'], $f); $ext = $r['ext']; $dbl = self::doublonsOf($r, $ctx ?? self::ctxDepots(), $by);
        $cands = []; foreach ($ids as $id) if (isset($by[$id])) $cands[] = ['id' => $id, 'nom' => $by[$id]['nom']];
        return ['id' => $r['id'], 'nom_original' => $r['nom_original'], 'agent_id' => $r['agent_id'], 'agent_nom' => $a ? $a['nom'] : '', 'type' => $r['type'], 'type_label' => CFG()['TYPES_DOC'][$r['type']] ?? $r['type'], 'champs' => $f,
            'nom_final' => $r['nom_force'] !== '' ? $r['nom_force'] . ($ext ? '.' . $ext : '') : ($a ? self::fileName($r['type'], $a, $f, $ext, self::stemOf($r['nom_original'])) : ''), 'force' => $r['nom_force'] !== '',
            'avertissement' => $r['avert'], 'source' => $r['source'], 'candidats' => $cands, 'manque' => $manque, 'pret' => $a !== null && !$manque, 'date_depot' => $r['date_depot'], 'doublons' => $dbl, 'doublon_exact' => (bool)array_filter($dbl, fn($x) => $x['niveau'] === 'exact')];
    }
    private static function depotRows(array $user): array { $rows = Store::readTable('Depots'); return $user['role'] === 'admin' ? $rows : array_values(array_filter($rows, fn($r) => $r['depose_id'] === $user['id'])); }
    public static function purgerAnciens(): int {
        $lim = gmdate('Y-m-d\TH:i:s.000\Z', time() - self::DEPOT_JOURS * 86400);
        $vieux = false; foreach (Store::readTable('Depots') as $r) if ($r['date_depot'] !== '' && $r['date_depot'] < $lim) $vieux = true;
        if (!$vieux) return 0;
        return Store::withLock(function () use ($lim) {
            $keep = []; $n = 0;
            foreach (Store::readTable('Depots') as $r) { if ($r['date_depot'] !== '' && $r['date_depot'] < $lim) { Files::delete($r['file_id']); $n++; } else $keep[] = $r; }
            Store::writeTable('Depots', $keep); return $n;
        });
    }
    public static function depotVider(array $user): array { if ($user['role'] === 'agent') throw httpErr('Accès refusé', 'FORBIDDEN'); return self::depotRejeter($user, array_map(fn($r) => $r['id'], self::depotRows($user))); }
    public static function depotList(array $user): array {
        if ($user['role'] === 'agent') throw httpErr('Accès refusé', 'FORBIDDEN');
        self::purgerAnciens();
        $by = []; foreach (self::visibles($user) as $a) $by[$a['id']] = $a; $ctx = self::ctxDepots();
        $rows = self::depotRows($user); usort($rows, fn($a, $b) => strcmp($a['date_depot'], $b['date_depot']));
        return array_map(fn($r) => self::depotPub($r, $by, $ctx), $rows);
    }
    public static function depotAdd(array $user, ?array $data): array {
        $data = $data ?? [];
        if ($user['role'] === 'agent') throw httpErr('Accès refusé', 'FORBIDDEN');
        $bytes = self::readBytes($data); $data['_bytes'] = $bytes; $agents = self::visibles($user); $forced = null;
        if (!empty($data['agent_id'])) { foreach ($agents as $a) if ($a['id'] === $data['agent_id']) $forced = $a; if (!$forced) throw httpErr("Cet agent n'est pas dans votre groupe", 'FORBIDDEN'); }
        $chosen = isset(CFG()['TYPES_DOC'][$data['type'] ?? '']) ? $data['type'] : '';
        $info = self::detect($data, $chosen, $forced, $agents);
        $agent = $forced ?: (count($info['candidats']) === 1 ? $info['candidats'][0] : null);
        if ($agent && $info['flou'] && !$forced) $info['avertissement'] = trim($info['avertissement'] . " Agent deviné d'après un nom proche : à vérifier.");
        if (!$agent && count($info['candidats']) > 1) $info['avertissement'] = trim($info['avertissement'] . ' Plusieurs agents possibles : choisissez.');
        if (!$agent && !$info['candidats']) $info['avertissement'] = trim($info['avertissement'] . ' Agent non reconnu : choisissez-le.');
        $ext0 = self::extOf($data['nom']); $estImage = in_array($ext0, ['jpg', 'jpeg', 'png', 'gif', 'bmp'], true); $convertir = !empty($data['pdf']) && $estImage && Pdf::convertible($bytes);
        $fileId = Files::put((string)$data['nom'], self::mimeOf($ext0), $bytes);
        $note = $convertir ? " (sera converti en PDF à l'envoi)" : (!empty($data['pdf']) && $estImage ? " ⚠ Conversion PDF impossible (format d'image non géré) : fichier conservé tel quel." : '');
        $row = ['id' => newId('Q'), 'nom_original' => mb_substr((string)$data['nom'], 0, 120), 'file_id' => $fileId, 'ext' => $convertir ? 'pdf' : $ext0, 'agent_id' => $agent ? $agent['id'] : '', 'type' => $info['type'], 'champs' => json_encode($info['champs'], JSON_UNESCAPED_UNICODE), 'nom_force' => '',
            'source' => $info['source'], 'avert' => trim($info['avertissement'] . $note), 'depose_par' => $user['nom'], 'depose_id' => $user['id'], 'date_depot' => nowIso(), 'candidats' => json_encode(array_map(fn($a) => $a['id'], $info['candidats'])), 'empreinte' => self::hashOf($bytes), 'convertir' => $convertir ? '1' : '', 'ext_orig' => $ext0];
        Store::writeTable('Depots', array_merge(Store::readTable('Depots'), [$row]));
        $by = []; foreach ($agents as $a) $by[$a['id']] = $a;
        return self::depotPub($row, $by);
    }
    public static function depotUpdate(array $user, $id, ?array $patch): array {
        if ($user['role'] === 'agent') throw httpErr('Accès refusé', 'FORBIDDEN');
        $patch = $patch ?? []; $all = Store::readTable('Depots'); $mineIds = array_map(fn($r) => $r['id'], self::depotRows($user));
        if (!in_array($id, $mineIds, true)) throw httpErr('Document en attente introuvable');
        $i = null; foreach ($all as $k => $x) if ($x['id'] === $id) $i = $k;
        $r = &$all[$i]; $agents = self::visibles($user);
        if (array_key_exists('agent_id', $patch)) {
            if ($patch['agent_id']) { $ok = false; foreach ($agents as $a) if ($a['id'] === $patch['agent_id']) $ok = true; if (!$ok) throw httpErr("Cet agent n'est pas dans votre groupe", 'FORBIDDEN'); }
            $r['agent_id'] = (string)$patch['agent_id'];
            if ($patch['agent_id']) $r['avert'] = trim(preg_replace(['/ ?Agent non reconnu : choisissez-le\./', '/ ?Plusieurs agents possibles : choisissez\./', "/ ?Agent deviné d'après un nom proche : à vérifier\./u"], '', (string)$r['avert']));
        }
        if (array_key_exists('type', $patch)) { if (!isset(CFG()['TYPES_DOC'][$patch['type']])) throw httpErr('Type de document invalide'); if ($patch['type'] !== $r['type']) { $r['champs'] = json_encode(self::adapt($patch['type'], self::champsOf($r)), JSON_UNESCAPED_UNICODE); $r['type'] = $patch['type']; } }
        if (!empty($patch['champs'])) {
            $f = self::champsOf($r); $p = $patch['champs'];
            if (array_key_exists('date', $p)) { if ($p['date'] && !Dates::isDate($p['date'])) throw httpErr('Date invalide'); $f['date'] = (string)$p['date']; }
            foreach (['mois', 'mois2'] as $k) if (array_key_exists($k, $p)) { $v = (string)($p[$k] ?? ''); if ($v !== '' && !preg_match('/^[a-z]+20\d{2}$/', $v)) { $x = self::moisSeul(self::n($v)); if ($x === '') throw httpErr('Mois invalide (ex. mars 2026)'); $v = $x; } $f[$k] = $v; }
            if (array_key_exists('nss', $p)) { $s = preg_replace('/\s+/', '', (string)($p['nss'] ?? '')); if ($s !== '' && !preg_match('/^\d{6,14}$/', $s)) throw httpErr('N° de sécurité sociale : chiffres uniquement'); $f['nss'] = $s; }
            $r['champs'] = json_encode($f, JSON_UNESCAPED_UNICODE);
        }
        if (array_key_exists('nom_force', $patch)) $r['nom_force'] = mb_substr(preg_replace('~[\\\\/:*?"<>|]~', '_', preg_replace('/\.[a-z0-9]{1,8}$/i', '', (string)($patch['nom_force'] ?? ''))), 0, 120);
        $copy = $r; unset($r);
        Store::writeTable('Depots', $all);
        $by = []; foreach ($agents as $a) $by[$a['id']] = $a;
        return self::depotPub($copy, $by);
    }
    public static function depotValider(array $user, $ids, $forcer): array {
        if ($user['role'] === 'agent') throw httpErr('Accès refusé', 'FORBIDDEN');
        $all = Store::readTable('Depots'); $mine = self::depotRows($user); $by = []; foreach (self::visibles($user) as $a) $by[$a['id']] = $a;
        $docs = []; $done = []; $erreurs = []; $parAgent = []; $ctx = self::ctxDepots();
        foreach (array_values(array_unique((array)($ids ?? []))) as $id) {
            $r = null; foreach ($mine as $x) if ($x['id'] === $id) $r = $x;
            if (!$r) continue;
            $pubr = self::depotPub($r, $by, $ctx);
            if ($pubr['doublon_exact'] && !$forcer) { $erreurs[] = ['id' => $id, 'nom' => $r['nom_original'], 'message' => "Doublon exact : confirmez l'envoi"]; continue; }
            if (!$pubr['pret']) { $erreurs[] = ['id' => $id, 'nom' => $r['nom_original'], 'message' => !isset($by[$r['agent_id']]) ? 'Agent à choisir' : 'À compléter : ' . implode(', ', $pubr['manque'])]; continue; }
            try {
                $agent = $by[$r['agent_id']]; $fileId = $r['file_id'];
                $name = self::uniqueName($agent['id'], $pubr['nom_final']);
                if ($r['convertir'] === '1') {
                    try { $bytes = Files::bytes($fileId); $pdf = $bytes !== null ? Pdf::fromImage($bytes) : null; if ($pdf === null) throw new RuntimeException('conversion impossible'); $nf = Files::put($name, 'application/pdf', $pdf); Files::delete($fileId); $fileId = $nf; }
                    catch (Throwable $ce) { $name = self::uniqueName($agent['id'], preg_replace('/\.pdf$/i', '.' . ($r['ext_orig'] ?: 'jpg'), $name)); Store::pdo()->prepare('UPDATE fichiers SET nom=? WHERE id=?')->execute([$name, $fileId]); }
                } else Store::pdo()->prepare('UPDATE fichiers SET nom=? WHERE id=?')->execute([$name, $fileId]);
                $d = self::docRow($user, $agent, $r['type'], self::champsOf($r), $name, $fileId, $r['empreinte']); $docs[] = $d; $done[$id] = true;
                $parAgent[$agent['id']]['agent'] = $agent; $parAgent[$agent['id']]['docs'][] = $d;
            } catch (Throwable $e) { $erreurs[] = ['id' => $id, 'nom' => $r['nom_original'], 'message' => $e->getMessage()]; }
        }
        if ($docs) Store::writeTable('Documents', array_merge(Store::readTable('Documents'), $docs));
        Store::writeTable('Depots', array_values(array_filter($all, fn($x) => !isset($done[$x['id']]))));
        $mails = []; foreach ($parAgent as $p) { $m = self::notifyMany($user, $p['agent'], $p['docs']); $mails[] = ['agent' => $p['agent']['nom'], 'ok' => $m['ok'], 'raison' => $m['raison']]; }
        return ['valides' => count($docs), 'erreurs' => $erreurs, 'noms' => array_map(fn($d) => $d['nom_original'], $docs), 'mails' => $mails];
    }
    public static function depotApercu(array $user, $id): array {
        if ($user['role'] === 'agent') throw httpErr('Accès refusé', 'FORBIDDEN');
        foreach (self::depotRows($user) as $r) if ($r['id'] === $id) return self::fileData($r['nom_original'], $r['file_id']);
        throw httpErr('Document en attente introuvable');
    }
    public static function depotRejeter(array $user, $ids): array {
        if ($user['role'] === 'agent') throw httpErr('Accès refusé', 'FORBIDDEN');
        $mine = self::depotRows($user); $gone = [];
        foreach ((array)($ids ?? []) as $id) foreach ($mine as $r) if ($r['id'] === $id) { Files::delete($r['file_id']); $gone[$id] = true; }
        Store::writeTable('Depots', array_values(array_filter(Store::readTable('Depots'), fn($x) => !isset($gone[$x['id']]))));
        return ['retires' => count($gone)];
    }
}
