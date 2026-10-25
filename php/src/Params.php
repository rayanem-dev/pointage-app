<?php
/** Paramètres modifiables dans l'onglet Setup. Valeurs par défaut neutres : l'application est une coquille vide. */
final class Params {
    const LOGO_MAX = 1500000;
    public static function defs(): array {
        static $d = null; if ($d) return $d;
        $t = fn($key, $label, $group, $type, $def = '', $x = []) => array_merge(['key' => $key, 'label' => $label, 'group' => $group, 'type' => $type, 'def' => $def], $x);
        $P = 'Prestataire';
        return $d = [
            $t('prestataire_nom', "Prestataire (société qui utilise l'application)", $P, 'text'),
            $t('prestataire_adresse', 'Adresse', $P, 'area'), $t('prestataire_activite', 'Activité', $P, 'text'), $t('prestataire_capital', 'Capital social', $P, 'text'),
            $t('prestataire_rc', 'RC N°', $P, 'text'), $t('prestataire_nis', 'NIS N°', $P, 'text'), $t('prestataire_nif', 'NIF N°', $P, 'text'), $t('prestataire_ai', 'A.I N°', $P, 'text'),
            $t('prestataire_rib', 'RIB N°', $P, 'text'), $t('prestataire_banque', 'Banque', $P, 'text'), $t('prestataire_contact', 'Tél / Fax / Email', $P, 'text'), $t('prestataire_ville', 'Ville (« Fait à »)', $P, 'text'),
            $t('logo_prestataire_id', 'Logo du prestataire', $P, 'logo'),
            $t('jours_travail', 'Jours de travail par shift', 'Rotation', 'number', '28'), $t('jours_repos', 'Jours de repos / récupération par shift', 'Rotation', 'number', '28'),
            $t('feries_perso', "Jours fériés : ajouts et corrections (une ligne par jour : « 2027-03-10 Aïd el-Fitr » ajoute, « - 2027-03-10 » retire). Les fêtes nationales sont fixes ; les fêtes religieuses sont estimées (écart possible d'un jour selon la lune).", 'Rotation', 'area'),
            $t('contrat_strict', 'Limiter les effectifs aux postes prévus au contrat (postes × (travail + repos) ÷ travail)', 'Rotation', 'bool', '1'),
            $t('attachement_pointage', "Quantité du mois de l'attachement = jours T réellement pointés (sinon : base du contrat, nombre × jours du mois)", 'Attachement', 'bool', '1'),
            $t('couleur_T', 'Couleur T (travail)', 'Couleurs', 'color', '#4EA72E'), $t('couleur_R', 'Couleur R (repos / congé)', 'Couleurs', 'color', '#E97132'), $t('couleur_ABS', 'Couleur ABS (absence)', 'Couleurs', 'color', '#E53935'),
            $t('couleur_T_prevu', 'Couleur T prévu', 'Couleurs', 'color', '#D6F0CC'), $t('couleur_R_prevu', 'Couleur R prévu', 'Couleurs', 'color', '#FBDCC8'),
            $t('direction_nom', 'Ancien nom (non utilisé)', 'Responsable pointage (prestataire)', 'hidden'),
            $t('direction_email', 'Responsable pointage (2 cases)', 'Responsable pointage (prestataire)', 'emails', '', ['n' => 2, 'hint' => 'Destinataires des demandes des agents. Un compte avec les droits de responsable pointage est créé pour chaque adresse ; les demandes groupées leur sont envoyées.']),
            $t('staff_emails', 'Personnel administratif du prestataire (4 au maximum)', 'Personnel administratif (prestataire)', 'staff', '', ['hint' => 'Un compte est créé par adresse. Par défaut : consultation seule. Case cochée : mêmes droits que le responsable pointage (pointer les agents, traiter les demandes).']),
            $t('client_nom', 'Client (société cliente du contrat)', 'Client', 'text'), $t('client_entete', 'En-tête client (fiche de pointage, une ligne par ligne)', 'Client', 'area'),
            $t('client_adresse_facture', 'Adresse de facturation (« DOIT »)', 'Client', 'area'), $t('logo_client_id', 'Logo du client', 'Client', 'logo'),
            $t('signature_client', 'Signature client (fiche de pointage)', 'Client', 'text'),
            $t('client_emails', 'E-mails du contact client (4 au maximum ; un compte de consultation est créé par adresse)', 'Client', 'emails'),
            $t('types_demande', 'Types de demande (réglés dans Setup → Demandes)', 'Demandes', 'hidden'),
            $t('signature_prestataire', 'Signature prestataire (fiche de pointage)', 'Prestataire', 'text'),
        ];
    }
    public static function defaults(): array { $o = []; foreach (self::defs() as $d) $o[$d['key']] = $d['def']; return $o; }
    public static function get(): array {
        $out = self::defaults();
        foreach (Store::readTable('Params') as $r) $out[$r['cle']] = $r['valeur'];
        return $out;
    }
    public static function parseStaff($v): array {
        $out = []; $seen = [];
        foreach (preg_split('/[\s,;]+/', (string)($v ?? '')) ?: [] as $t) {
            if ($t === '') continue;
            $p = explode('|', $t); $e = Format::emails($p[0], 'Personnel administratif', 1)[0] ?? null;
            if ($e && !isset($seen[$e])) { $seen[$e] = 1; $out[] = ['email' => $e, 'droits' => ($p[1] ?? '') === '1']; }
        }
        if (count($out) > 4) throw httpErr('Personnel administratif : 4 adresses au maximum');
        return $out;
    }
    public static function set(?array $values): array {
        $cur = self::get();
        foreach ($values ?? [] as $k => $v) {
            $def = null; foreach (self::defs() as $d) if ($d['key'] === $k) { $def = $d; break; }
            if (!$def) continue;
            $s = is_bool($v) ? ($v ? '1' : '0') : (string)($v ?? '');
            if ($def['type'] === 'number' && !((float)$s >= 1 && fmod((float)$s, 1) == 0.0)) throw httpErr($def['label'] . ' : entier ≥ 1 attendu');
            if ($def['type'] === 'emails') $s = implode(', ', Format::emails($s, $k === 'client_emails' ? 'E-mails du contact client' : 'E-mails du responsable pointage', 4));
            if ($def['type'] === 'staff') $s = implode(', ', array_map(fn($x) => $x['email'] . '|' . ($x['droits'] ? '1' : '0'), self::parseStaff($s)));
            if ($def['type'] === 'bool') $s = ($v === true || $s === '1' || $s === 'true') ? '1' : '0';
            if ($def['type'] === 'color' && !preg_match('/^#[0-9a-fA-F]{6}$/', $s)) throw httpErr($def['label'] . ' : couleur #RRGGBB attendue');
            $cur[$k] = $s;
        }
        $rows = []; foreach ($cur as $k => $v) $rows[] = ['cle' => $k, 'valeur' => $v];
        Store::writeTable('Params', $rows);
        return $cur;
    }
    private static function logoKey($qui): string { if ($qui !== 'prestataire' && $qui !== 'client') throw httpErr('Logo inconnu'); return 'logo_' . $qui . '_id'; }
    public static function logoUpload(array $o): array {
        $key = self::logoKey($o['qui'] ?? '');
        if (empty($o['base64'])) throw httpErr('Fichier manquant');
        $mime = (string)($o['mime'] ?? '');
        if (!in_array($mime, ['image/png', 'image/jpeg', 'image/gif'], true)) throw httpErr('Format non pris en charge (PNG, JPG ou GIF)');
        $bytes = base64_decode((string)$o['base64'], true);
        if ($bytes === false) throw httpErr('Fichier manquant');
        if (strlen($bytes) > self::LOGO_MAX) throw httpErr('Logo trop volumineux (1,5 Mo maximum)');
        $hex = bin2hex(substr($bytes, 0, 4));
        $okSig = $mime === 'image/png' ? $hex === '89504e47' : ($mime === 'image/gif' ? strpos($hex, '47494638') === 0 : substr($hex, 0, 4) === 'ffd8');
        if (!$okSig) throw httpErr("Le fichier n'est pas une image valide");
        $ext = $mime === 'image/png' ? 'png' : ($mime === 'image/gif' ? 'gif' : 'jpg');
        $id = Files::put('logo_' . $o['qui'] . '.' . $ext, $mime, $bytes);
        $old = self::get()[$key]; self::set([$key => $id]); Files::delete($old);
        return ['id' => $id, 'apercu' => 'data:' . $mime . ';base64,' . base64_encode($bytes)];
    }
    public static function logoRemove($qui): bool { $key = self::logoKey($qui); $old = self::get()[$key]; self::set([$key => '']); Files::delete($old); return true; }
    public static function logoView($qui): array {
        $id = self::get()[self::logoKey($qui)]; if (!$id) return ['apercu' => ''];
        $m = Files::meta($id); $b = Files::bytes($id);
        return $m && $b !== null ? ['apercu' => 'data:' . $m['mime'] . ';base64,' . base64_encode($b)] : ['apercu' => ''];
    }
    public static function pub(array $p): array {
        return ['prestataire' => $p['prestataire_nom'], 'jours_travail' => (int)$p['jours_travail'], 'jours_repos' => (int)$p['jours_repos'],
            'colors' => ['T' => $p['couleur_T'], 'R' => $p['couleur_R'], 'ABS' => $p['couleur_ABS'], 'T_prevu' => $p['couleur_T_prevu'], 'R_prevu' => $p['couleur_R_prevu']]];
    }
    const TABS = ['Prestataire' => 'prestataire', 'Responsable pointage (prestataire)' => 'prestataire', 'Personnel administratif (prestataire)' => 'prestataire', 'Client' => 'client', 'Rotation' => 'rotation', 'Couleurs' => 'rotation', 'Attachement' => 'contrat'];
    public static function defsForClient(): array {
        $out = [];
        foreach (self::defs() as $d) {
            if ($d['type'] === 'hidden') continue;
            $o = ['key' => $d['key'], 'label' => $d['label'], 'group' => $d['group'], 'type' => $d['type']];
            if (isset($d['n'])) $o['n'] = $d['n']; if (isset($d['hint'])) $o['hint'] = $d['hint'];
            $o['tab'] = self::TABS[$d['group']] ?? 'prestataire'; $out[] = $o;
        }
        return $out;
    }
}
