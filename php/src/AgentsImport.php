<?php
/**
 * Import d'agents depuis un fichier Excel ou CSV (« Fiche RH des agents ») — administrateur seulement. Miroir de appscript/AgentsImport.gs.
 * La fiche RH est confidentielle : table FichesRH, lue et écrite par l'administrateur seulement.
 */
final class AgentsImport {
    const FICHE = ['nom_ar', 'prenom_ar', 'telephone', 'date_naissance', 'lieu_naissance', 'pere', 'mere', 'adresse', 'nin', 'nss', 'ccp', 'situation'];
    const LIBELLES = ['nom' => 'Nom et prénom', 'prenom' => 'Prénom', 'email' => 'E-mail', 'fonction' => 'Fonction', 'affectation' => 'Affectation', 'date_entree' => "Date d'entrée", 'nom_ar' => 'Nom (arabe)', 'prenom_ar' => 'Prénom (arabe)', 'telephone' => 'Téléphone',
        'date_naissance' => 'Date de naissance', 'lieu_naissance' => 'Lieu de naissance', 'pere' => 'Père', 'mere' => 'Mère', 'adresse' => 'Adresse', 'nin' => "N° carte d'identité / NIN", 'nss' => 'N° sécurité sociale (CNAS)', 'ccp' => 'N° CCP / RIB', 'situation' => 'Situation familiale'];

    public static function classer($h): string {
        $t = Format::norm($h); if ($t === '') return '';
        if (preg_match('/arabe/', $t)) return preg_match('/prenom/', $t) ? 'prenom_ar' : (preg_match('/nom/', $t) ? 'nom_ar' : '');
        if (preg_match('/date.*naissance|ne\(?e?\)? le/', $t)) return 'date_naissance';
        if (preg_match('/lieu.*naissance/', $t)) return 'lieu_naissance';
        if (preg_match('/date.*(entree|recrutement|embauche)/', $t)) return 'date_entree';
        if (preg_match('/securite sociale|cnas|\bnss\b|assure/', $t)) return 'nss';
        if (preg_match('/identite|\bnin\b|\bcni\b/', $t)) return 'nin';
        if (preg_match('/\bccp\b|\brib\b|compte/', $t)) return 'ccp';
        if (preg_match('/mail|courriel/', $t)) return 'email';
        if (preg_match('/tel|mobile|portable/', $t)) return 'telephone';
        if (preg_match('/situation/', $t)) return 'situation';
        if (preg_match('/^pere|nom du pere|fils de/', $t)) return 'pere';
        if (preg_match('/^mere|nom de la mere/', $t)) return 'mere';
        if (preg_match('/adresse|domicile/', $t)) return 'adresse';
        if (preg_match('/fonction|poste|metier|qualification/', $t)) return 'fonction';
        if (preg_match('/affectation|site|chantier/', $t)) return 'affectation';
        if (preg_match('/^prenoms?$/', $t)) return 'prenom';
        if (preg_match('/nom/', $t)) return 'nom';
        return '';
    }
    private static function texte($v): string { return mb_substr(trim(preg_replace('/\s+/u', ' ', preg_replace('/[\x{0000}-\x{001f}]+/u', ' ', (string)($v ?? '')))), 0, 200); }
    public static function dateIso($v): string {
        $s = self::texte($v); if ($s === '') return '';
        if (preg_match('/^\d{4,5}(\.\d+)?$/', $s) && (float)$s > 3000 && (float)$s < 80000) return gmdate('Y-m-d', gmmktime(0, 0, 0, 12, 30, 1899) + (int)round((float)$s) * 86400);
        if (preg_match('/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/', $s, $m)) $s = $m[3] . '-' . str_pad($m[2], 2, '0', STR_PAD_LEFT) . '-' . str_pad($m[1], 2, '0', STR_PAD_LEFT);
        return Dates::isDate(substr($s, 0, 10)) ? substr($s, 0, 10) : '';
    }
    private static function lire(array $o): array {
        $name = (string)($o['nom'] ?? 'agents'); $ext = preg_match('/\.([a-z0-9]+)$/i', $name, $m) ? strtolower($m[1]) : '';
        $bytes = base64_decode((string)($o['base64'] ?? ''), true);
        if ($bytes === false || $bytes === '') throw httpErr('Fichier vide');
        if (strlen($bytes) > CFG()['MAX_UPLOAD_BYTES']) throw httpErr('Fichier trop volumineux (10 Mo maximum)');
        if ($ext === 'csv') {
            $text = preg_replace('/^\x{feff}/u', '', mb_convert_encoding($bytes, 'UTF-8', 'UTF-8, Windows-1252'));
            $sep = strpos($text, ';') !== false ? ';' : (strpos($text, "\t") !== false ? "\t" : ',');
            return [['name' => $name, 'rows' => array_map(fn($l) => array_map(fn($c) => preg_replace('/^"|"$/', '', $c), explode($sep, $l)), preg_split('/\r?\n/', $text))]];
        }
        if ($ext !== 'xlsx') throw httpErr($ext === 'xls' ? 'Ancien format Excel (.xls) : enregistrez le fichier au format .xlsx ou CSV' : 'Format non pris en charge (Excel .xlsx ou CSV)');
        return XlsxReader::sheets($bytes);
    }
    private static function entete(array $rows): ?array {
        for ($i = 0; $i < min(count($rows), 15); $i++) {
            $map = []; foreach ($rows[$i] as $k => $c) { $t = self::classer($c); if ($t !== '' && !isset($map[$t])) $map[$t] = $k; }
            if (isset($map['nom']) && count($map) >= 3) return ['ligne' => $i, 'map' => $map];
        }
        return null;
    }
    private static function mots($s): array { $out = []; foreach (explode(' ', preg_replace('/[^a-z0-9 ]/', ' ', Format::norm($s))) as $w) if (strlen($w) >= 3) $out[] = preg_replace('/s$/', '', $w); return $out; }
    public static function proposerFonction($libelle, array $funcs): string {
        $a = self::mots($libelle); if (!$a) return ''; $best = null;
        foreach ($funcs as $f) {
            $nom = ($f['libelle'] ?? '') ?: $f['designation']; $b = self::mots($nom . ' ' . $f['designation']); if (!$b) continue;
            $communs = count(array_filter($a, fn($w) => in_array($w, $b, true))); $score = $communs / max(count($a), count(self::mots($nom)) ?: 1);
            if (Format::norm($nom) === Format::norm($libelle)) $score = 2;
            if ($communs && (!$best || $score > $best['score'])) $best = ['nom' => $nom, 'score' => $score];
        }
        return $best && $best['score'] >= 0.5 ? $best['nom'] : '';
    }
    private static function fonctionsDe(string $contrat): array { return array_values(array_filter(Contrats::fonctions(), fn($f) => $f['contrat'] === $contrat && ($f['nature'] ?? '') !== 'vehicule')); }

    public static function analyser(array $user, ?array $o): array {
        $o = $o ?? []; $onglets = self::lire($o); $trouve = null; $feuille = '';
        foreach ($onglets as $s) { if (!$trouve) { $e = self::entete($s['rows']); if ($e) { $trouve = ['e' => $e, 'rows' => $s['rows']]; $feuille = $s['name']; } } }
        if (!$trouve) throw httpErr("Aucun tableau d'agents reconnu : il faut une ligne d'en-tête avec « Nom et prénom » et au moins deux autres colonnes (e-mail, fonction, téléphone…)");
        $map = $trouve['e']['map']; $enTete = $trouve['rows'][$trouve['e']['ligne']];
        $contrat = self::texte($o['contrat'] ?? ''); $funcs = $contrat !== '' ? self::fonctionsDe($contrat) : [];
        $parMail = []; $parNom = []; foreach (Agents::list() as $a) { if ($a['email'] !== '') $parMail[strtolower($a['email'])] = $a; $parNom[Format::norm($a['nom'])] = $a; }
        $vus = []; $lignes = [];
        foreach (array_slice($trouve['rows'], $trouve['e']['ligne'] + 1) as $i => $r) {
            $val = fn($k) => isset($map[$k]) ? ($r[$map[$k]] ?? '') : '';
            $nom = self::texte($val('nom')); if (isset($map['prenom']) && self::texte($val('prenom')) !== '') $nom = trim($nom . ' ' . self::texte($val('prenom')));
            if ($nom === '' || !preg_match('/[A-Za-zÀ-ÿ\x{0600}-\x{06ff}]{2}/u', $nom)) continue;
            $email = mb_strtolower(self::texte($val('email'))); $fiche = [];
            foreach (self::FICHE as $k) $fiche[$k] = $k === 'date_naissance' ? self::dateIso($val($k)) : self::texte($val($k));
            $l = ['ligne' => $trouve['e']['ligne'] + 2 + $i, 'nom' => $nom, 'email' => $email, 'fonction_lue' => self::texte($val('fonction')), 'affectation' => self::texte($val('affectation')), 'date_entree' => self::dateIso($val('date_entree')), 'fiche' => $fiche, 'etat' => 'nouveau', 'message' => '', 'agent_id' => ''];
            $l['fonction'] = $contrat !== '' ? self::proposerFonction($l['fonction_lue'], $funcs) : $l['fonction_lue'];
            $ex = ($email !== '' && isset($parMail[$email])) ? $parMail[$email] : ($parNom[Format::norm($nom)] ?? null);
            $memeNom = function ($x) use ($nom) { $t = explode(' ', Format::norm($x['nom'])); foreach (explode(' ', Format::norm($nom)) as $w) if (strlen($w) >= 4 && in_array($w, $t, true)) return true; return false; };
            if ($ex && !$memeNom($ex)) { $l['etat'] = 'erreur'; $l['message'] = 'Cette adresse e-mail appartient déjà à ' . $ex['nom'] . '.'; }
            elseif ($ex) { $l['etat'] = 'existant'; $l['agent_id'] = $ex['id']; $l['message'] = 'Déjà dans Sijil (' . $ex['nom'] . ') : seule sa fiche RH sera complétée.'; }
            elseif (!preg_match('/^\S+@\S+\.\S+$/', $email)) { $l['etat'] = 'erreur'; $l['message'] = "Adresse e-mail absente ou invalide : elle sert d'identifiant."; }
            elseif (isset($vus[$email])) { $l['etat'] = 'erreur'; $l['message'] = 'Adresse e-mail en double dans le fichier (ligne ' . $vus[$email] . ').'; }
            elseif ($contrat !== '' && $funcs && $l['fonction'] === '') $l['message'] = 'Fonction « ' . $l['fonction_lue'] . ' » non trouvée au contrat : choisissez-la.';
            if ($email !== '' && !isset($vus[$email])) $vus[$email] = $l['ligne'];
            if (isset($map['date_naissance']) && self::texte($val('date_naissance')) !== '' && $fiche['date_naissance'] === '') $l['message'] = trim($l['message'] . ' Date de naissance illisible.');
            $lignes[] = $l;
        }
        if (!$lignes) throw httpErr('Aucun agent dans ce fichier');
        if (count($lignes) > 300) throw httpErr('300 agents au maximum par fichier');
        $reconnues = []; foreach ($map as $k => $col) $reconnues[] = ['cle' => $k, 'libelle' => self::LIBELLES[$k], 'entete' => self::texte($enTete[$col] ?? '')];
        $ignorees = []; foreach ($enTete as $k => $h) { $h = self::texte($h); if ($h !== '' && !in_array($k, $map, true) && !preg_match('/^n[°o]?$/iu', $h)) $ignorees[] = $h; }
        $n = fn($e) => count(array_filter($lignes, fn($l) => $l['etat'] === $e));
        return ['feuille' => $feuille, 'autres_feuilles' => array_values(array_filter(array_map(fn($s) => $s['name'], $onglets), fn($x) => $x !== $feuille)), 'colonnes' => $reconnues, 'ignorees' => $ignorees, 'lignes' => $lignes, 'contrat' => $contrat,
            'fonctions' => array_map(fn($f) => ($f['libelle'] ?? '') ?: $f['designation'], $funcs), 'nouveaux' => $n('nouveau'), 'existants' => $n('existant'), 'erreurs' => $n('erreur')];
    }

    private static function exiger(array $user): void { if (($user['role'] ?? '') !== 'admin') throw httpErr("Réservé à l'administrateur", 'FORBIDDEN'); }
    private static function nettoyer($f): array { $o = []; foreach (self::FICHE as $k) $o[$k] = $k === 'date_naissance' ? self::dateIso($f[$k] ?? '') : self::texte($f[$k] ?? ''); return $o; }
    public static function ficheGet(array $user, $agentId): array {
        self::exiger($user); if (!Agents::get($agentId)) throw httpErr('Agent introuvable');
        $f = null; foreach (Store::readTable('FichesRH') as $x) if ($x['agent_id'] === $agentId) $f = $x;
        $o = self::nettoyer($f ?? []); $o['agent_id'] = $agentId; $o['maj_le'] = $f['maj_le'] ?? ''; $o['maj_par'] = $f['maj_par'] ?? '';
        return $o;
    }
    private static function ecrire(array &$all, array $user, $agentId, $fiche, bool $completer): void {
        $f = self::nettoyer(is_array($fiche) ? $fiche : []); $i = null; foreach ($all as $k => $x) if ($x['agent_id'] === $agentId) $i = $k;
        if ($i === null) { $all[] = ['agent_id' => $agentId]; $i = array_key_last($all); $completer = false; }
        foreach (self::FICHE as $k) if (!$completer || ($all[$i][$k] ?? '') === '') $all[$i][$k] = $f[$k];
        $all[$i]['maj_le'] = nowIso(); $all[$i]['maj_par'] = $user['nom'] ?? '';
    }
    public static function ficheSave(array $user, $agentId, $fiche): array {
        self::exiger($user); if (!Agents::get($agentId)) throw httpErr('Agent introuvable');
        $all = Store::readTable('FichesRH'); self::ecrire($all, $user, $agentId, $fiche, false); Store::writeTable('FichesRH', $all);
        return self::ficheGet($user, $agentId);
    }
    public static function appliquer(array $user, ?array $o): array {
        self::exiger($user); $o = $o ?? []; $lignes = is_array($o['lignes'] ?? null) ? $o['lignes'] : [];
        if (!$lignes) throw httpErr('Aucun agent à importer');
        if (count($lignes) > 300) throw httpErr('300 agents au maximum par fichier');
        $contrat = self::texte($o['contrat'] ?? ''); $fiches = Store::readTable('FichesRH'); $crees = []; $completes = 0; $erreurs = [];
        foreach ($lignes as $l) {
            $nom = self::texte($l['nom'] ?? '');
            try {
                if (!empty($l['agent_id'])) { if (!Agents::get($l['agent_id'])) throw httpErr('Agent introuvable'); self::ecrire($fiches, $user, $l['agent_id'], $l['fiche'] ?? [], true); $completes++; continue; }
                $r = Agents::create($user, ['nom' => $nom, 'email' => self::texte($l['email'] ?? ''), 'role' => 'agent', 'fonction' => self::texte($l['fonction'] ?? ''), 'contrat' => $contrat, 'affectation' => self::texte($l['affectation'] ?? ''), 'chef_id' => self::texte($o['chef_id'] ?? ''), 'date_entree' => self::dateIso($l['date_entree'] ?? '')]);
                self::ecrire($fiches, $user, $r['agent']['id'], $l['fiche'] ?? [], false);
                $crees[] = ['id' => $r['agent']['id'], 'nom' => $r['agent']['nom'], 'email' => $r['agent']['email'], 'password' => $r['password'], 'mail' => ''];
            } catch (Throwable $e) { $erreurs[] = ['nom' => $nom, 'message' => $e->getMessage()]; }
        }
        Store::writeTable('FichesRH', $fiches);
        if (!empty($o['envoyer'])) foreach ($crees as &$c) { try { Agents::sendAccess($user, $c['id'], $c['password']); $c['mail'] = 'envoyé'; } catch (Throwable $e) { $c['mail'] = 'non envoyé : ' . $e->getMessage(); } } unset($c);
        return ['crees' => $crees, 'completes' => $completes, 'erreurs' => $erreurs];
    }
}
