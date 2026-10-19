<?php
/** Export / import d'un pointage avec ses dépendances (Excel) : contrat, fonctions et prix, agents, quantités, attachements validés, paramètres, un onglet « AAAA-MM » par mois. */
final class Archive {
    const AGENT_COLS = ['nom', 'fonction', 'affectation', 'contrat', 'email', 'role', 'type', 'rotation', 'actif', 'date_entree', 'chef'];
    const TABLE_SHEETS = ['contrat' => 'Contrat', 'fonctions' => 'Fonctions', 'agents' => 'Agents', 'attachements' => 'Attachements', 'attachementsvalides' => 'AttachementsValides', 'params' => 'Params'];
    private static function key($name): string { return preg_replace('/[^a-z]/', '', Format::norm($name)); }

    public static function model(?array $o): array {
        $o = $o ?? []; $months = Pointage::loadMonths(); $agents = Agents::list(); $contrat = null;
        if (!empty($o['contrat'])) { foreach (Contrats::contrats() as $c) if ($c['numero'] === $o['contrat']) $contrat = $c; if (!$contrat) throw httpErr('Contrat introuvable : ' . $o['contrat']); }
        $staff = array_values(array_filter($agents, fn($a) => Agents::isPerson($a) && (empty($o['contrat']) || $a['contrat'] === $o['contrat'])));
        if (!$staff) throw httpErr(!empty($o['contrat']) ? "Aucun agent n'est rattaché à ce contrat" : 'Aucun agent');
        $byId = []; foreach ($agents as $a) $byId[$a['id']] = $a;
        $debut = Dates::isMonthKey($o['debut'] ?? null) ? $o['debut'] : ''; $fin = Dates::isMonthKey($o['fin'] ?? null) ? $o['fin'] : '';
        $mois = [];
        foreach (array_keys($months) as $k) {
            if (($debut && $k < $debut) || ($fin && $k > $fin)) continue;
            $p = Dates::parseKey($k); $nd = Dates::daysInMonth($p['y'], $p['m']); $lignes = [];
            foreach ($staff as $a) { $j = array_slice($months[$k][$a['id']] ?? [], 0, $nd); while (count($j) < 31) $j[] = ''; if (array_filter($j)) $lignes[] = ['nom' => $a['nom'], 'fonction' => $a['fonction'], 'jours' => $j]; }
            if ($lignes) $mois[] = ['key' => $k, 'lignes' => $lignes];
        }
        $dep = ($o['dependances'] ?? true) !== false;
        $m = ['meta' => ['version' => CFG()['VERSION'], 'date' => str_replace('T', ' ', substr(nowIso(), 0, 16)), 'contrat' => $o['contrat'] ?? '', 'debut' => $debut, 'fin' => $fin, 'dependances' => $dep],
            'agents' => array_map(fn($a) => ['nom' => $a['nom'], 'fonction' => $a['fonction'], 'affectation' => $a['affectation'], 'contrat' => $a['contrat'], 'email' => $a['type'] === 'vehicule' ? '' : $a['email'], 'role' => $a['role'], 'type' => $a['type'] === 'vehicule' ? 'vehicule' : 'personne', 'rotation' => $a['rotation'], 'actif' => $a['actif'], 'date_entree' => $a['date_entree'], 'chef' => ($byId[$a['chef_id']]['nom'] ?? '')], $staff),
            'mois' => $mois, 'contrats' => [], 'fonctions' => [], 'attachements' => [], 'valides' => [], 'params' => []];
        if ($dep) {
            $nums = $contrat ? [$contrat['numero']] : array_map(fn($c) => $c['numero'], Contrats::contrats());
            $m['contrats'] = array_values(array_filter(Contrats::contrats(), fn($c) => in_array($c['numero'], $nums, true)));
            $m['fonctions'] = array_values(array_filter(Contrats::fonctions(), fn($f) => in_array($f['contrat'], $nums, true)));
            $m['attachements'] = array_values(array_filter(Store::readTable('Attachements'), fn($x) => in_array($x['contrat'], $nums, true)));
            $m['valides'] = array_values(array_filter(Store::readTable('AttachementsValides'), fn($x) => in_array($x['contrat'], $nums, true)));
            $p = Params::get(); foreach (Params::defs() as $d) $m['params'][$d['key']] = $p[$d['key']];
        }
        return $m;
    }
    private static function table(array $cols, array $objs): array { return array_merge([$cols], array_map(fn($o) => array_map(fn($c) => (string)($o[$c] ?? ''), $cols), $objs)); }
    private static function pointageSheet(array $mm, $contrat): array {
        $p = Dates::parseKey($mm['key']); $nd = Dates::daysInMonth($p['y'], $p['m']);
        $rows = [[], ['', '', '', '', '', '', '', 'FICHE DE POINTAGE'], ['Mois de : ' . Dates::monthLabel($mm['key'])], [$contrat ? 'Contrat : ' . $contrat : ''], array_merge(['Nom Et Prenom', 'Fonction'], range(1, 31), ['T', 'CR', 'ABS'])];
        foreach ($mm['lignes'] as $l) { $j = array_slice($l['jours'], 0, $nd); while (count($j) < 31) $j[] = ''; $rows[] = array_merge([$l['nom'], $l['fonction']], $j, array_map(fn($s) => count(array_filter($j, fn($x) => $x === $s)), ['T', 'R', 'ABS'])); }
        return $rows;
    }
    public static function toSheets(array $m): array {
        $sheets = [['name' => 'Lisez-moi', 'rows' => [['Export de pointage — ' . CFG()['COPYRIGHT']], [''], ['Contrat : ' . ($m['meta']['contrat'] ?: '(tous les agents, sans contrat)') . ' · période : ' . ($m['meta']['debut'] ?: 'début') . ' → ' . ($m['meta']['fin'] ?: 'fin') . ' · exporté le ' . $m['meta']['date'] . ' · version ' . $m['meta']['version']],
            [$m['meta']['dependances'] ? 'Contient : contrat, fonctions et prix, agents, quantités saisies, attachements validés et factures, paramètres, pointages.' : 'Contient : agents et pointages.'], ["Se réimporte par Setup → Maintenance → Importer un pointage. Les mots de passe ne sont pas exportés."]]]];
        if ($m['meta']['dependances']) { $sheets[] = ['name' => 'Contrat', 'rows' => self::table(CFG()['TABLES']['Contrats'], $m['contrats']), 'text' => true, 'header' => true]; $sheets[] = ['name' => 'Fonctions', 'rows' => self::table(CFG()['TABLES']['Fonctions'], $m['fonctions']), 'text' => true, 'header' => true]; }
        $sheets[] = ['name' => 'Agents', 'rows' => self::table(self::AGENT_COLS, $m['agents']), 'text' => true, 'header' => true];
        if ($m['meta']['dependances']) {
            $sheets[] = ['name' => 'Attachements', 'rows' => self::table(CFG()['TABLES']['Attachements'], $m['attachements']), 'text' => true, 'header' => true];
            $sheets[] = ['name' => 'AttachementsValides', 'rows' => self::table(CFG()['TABLES']['AttachementsValides'], $m['valides']), 'text' => true, 'header' => true];
            $sheets[] = ['name' => 'Params', 'rows' => array_merge([['cle', 'valeur']], array_map(fn($k) => [$k, (string)($m['params'][$k] ?? '')], array_keys($m['params']))), 'text' => true, 'header' => true];
        }
        foreach ($m['mois'] as $mm) $sheets[] = ['name' => $mm['key'], 'rows' => self::pointageSheet($mm, $m['meta']['contrat']), 'pointage' => true];
        return $sheets;
    }
    public static function exportXlsx(array $user, ?array $o): array {
        $m = self::model($o);
        $nom = 'Pointage_' . ($m['meta']['contrat'] ? preg_replace('/[^\w-]+/', '_', $m['meta']['contrat']) : 'tous') . '_' . ($m['mois'] ? $m['mois'][0]['key'] . '_a_' . end($m['mois'])['key'] : 'sans_pointage');
        return Export::renderBook(self::toSheets($m), $nom);
    }
    private static function readTable(?array $rows, array $cols): array {
        if (!$rows) return [];
        $head = array_map(fn($h) => trim((string)$h), $rows[0]); $out = [];
        foreach (array_slice($rows, 1) as $r) {
            if (!array_filter($r, fn($c) => trim((string)$c) !== '')) continue;
            $o = []; foreach ($cols as $c) { $i = array_search($c, $head, true); $o[$c] = $i === false || !isset($r[$i]) ? '' : trim((string)$r[$i]); } $out[] = $o;
        }
        return $out;
    }
    public static function parse(array $sheets): ?array {
        $by = []; foreach ($sheets as $s) { $k = self::key($s['name']); if (isset(self::TABLE_SHEETS[$k])) $by[$k] = $s['rows']; }
        if (!$by) return null;
        $params = []; foreach (array_slice($by['params'] ?? [], 1) as $r) if (!empty($r[0])) $params[trim((string)$r[0])] = (string)($r[1] ?? '');
        $a = ['contrats' => self::readTable($by['contrat'] ?? null, CFG()['TABLES']['Contrats']), 'fonctions' => self::readTable($by['fonctions'] ?? null, CFG()['TABLES']['Fonctions']), 'agents' => self::readTable($by['agents'] ?? null, self::AGENT_COLS),
            'attachements' => self::readTable($by['attachements'] ?? null, CFG()['TABLES']['Attachements']), 'valides' => self::readTable($by['attachementsvalides'] ?? null, CFG()['TABLES']['AttachementsValides']), 'params' => $params];
        $a['resume'] = ['contrats' => count($a['contrats']), 'fonctions' => count($a['fonctions']), 'agents' => count($a['agents']), 'attachements' => count($a['attachements']), 'valides' => count($a['valides']), 'params' => count($params)];
        return $a;
    }
    public static function agentInfo(?array $a, $nom): ?array { if (!$a || !$nom) return null; $n = Format::norm($nom); foreach ($a['agents'] as $x) if (Format::norm($x['nom']) === $n) return $x; return null; }
    public static function apply(?array $arch, ?array $r): array {
        $r = $r ?? []; $out = ['contrats' => 0, 'fonctions' => 0, 'quantites' => 0, 'valides' => 0, 'params' => 0, 'ignores' => []];
        if (!$arch) return $out;
        if (!empty($r['contrat']) && $arch['contrats']) {
            $cs = Contrats::contrats(); $fs = Contrats::fonctions();
            foreach ($arch['contrats'] as $c) {
                $i = array_search($c['numero'], array_column($cs, 'numero'), true);
                if ($i !== false) $cs[$i] = $c; else $cs[] = $c;
                $out['contrats']++;
                $mine = array_values(array_filter($arch['fonctions'], fn($f) => $f['contrat'] === $c['numero']));
                $fs = array_merge(array_values(array_filter($fs, fn($f) => $f['contrat'] !== $c['numero'])), $mine); $out['fonctions'] += count($mine);
            }
            Contrats::saveContrats($cs); Contrats::saveFonctions($fs);
        }
        if (!empty($r['quantites']) && $arch['attachements']) {
            $at = Store::readTable('Attachements');
            foreach ($arch['attachements'] as $x) { $at = array_values(array_filter($at, fn($y) => !($y['contrat'] === $x['contrat'] && $y['mois'] === $x['mois'] && $y['designation'] === $x['designation']))); $at[] = $x; $out['quantites']++; }
            Store::writeTable('Attachements', $at);
        }
        if (!empty($r['attachements']) && $arch['valides']) {
            $vs = Store::readTable('AttachementsValides');
            foreach ($arch['valides'] as $x) {
                $cur = null; foreach ($vs as $y) if ($y['contrat'] === $x['contrat'] && $y['mois'] === $x['mois']) $cur = $y;
                if ($cur && $cur['statut'] === 'facture' && $x['statut'] !== 'facture') { $out['ignores'][] = 'Attachement ' . $x['contrat'] . ' ' . $x['mois'] . ' : déjà facturé ici, conservé'; continue; }
                $vs = array_values(array_filter($vs, fn($y) => !($y['contrat'] === $x['contrat'] && $y['mois'] === $x['mois']))); $vs[] = $x; $out['valides']++;
            }
            Store::writeTable('AttachementsValides', $vs);
        }
        if (!empty($r['params']) && $arch['params']) {
            $set = []; foreach (Params::defs() as $d) if (isset($arch['params'][$d['key']]) && $arch['params'][$d['key']] !== '') $set[$d['key']] = $arch['params'][$d['key']];
            Params::set($set); $out['params'] = count($set);
        }
        return $out;
    }
}
