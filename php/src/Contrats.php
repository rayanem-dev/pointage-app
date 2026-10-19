<?php
/** Contrats, fonctions prévues, effectifs et synthèse. */
final class Contrats {
    public static function contrats(): array { return Store::readTable('Contrats'); }
    public static function fonctions(): array { return Store::readTable('Fonctions'); }
    public static function saveContrats($list): array {
        $seen = []; $clean = [];
        foreach ((array)($list ?? []) as $c) {
            $numero = trim((string)($c['numero'] ?? ''));
            if ($numero === '') throw httpErr('Numéro de contrat obligatoire');
            if (isset($seen[$numero])) throw httpErr('Contrat en double : ' . $numero);
            $seen[$numero] = true;
            if (!empty($c['ref_mois']) && !preg_match('/^\d{4}-\d{2}$/', $c['ref_mois'])) throw httpErr('Mois de référence : AAAA-MM');
            $debut = trim((string)($c['date_debut'] ?? '')); if ($debut !== '' && !Dates::isDate($debut)) throw httpErr('Date de début du contrat invalide (AAAA-MM-JJ)');
            $duree = trim((string)($c['duree_mois'] ?? '')); if ($duree !== '' && !((float)$duree >= 1 && fmod((float)$duree, 1) == 0.0)) throw httpErr('Durée du contrat : nombre de mois entier ≥ 1');
            $cemail = implode(', ', Format::emails($c['client_email'] ?? '', 'E-mails du contact client', 4));
            $clean[] = ['numero' => $numero, 'client' => $c['client'] ?? '', 'objet' => $c['objet'] ?? '', 'date_contrat' => $c['date_contrat'] ?? '', 'ref_mois' => $c['ref_mois'] ?? '', 'ref_attachement' => $c['ref_attachement'] ?? '', 'rep_prestataire' => $c['rep_prestataire'] ?? '', 'rep_client' => $c['rep_client'] ?? '', 'date_debut' => $debut, 'duree_mois' => $duree, 'client_email' => $cemail];
        }
        Store::writeTable('Contrats', $clean);
        return $clean;
    }
    public static function dateFin($debut, $duree): string {
        if (!$debut || !Dates::isDate($debut) || !((float)$duree >= 1)) return '';
        $key = Dates::addMonths(substr($debut, 0, 7), (int)$duree); $p = Dates::parseKey($key);
        $d = min((int)substr($debut, 8, 2), Dates::daysInMonth($p['y'], $p['m']));
        return Dates::addDays($key . '-' . Dates::pad($d), -1);
    }
    public static function info($numero): ?array {
        $c = null; if ($numero) foreach (self::contrats() as $x) if ($x['numero'] === $numero) $c = $x;
        if (!$c) return null;
        return ['numero' => $c['numero'], 'client' => $c['client'], 'objet' => $c['objet'], 'date_debut' => $c['date_debut'], 'duree_mois' => $c['duree_mois'], 'date_fin' => self::dateFin($c['date_debut'], $c['duree_mois'])];
    }
    public static function ensureClientAccounts(array $user): array {
        $out = []; $existing = []; foreach (Agents::list() as $a) $existing[mb_strtolower($a['email'])] = true;
        $all = self::contrats(); $params = Params::get(); $sources = [];
        foreach (Format::emails($params['client_emails'], 'E-mails du contact client', 4) as $e) $sources[] = ['email' => $e, 'contrat' => count($all) === 1 ? $all[0]['numero'] : '', 'base' => ($all[0]['rep_client'] ?? '') ?: ('Client ' . ($params['client_nom'] ?: ($all[0]['client'] ?? '')))];
        foreach ($all as $c) foreach (Format::emails($c['client_email'], 'E-mails du contact client', 4) as $e) $sources[] = ['email' => $e, 'contrat' => $c['numero'], 'base' => $c['rep_client'] ?: ('Client ' . ($c['client'] ?: $c['numero']))];
        $rang = [];
        foreach ($sources as $src) {
            if (isset($existing[$src['email']])) continue;
            $rang[$src['base']] = ($rang[$src['base']] ?? 0) + 1;
            try {
                $r = Agents::create($user, ['nom' => $rang[$src['base']] > 1 ? $src['base'] . ' (' . $rang[$src['base']] . ')' : $src['base'], 'email' => $src['email'], 'role' => 'client', 'contrat' => $src['contrat']]);
                $existing[$src['email']] = true;
                $out[] = ['id' => $r['agent']['id'], 'nom' => $r['agent']['nom'], 'email' => $src['email'], 'contrat' => $src['contrat'], 'password' => $r['password']];
            } catch (Throwable $e) { error_log('Compte client non créé (' . $src['email'] . ') : ' . $e->getMessage()); }
        }
        return $out;
    }
    private static function nomDepuisEmail(string $e, string $defaut): string {
        $base = trim(preg_replace('/\d+/', '', preg_replace('/[._\-]+/', ' ', explode('@', $e)[0])));
        return $base !== '' ? preg_replace_callback('/\b([a-zà-ÿ])/u', fn($m) => mb_strtoupper($m[1]), $base) : $defaut;
    }
    public static function ensurePrestataireAccounts(array $user): array {
        $params = Params::get(); $voulus = []; $out = [];
        foreach (Format::emails($params['direction_email'], 'E-mails du responsable pointage', 4) as $e) $voulus[$e] = ['origine' => 'resp', 'droits' => true, 'defaut' => 'Responsable pointage'];
        foreach (Params::parseStaff($params['staff_emails']) as $x) if (!isset($voulus[$x['email']])) $voulus[$x['email']] = ['origine' => 'staff', 'droits' => $x['droits'], 'defaut' => 'Personnel administratif'];
        foreach ($voulus as $e => $v) {
            $role = $v['droits'] ? 'chef' : 'client'; $portee = $v['droits'] ? 'tous' : ''; $ex = null;
            foreach (Agents::list() as $a) if (mb_strtolower($a['email']) === $e) { $ex = $a; break; }
            if (!$ex) {
                try {
                    $r = Agents::create($user, ['nom' => self::nomDepuisEmail($e, $v['defaut']), 'email' => $e, 'role' => $role, 'contrat' => '']);
                    $all = Agents::list();
                    foreach ($all as &$a) if ($a['id'] === $r['agent']['id']) { $a['origine'] = $v['origine']; $a['portee'] = $portee; $a['acces_exports'] = $v['droits'] ? '1' : '0'; $nom = $a['nom']; $id = $a['id']; }
                    unset($a);
                    Store::writeTable('Agents', $all);
                    $out[] = ['id' => $id, 'nom' => $nom, 'email' => $e, 'role' => $role, 'droits' => $v['droits'], 'password' => $r['password']];
                } catch (Throwable $err) { error_log('Compte prestataire non créé (' . $e . ') : ' . $err->getMessage()); }
            } elseif ($ex['origine'] !== '') {
                $all2 = Agents::list();
                foreach ($all2 as &$b) if ($b['id'] === $ex['id']) { $b['role'] = $role; $b['portee'] = $portee; $b['origine'] = $v['origine']; $b['actif'] = '1'; $b['acces_exports'] = $v['droits'] ? '1' : '0'; if (!$v['droits']) $b['acces_setup'] = '0'; }
                unset($b);
                Store::writeTable('Agents', $all2);
            }
        }
        $all3 = Agents::list(); $change = false;
        foreach ($all3 as &$a) if ($a['origine'] !== '' && $a['actif'] === '1' && !isset($voulus[mb_strtolower($a['email'])])) { $a['actif'] = '0'; $change = true; }
        unset($a);
        if ($change) Store::writeTable('Agents', $all3);
        return $out;
    }
    public static function saveFonctions($list): array {
        $clean = [];
        foreach ((array)($list ?? []) as $f) {
            $nums = array_map(fn($k) => ($f[$k] ?? '') === '' || $f[$k] === null ? 0 : (is_numeric($f[$k]) ? (float)$f[$k] : NAN), ['positions', 'delai', 'prix_unitaire', 'qte_precedente_ref']);
            foreach ($nums as $n) if (is_nan($n) || $n < 0) throw httpErr('Valeurs numériques invalides pour « ' . ($f['designation'] ?? '') . ' »');
            if (trim((string)($f['designation'] ?? '')) === '' || trim((string)($f['contrat'] ?? '')) === '') throw httpErr('Contrat et désignation obligatoires');
            $clean[] = ['contrat' => $f['contrat'], 'designation' => trim((string)$f['designation']), 'libelle' => trim((string)($f['libelle'] ?? '')), 'positions' => Format::num($nums[0]), 'delai' => Format::num($nums[1]), 'prix_unitaire' => Format::num($nums[2]), 'qte_precedente_ref' => Format::num($nums[3]), 'nature' => ($f['nature'] ?? '') === 'vehicule' ? 'vehicule' : 'personne'];
        }
        Store::writeTable('Fonctions', $clean);
        return $clean;
    }
    public static function saveOverride(array $o): void {
        $all = array_values(array_filter(Store::readTable('Attachements'), fn($x) => !($x['contrat'] === ($o['contrat'] ?? '') && $x['mois'] === ($o['mois'] ?? '') && $x['designation'] === ($o['designation'] ?? ''))));
        if (($o['qte_mois'] ?? '') !== '' && $o['qte_mois'] !== null) {
            if (!is_numeric($o['qte_mois']) || (float)$o['qte_mois'] < 0) throw httpErr('Quantité invalide');
            $all[] = ['contrat' => $o['contrat'], 'mois' => $o['mois'], 'designation' => $o['designation'], 'qte_mois' => (string)Format::num($o['qte_mois'])];
        }
        Store::writeTable('Attachements', $all);
    }
    public static function besoin($positions, array $params, string $nature) {
        $nT = (float)$params['jours_travail']; $nR = (float)$params['jours_repos'];
        if ($nature === 'vehicule') return Format::num($positions);
        return $nT > 0 ? (int)ceil((float)$positions * ($nT + $nR) / $nT - 1e-9) : Format::num($positions);
    }
    private static function natureOf(array $f): string { return ($f['nature'] ?? '') === 'vehicule' ? 'vehicule' : 'personne'; }
    private static function typeOf(array $a): string { return ($a['type'] ?? '') === 'vehicule' ? 'vehicule' : 'personne'; }
    private static function sameFonction(array $f, $label): bool { $n = Format::norm($label); return $n !== '' && (Format::norm($f['libelle']) === $n || Format::norm($f['designation']) === $n); }
    private static function activeStaff(array $agents): array { return array_values(array_filter($agents, fn($a) => $a['actif'] === '1' && Agents::isPerson($a))); }
    public static function effectifs(): array {
        $params = Params::get(); $staff = self::activeStaff(Agents::list()); $funcs = self::fonctions();
        return ['strict' => $params['contrat_strict'] === '1', 'rotation' => ['travail' => (int)$params['jours_travail'], 'repos' => (int)$params['jours_repos']],
            'contrats' => array_map(function ($c) use ($funcs, $params, $staff) {
                return ['numero' => $c['numero'], 'client' => $c['client'], 'fonctions' => array_map(function ($f) use ($params, $staff, $c) {
                    $nat = self::natureOf($f);
                    return ['libelle' => $f['libelle'] ?: $f['designation'], 'designation' => $f['designation'], 'nature' => $nat, 'positions' => Format::num($f['positions']), 'besoin' => self::besoin($f['positions'], $params, $nat), 'affectes' => count(array_filter($staff, fn($a) => $a['contrat'] === $c['numero'] && self::typeOf($a) === $nat && self::sameFonction($f, $a['fonction'])))];
                }, array_values(array_filter($funcs, fn($f) => $f['contrat'] === $c['numero'])))];
            }, self::contrats())];
    }
    /** Contrôle l'affectation : la fonction doit être prévue au contrat, dans la limite des postes. Retourne le libellé canonique. */
    public static function checkAffectation(array $a, $excludeId, ?array $pool = null): string {
        if (($a['contrat'] ?? '') === '' || !Agents::isPerson($a + ['origine' => '', 'role' => $a['role'] ?? 'agent'])) return $a['fonction'] ?? '';
        $type = self::typeOf($a);
        $all = array_values(array_filter(self::fonctions(), fn($f) => $f['contrat'] === $a['contrat']));
        if (!$all) return $a['fonction'];
        $funcs = array_values(array_filter($all, fn($f) => self::natureOf($f) === $type));
        if (!$funcs) throw httpErr('Le contrat ' . $a['contrat'] . ' ne prévoit aucun ' . ($type === 'vehicule' ? 'véhicule' : 'poste de personnel') . '.');
        $f = null; foreach ($funcs as $x) if (self::sameFonction($x, $a['fonction'])) { $f = $x; break; }
        $liste = implode(', ', array_map(fn($x) => $x['libelle'] ?: $x['designation'], $funcs));
        if (!$f) throw httpErr($a['fonction'] !== '' ? ($type === 'vehicule' ? 'Véhicule' : 'Fonction') . ' « ' . $a['fonction'] . ' » non prévu' . ($type === 'vehicule' ? '' : 'e') . ' au contrat ' . $a['contrat'] . '. Prévus au contrat : ' . $liste . '.' : 'Choisissez ' . ($type === 'vehicule' ? 'un véhicule' : 'une fonction') . ' prévu' . ($type === 'vehicule' ? '' : 'e') . ' au contrat ' . $a['contrat'] . ' (' . $liste . ').');
        $params = Params::get();
        if ($params['contrat_strict'] === '1' && (float)$f['positions'] > 0) {
            $cap = self::besoin($f['positions'], $params, $type);
            $deja = count(array_filter(self::activeStaff($pool ?? Agents::list()), fn($x) => $x['id'] !== $excludeId && $x['contrat'] === $a['contrat'] && self::typeOf($x) === $type && self::sameFonction($f, $x['fonction'])));
            if ($deja + 1 > $cap) throw httpErr('Effectif complet pour « ' . ($f['libelle'] ?: $f['designation']) . ' » : ' . ($type === 'vehicule' ? Format::num($f['positions']) . ' véhicule(s) au contrat (déjà ' . $deja . ')' : Format::num($f['positions']) . ' poste(s) au contrat = ' . $cap . ' personne(s) en rotation ' . $params['jours_travail'] . '/' . $params['jours_repos'] . ' (déjà ' . $deja . ')') . '. Désactivez-en un ou assouplissez la règle dans Setup.');
        }
        return $f['libelle'] ?: $f['designation'];
    }
    private static function historique(array $c, array $lignes, array $mine, string $prochain, bool $isAdmin, bool $money): array {
        $snaps = [];
        foreach (array_reverse($mine) as $v) { $l = json_decode($v['lignes'], true); $snaps[] = ['mois' => $v['mois'], 'numero' => $v['numero'], 'statut' => $v['statut'], 'lines' => is_array($l) ? $l : [], 'indicatif' => false]; }
        if ($isAdmin && !array_filter($snaps, fn($x) => $x['mois'] === $prochain)) {
            try { $d = DocData::attachementData($prochain, $c['numero']); $snaps[] = ['mois' => $prochain, 'numero' => $d['numero'], 'statut' => 'brouillon', 'lines' => $d['lines'], 'indicatif' => true]; } catch (Throwable $e) { /* pas de brouillon possible */ }
        }
        return array_map(function ($l) use ($snaps, $money) {
            $mois = [];
            foreach ($snaps as $x) {
                $ln = null; foreach ($x['lines'] as $y) if ($y['designation'] === $l['designation']) { $ln = $y; break; }
                if (!$ln) continue;
                $o = ['mois' => $x['mois'], 'numero' => $x['numero'], 'statut' => $x['statut'], 'indicatif' => $x['indicatif'], 'precedente' => Format::num($ln['precedente']), 'du_mois' => Format::num($ln['mois']), 'cumulee' => Format::num($ln['cumulee']), 'reste' => Format::num(max(0, $l['quantite_contrat'] - (float)$ln['cumulee']))];
                if ($money) $o['montant'] = Format::num($ln['montant']);
                $mois[] = $o;
            }
            return ['designation' => $l['designation'], 'quantite_contrat' => $l['quantite_contrat'], 'mois' => $mois];
        }, $lignes);
    }
    public static function synthese(bool $isAdmin, bool $money, $scope): array {
        $params = Params::get(); $staff = self::activeStaff(Agents::list()); $funcs = self::fonctions(); $vals = Store::readTable('AttachementsValides'); $out = [];
        foreach (self::contrats() as $c) {
            if ($scope && $c['numero'] !== $scope) continue;
            $mine = array_values(array_filter($vals, fn($v) => $v['contrat'] === $c['numero'])); usort($mine, fn($a, $b) => strcmp($b['mois'], $a['mois']));
            $last = $mine[0] ?? null; $lastLines = $last ? (json_decode($last['lignes'], true) ?: []) : []; $total = 0.0; $lignes = [];
            foreach (array_filter($funcs, fn($f) => $f['contrat'] === $c['numero']) as $f) {
                $nat = self::natureOf($f); $b = self::besoin($f['positions'], $params, $nat);
                $membres = array_values(array_map(fn($a) => ['id' => $a['id'], 'nom' => $a['nom']], array_filter($staff, fn($a) => $a['contrat'] === $c['numero'] && self::typeOf($a) === $nat && self::sameFonction($f, $a['fonction']))));
                $qteContrat = (float)$f['positions'] * (float)$f['delai']; $lastLine = null;
                foreach ($lastLines as $l) if ($l['designation'] === $f['designation']) { $lastLine = $l; break; }
                $facture = $lastLine ? (float)$lastLine['cumulee'] : (float)($f['qte_precedente_ref'] ?: 0);
                $montant = $qteContrat * (float)$f['prix_unitaire']; $total += $montant;
                $l = ['designation' => $f['designation'], 'libelle' => $f['libelle'] ?: $f['designation'], 'nature' => $nat, 'positions' => Format::num($f['positions']), 'delai' => Format::num($f['delai']), 'quantite_contrat' => Format::num($qteContrat), 'besoin' => $b, 'affectes' => count($membres), 'membres' => $membres, 'quantite_facturee' => Format::num($facture), 'reste_a_facturer' => Format::num(max(0, $qteContrat - $facture))];
                if ($money) { $l['prix_unitaire'] = Format::num($f['prix_unitaire']); $l['montant_contrat'] = Format::num($montant); $l['montant_facture'] = Format::num($facture * (float)$f['prix_unitaire']); }
                $lignes[] = $l;
            }
            $o = ['numero' => $c['numero'], 'client' => $c['client'], 'objet' => $c['objet'], 'date_contrat' => $c['date_contrat'], 'date_debut' => $c['date_debut'], 'duree_mois' => $c['duree_mois'], 'date_fin' => self::dateFin($c['date_debut'], $c['duree_mois']), 'ref_mois' => $c['ref_mois'], 'ref_attachement' => $c['ref_attachement'], 'lignes' => $lignes,
                'prochain' => $last ? Dates::addMonths($last['mois'], 1) : DocData::refMonth($c, substr(Dates::today(), 0, 7)),
                'attachements' => array_map(function ($v) use ($money) { $x = ['mois' => $v['mois'], 'numero' => $v['numero'], 'statut' => $v['statut'], 'valide_par' => $v['valide_par'], 'date_validation' => $v['date_validation'], 'facture_numero' => $v['facture_numero'], 'facture_date' => $v['facture_date']]; if ($money) $x['total_ht'] = Format::num($v['total_ht']); return $x; }, $mine)];
            $o['historique'] = self::historique($c, $lignes, $mine, $o['prochain'], $isAdmin, $money);
            if ($money) $o['montant_contrat'] = Format::num($total);
            $out[] = $o;
        }
        return $out;
    }
}
