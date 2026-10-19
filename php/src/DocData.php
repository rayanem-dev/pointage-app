<?php
/** Données des documents exportés : fiche de pointage, attachement, facture. */
final class DocData {
    private static function findContrat($numero): array {
        $list = Contrats::contrats(); $c = null;
        if ($numero) { foreach ($list as $x) if ($x['numero'] === $numero) $c = $x; } else $c = $list[0] ?? null;
        if (!$c) throw httpErr($numero ? 'Contrat introuvable : ' . $numero : 'Aucun contrat configuré (Setup → Contrats)');
        return $c;
    }
    public static function ficheData($key, $numero, ?array $opts): array {
        $opts = $opts ?? [];
        if (!Dates::isMonthKey($key)) throw httpErr('Mois invalide (AAAA-MM)');
        $params = Params::get();
        $list = array_values(array_filter($opts['agents'] ?? Agents::list(), fn($a) => $a['actif'] === '1' && Agents::isPerson($a)));
        $contrat = $numero ? self::findContrat($numero) : null;
        if ($contrat && empty($opts['tous'])) $list = array_values(array_filter($list, fn($a) => $a['contrat'] === $contrat['numero']));
        $g = Pointage::grid($key, $list, !empty($opts['prevu']));
        $prest = $params['prestataire_nom'] ?: 'Prestataire';
        $client = $contrat && $contrat['client'] !== '' ? mb_strtoupper(preg_split('/\s+/', $contrat['client'])[0]) : '';
        $titre = $contrat ? ($client ? $client . '/' : '') . $prest . ' N°' . $contrat['numero'] : $prest;
        return ['key' => $key, 'label' => $g['label'], 'nd' => $g['nd'], 'rows' => $g['rows'], 'prevu' => !empty($opts['prevu']), 'titre' => $titre, 'params' => $params, 'contrat' => $contrat];
    }
    public static function ficheApercu($key, $numero, ?array $visibles): array {
        $params = Params::get();
        $agents = array_values(array_filter($visibles ?? Agents::list(), fn($a) => $a['actif'] === '1' && Agents::isPerson($a)));
        $contrat = $numero ? self::findContrat($numero) : null;
        $dans = $contrat ? array_values(array_filter($agents, fn($a) => $a['contrat'] === $contrat['numero'])) : $agents;
        $hors = $contrat ? array_values(array_filter($agents, fn($a) => $a['contrat'] !== $contrat['numero'])) : [];
        $warn = [];
        if (!$params['prestataire_nom']) $warn[] = 'Nom du prestataire vide (Setup → Paramètres).';
        if ($contrat && $contrat['client'] === '') $warn[] = 'Client vide sur le contrat ' . $contrat['numero'] . '.';
        if ($contrat && !$dans) $warn[] = 'Aucun agent rattaché au contrat ' . $contrat['numero'] . ($hors ? ' (' . count($hors) . ' agent(s) ont un autre numéro de contrat — vérifiez I/24 et 1/24).' : '.');
        elseif ($hors) $warn[] = count($hors) . ' agent(s) hors contrat ne seront pas dans la fiche : ' . implode(', ', array_map(fn($a) => $a['nom'], array_slice($hors, 0, 5))) . '.';
        return ['mois' => $key, 'dans' => count($dans), 'hors' => count($hors), 'avertissements' => $warn];
    }
    public static function repPrestataire(array $contrat): string {
        $v = (string)$contrat['rep_prestataire'];
        if ($v === '-') return '';
        if ($v !== '') return $v;
        $chefs = array_values(array_filter(Agents::list(), fn($a) => $a['role'] === 'chef' && $a['actif'] === '1'));
        $chef = null; foreach ($chefs as $c) if ($c['contrat'] === $contrat['numero']) { $chef = $c; break; }
        $chef = $chef ?: ($chefs[0] ?? null);
        return $chef ? $chef['nom'] : '';
    }
    public static function refMonth(array $contrat, string $key): string {
        if ($contrat['ref_mois'] !== '') return $contrat['ref_mois'];
        $ids = array_map(fn($a) => $a['id'], array_values(array_filter(Agents::list(), fn($a) => $a['contrat'] === $contrat['numero'])));
        $first = null;
        if ($ids) { $st = Store::pdo()->prepare('SELECT MIN(DATE_FORMAT(jour, "%Y-%m")) FROM pointage WHERE agent_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')'); $st->execute($ids); $first = $st->fetchColumn() ?: null; }
        return $first && $first <= $key ? $first : $key;
    }
    public static function validation($numero, $key): ?array { foreach (Store::readTable('AttachementsValides') as $v) if ($v['contrat'] === $numero && $v['mois'] === $key) return $v; return null; }
    private static function snapLines(array $v): array { $l = json_decode($v['lignes'], true); return is_array($l) ? $l : []; }
    private static function sumT(array $rows, array $names): int { $t = 0; foreach ($rows as $r) if (in_array(Format::norm($r['fonction']), $names, true)) $t += $r['mois']['T']; return $t; }

    private static function computeFresh(string $key, array $contrat): array {
        $funcs = array_values(array_filter(Contrats::fonctions(), fn($f) => $f['contrat'] === $contrat['numero']));
        $overrides = Store::readTable('Attachements'); $params = Params::get();
        $ref = self::refMonth($contrat, $key); $refN = (int)($contrat['ref_attachement'] ?: 1);
        $override = function ($f, $k) use ($overrides, $contrat) { foreach ($overrides as $x) if ($x['contrat'] === $contrat['numero'] && $x['mois'] === $k && $x['designation'] === $f['designation']) return $x; return null; };
        $base = $params['attachement_pointage'] !== '0';
        $agents = array_values(array_filter(Agents::list(), fn($a) => $a['actif'] === '1' && Agents::isPerson($a) && $a['contrat'] === $contrat['numero']));
        $gridMemo = [];
        $pointesOf = function ($f, $k) use (&$gridMemo, $agents) { if (!isset($gridMemo[$k])) $gridMemo[$k] = Pointage::grid($k, $agents, false); return self::sumT($gridMemo[$k]['rows'], [Format::norm($f['designation']), Format::norm($f['libelle'])]); };
        $qty = function ($f, $k) use ($override, $base, $pointesOf) {
            $o = $override($f, $k); if ($o) return (float)$o['qte_mois'];
            if ($base) return (float)$pointesOf($f, $k);
            $p = Dates::parseKey($k); return (float)$f['positions'] * Dates::daysInMonth($p['y'], $p['m']);
        };
        $d = Dates::monthDiff($ref, $key);
        $pv = $d > 0 ? self::validation($contrat['numero'], Dates::addMonths($key, -1)) : null;
        $pvLines = $pv ? self::snapLines($pv) : null;
        $g = Pointage::grid($key, $agents, false);
        $lines = []; $total = 0.0;
        foreach ($funcs as $i => $f) {
            $prev = (float)($f['qte_precedente_ref'] ?: 0);
            if ($pvLines !== null) { $prev = 0; foreach ($pvLines as $l) if ($l['designation'] === $f['designation']) { $prev = (float)$l['cumulee']; break; } }
            else {
                if ($d > 0) for ($i2 = 0; $i2 < $d; $i2++) $prev += $qty($f, Dates::addMonths($ref, $i2));
                if ($d < 0) for ($i2 = $d; $i2 < 0; $i2++) $prev -= $qty($f, Dates::addMonths($ref, $i2));
            }
            $mois = $qty($f, $key);
            $pointes = self::sumT($g['rows'], [Format::norm($f['designation']), Format::norm($f['libelle'])]);
            $montant = $mois * (float)$f['prix_unitaire']; $total += $montant;
            $lines[] = ['n' => $i + 1, 'designation' => $f['designation'], 'nature' => $f['nature'] === 'vehicule' ? 'vehicule' : 'personne', 'positions' => Format::num($f['positions']), 'unite' => 'Jour', 'delai' => Format::num($f['delai']), 'contrat' => Format::num((float)$f['positions'] * (float)$f['delai']),
                'precedente' => Format::num($prev), 'mois' => Format::num($mois), 'cumulee' => Format::num($prev + $mois), 'prix_unitaire' => Format::num($f['prix_unitaire']), 'montant' => Format::num($montant), 'pointes' => $pointes, 'auto' => !$override($f, $key)];
        }
        return ['key' => $key, 'numero' => $refN + $d, 'contrat' => $contrat, 'rep_prestataire' => self::repPrestataire($contrat), 'params' => $params, 'lines' => $lines, 'debut' => $key . '-01', 'fin' => Dates::monthEnd($key), 'totalHT' => Format::num($total), 'statut' => 'brouillon', 'verrouille' => false, 'precedent_valide' => (bool)$pv];
    }
    public static function attachementData($key, $numero): array {
        if (!Dates::isMonthKey($key)) throw httpErr('Mois invalide (AAAA-MM)');
        $contrat = self::findContrat($numero); $v = self::validation($contrat['numero'], $key);
        if (!$v) return self::computeFresh($key, $contrat);
        return ['key' => $key, 'numero' => (int)$v['numero'], 'contrat' => $contrat, 'rep_prestataire' => $v['rep_prestataire'], 'params' => Params::get(), 'lines' => self::snapLines($v), 'debut' => $key . '-01', 'fin' => Dates::monthEnd($key),
            'totalHT' => Format::num($v['total_ht']), 'statut' => $v['statut'], 'verrouille' => true, 'valide_par' => $v['valide_par'], 'date_validation' => $v['date_validation'], 'facture_numero' => $v['facture_numero'], 'facture_date' => $v['facture_date'], 'facture_par' => $v['facture_par']];
    }
    private static function requireAdmin(array $user): void { if ($user['role'] !== 'admin') throw httpErr("Réservé à l'administrateur", 'FORBIDDEN'); }
    public static function valider(array $user, $key, $numero): array {
        self::requireAdmin($user); $contrat = self::findContrat($numero);
        if (self::validation($contrat['numero'], $key)) throw httpErr('Attachement déjà validé');
        $d = Dates::monthDiff(self::refMonth($contrat, $key), $key); $prevKey = Dates::addMonths($key, -1);
        if ($d > 0 && !self::validation($contrat['numero'], $prevKey)) throw httpErr("Validez d'abord l'attachement de " . Dates::monthLabel($prevKey) . " : les quantités précédentes en dépendent.");
        $data = self::computeFresh($key, $contrat);
        if (!$data['lines']) throw httpErr('Aucune fonction au contrat : rien à valider (Setup → Contrats).');
        $all = Store::readTable('AttachementsValides');
        $all[] = ['contrat' => $contrat['numero'], 'mois' => $key, 'numero' => (string)$data['numero'], 'statut' => 'valide', 'valide_par' => $user['nom'], 'date_validation' => nowIso(), 'rep_prestataire' => $data['rep_prestataire'], 'total_ht' => (string)$data['totalHT'], 'lignes' => json_encode($data['lines'], JSON_UNESCAPED_UNICODE), 'facture_numero' => '', 'facture_date' => '', 'facture_par' => ''];
        Store::writeTable('AttachementsValides', $all);
        return self::attachementData($key, $contrat['numero']);
    }
    public static function rouvrir(array $user, $key, $numero): array {
        self::requireAdmin($user); $contrat = self::findContrat($numero); $all = Store::readTable('AttachementsValides'); $vi = null;
        foreach ($all as $i => $x) if ($x['contrat'] === $contrat['numero'] && $x['mois'] === $key) $vi = $i;
        if ($vi === null) throw httpErr("Cet attachement n'est pas validé");
        if ($all[$vi]['statut'] === 'facture') throw httpErr('Attachement déjà facturé (facture ' . $all[$vi]['facture_numero'] . ') : impossible de le rouvrir.');
        foreach ($all as $x) if ($x['contrat'] === $contrat['numero'] && $x['mois'] > $key) throw httpErr("Rouvrez d'abord l'attachement de " . Dates::monthLabel($x['mois']) . ' (validé après celui-ci).');
        unset($all[$vi]); Store::writeTable('AttachementsValides', array_values($all));
        return self::attachementData($key, $contrat['numero']);
    }
    public static function facturer(array $user, $key, $numero, ?array $opts): array {
        self::requireAdmin($user); $opts = $opts ?? []; $contrat = self::findContrat($numero); $all = Store::readTable('AttachementsValides'); $vi = null;
        foreach ($all as $i => $x) if ($x['contrat'] === $contrat['numero'] && $x['mois'] === $key) $vi = $i;
        if ($vi === null) throw httpErr("Validez d'abord l'attachement : la facture est générée à partir de l'attachement validé.");
        $fnum = trim((string)($opts['facture_numero'] ?? ''));
        if ($fnum === '') throw httpErr('N° de facture obligatoire');
        if (!empty($opts['date']) && !Dates::isDate($opts['date'])) throw httpErr('Date de facture invalide');
        $all[$vi]['facture_numero'] = $fnum; $all[$vi]['facture_date'] = ($opts['date'] ?? '') ?: ($all[$vi]['facture_date'] ?: Dates::monthEnd($key)); $all[$vi]['facture_par'] = $user['nom']; $all[$vi]['statut'] = 'facture';
        Store::writeTable('AttachementsValides', $all);
        return self::attachementData($key, $contrat['numero']);
    }
    public static function factureData($key, $numero): array {
        $att = self::attachementData($key, $numero);
        if (!$att['verrouille']) throw httpErr("Validez d'abord l'attachement : la facture est générée à partir de l'attachement validé.");
        $att['lines'] = array_values(array_filter($att['lines'], fn($l) => $l['mois'] > 0));
        $att['facture_numero'] = $att['facture_numero'] ?? '';
        $att['date'] = ($att['facture_date'] ?? '') ?: $att['fin']; $att['attachement_date'] = $att['fin'];
        $att['totalHT'] = Format::num(array_sum(array_map(fn($l) => $l['montant'], $att['lines'])));
        return $att;
    }
}
