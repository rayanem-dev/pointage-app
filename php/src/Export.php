<?php
/** Exports Excel / PDF : le document est décrit dans une Sheet (comme Export.gs), puis écrit en .xlsx ou en .pdf par nos propres moteurs. */
final class Export {
    const MIME = ['pdf' => 'application/pdf', 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

    private static function buildFiche(Sheet $sh, array $d): void {
        $p = $d['params']; $c = ['T' => $p['couleur_T'], 'R' => $p['couleur_R'], 'ABS' => $p['couleur_ABS'], 'T_prevu' => $p['couleur_T_prevu'], 'R_prevu' => $p['couleur_R_prevu']];
        $w = [190, 150]; for ($i = 0; $i < 31; $i++) $w[] = 26; array_push($w, 10, 42, 42, 42); $sh->widths($w);
        foreach (array_values(array_filter(explode("\n", (string)$p['client_entete']))) as $k => $l) $sh->put(1 + $k, 1, $l, ['size' => 9]);
        $sh->image($p['logo_client_id'], 1, 6, 60); $sh->image($p['logo_prestataire_id'], 1, 31, 60);
        $sh->merged(2, 8, 2, 19, 'FICHE DE POINTAGE', ['bold' => true, 'italic' => true, 'size' => 22, 'align' => 'center']);
        $sh->merged(5, 27, 1, 11, 'Mois de : ' . $d['label'], ['size' => 13, 'align' => 'right']);
        $sh->merged(7, 1, 1, 37, $d['titre'], ['size' => 13, 'align' => 'center']);
        $H = 9; $head = ['Nom Et Prenom', '']; for ($i = 1; $i <= 31; $i++) $head[] = $i; $head = array_merge($head, ['', 'T', 'CR', 'ABS']);
        foreach ($head as $i => $v) $sh->put($H, $i + 1, $v, ['border' => true, 'align' => $i === 0 ? 'left' : 'center'] + ($i === 0 ? ['bold' => true] : []));
        for ($i = 1; $i <= 37; $i++) $sh->put($H + 1, $i, $i === 1 ? 'PERSONNEL' : ($i === 2 ? 'FONCTION' : ''), ['border' => true, 'bg' => '#8EA9DB']);
        $n = count($d['rows']);
        foreach ($d['rows'] as $idx => $r) {
            $row = $H + 2 + $idx;
            $sh->put($row, 1, $r['nom'], ['border' => true]); $sh->put($row, 2, $r['fonction'], ['border' => true]);
            for ($k = 0; $k < 31; $k++) {
                if ($k >= $d['nd']) { $sh->put($row, 3 + $k, '', ['border' => true, 'bg' => '#D9D9D9', 'align' => 'center']); continue; }
                $day = $r['days'][$k]; $st = $day['statut'] ?: $day['prevu'];
                $sh->put($row, 3 + $k, $st, ['border' => true, 'align' => 'center', 'bg' => $day['statut'] ? $c[$day['statut']] : ($day['prevu'] ? $c[$day['prevu'] . '_prevu'] : '#ffffff')]);
            }
            $sh->put($row, 34, '', ['border' => true]);
            $sh->put($row, 35, (int)$r['mois']['T'], ['border' => true, 'align' => 'center']); $sh->put($row, 36, (int)$r['mois']['R'], ['border' => true, 'align' => 'center']); $sh->put($row, 37, (int)$r['mois']['ABS'], ['border' => true, 'align' => 'center']);
        }
        $last = $H + 2 + $n + 1;
        $sh->put($last, 3, 'T', ['bg' => $c['T'], 'border' => true, 'align' => 'center']); $sh->put($last, 4, 'CR', ['bg' => $c['R'], 'border' => true, 'align' => 'center']); $sh->put($last, 5, 'ABS', ['bg' => $c['ABS'], 'border' => true, 'align' => 'center', 'color' => '#ffffff']);
        $sh->put($last + 3, 1, $p['signature_client'] ?: '', ['size' => 11]);
        $sh->put($last + 3, 26, $p['signature_prestataire'] ?: ('le prestataire ' . ($p['prestataire_nom'] ?: '')), ['size' => 11]);
    }
    private static function buildAttachement(Sheet $sh, array $d): void {
        $p = $d['params']; $sh->widths([40, 280, 90, 60, 110, 130, 110, 110, 110]);
        $sh->image($p['logo_prestataire_id'], 1, 1, 60); $sh->image($p['logo_client_id'], 1, 8, 60);
        $sh->merged(2, 1, 1, 9, 'Attachement N° : ' . $d['numero'], ['bold' => true, 'size' => 14, 'align' => 'center']);
        $sh->merged(3, 1, 1, 9, 'Période : Du ' . Dates::frDate($d['debut']) . ' Au ' . Dates::frDate($d['fin']), ['bold' => true, 'underline' => true, 'size' => 13, 'align' => 'center']);
        $sh->merged(4, 8, 1, 2, 'Date : ' . Dates::frDate($d['fin']), ['align' => 'right', 'underline' => true]);
        foreach ([['Client : ', $d['contrat']['client']], ['Contrat : ', 'N° ' . $d['contrat']['numero'] . '.'], ['Objet : ', $d['contrat']['objet']]] as $i => $kv) $sh->merged(6 + $i * 2, 1, 1, 9, $kv[0] . $kv[1], ['bold' => true, 'wrap' => true, 'valign' => 'top']);
        $sh->rowH[10] = 34;
        $H = 12; $head = ['N°', 'Désignation', 'Nombre de Position (a)', 'Unité', 'Délai de Mobilisation (b)', 'Quantité Contrat (c) = (a)*(b)', 'Quantité Précédente', 'Quantité du Mois', 'Quantité Cumulée'];
        foreach ($head as $i => $v) $sh->put($H, $i + 1, $v, ['bold' => true, 'border' => true, 'align' => 'center', 'wrap' => true]);
        $sh->rowH[$H] = 44;
        foreach ($d['lines'] as $i => $l) {
            $r = $H + 1 + $i; $b = ['border' => true, 'align' => 'center'];
            $sh->put($r, 1, (int)$l['n'], $b); $sh->put($r, 2, $l['designation'], ['align' => 'left'] + $b); $sh->put($r, 3, $l['positions'], $b); $sh->put($r, 4, $l['unite'], $b); $sh->put($r, 5, $l['delai'], $b);
            $sh->put($r, 6, $l['positions'] * $l['delai'], $b, "C$r*E$r"); $sh->put($r, 7, $l['precedente'], $b); $sh->put($r, 8, $l['mois'], $b); $sh->put($r, 9, $l['precedente'] + $l['mois'], $b, "G$r+H$r");
        }
        $f = $H + count($d['lines']) + 3;
        $sh->put($f, 1, 'Représentant ' . ($p['prestataire_nom'] ?: 'du prestataire'), ['bold' => true]);
        $sh->put($f, 8, trim('Représentant ' . preg_split('/\s+/', (string)$d['contrat']['client'])[0] . ' ' . $d['contrat']['rep_client']), ['bold' => true]);
        if ($d['rep_prestataire']) $sh->put($f + 5, 1, $d['rep_prestataire'], ['size' => 13]);
    }
    private static function buildFacture(Sheet $sh, array $d): void {
        $p = $d['params']; $sh->landscape = false; $sh->widths([45, 300, 70, 70, 120, 150]);
        $sh->image($p['logo_prestataire_id'], 1, 1, 60);
        $sh->merged(1, 1, 6, 3, ($p['prestataire_nom'] ?: '') . "\n" . ($p['prestataire_adresse'] ?: '') . "\n" . ($p['prestataire_activite'] ?: ''), ['bold' => true, 'wrap' => true]);
        $sh->merged(1, 4, 2, 3, 'Facture N°: ' . $d['facture_numero'], ['bold' => true, 'size' => 14]);
        $sh->merged(3, 4, 4, 3, "DOIT :\n" . ($p['client_adresse_facture'] ?: ''), ['bold' => true, 'wrap' => true, 'valign' => 'top']);
        $legal = implode("\n", ['DIRECTION FINANCES ET COMPTABILITE', 'CAPITAL SOCIAL: ' . $p['prestataire_capital'], 'R C N° : ' . $p['prestataire_rc'], 'NIS N° : ' . $p['prestataire_nis'], 'NIF N° : ' . $p['prestataire_nif'], 'A I N° : ' . $p['prestataire_ai'], 'DOMICILIATION BANCAIRE', 'RIB N° : ' . $p['prestataire_rib'], $p['prestataire_banque'], $p['prestataire_contact']]);
        $sh->merged(8, 1, 6, 3, $legal, ['italic' => true, 'size' => 9, 'wrap' => true, 'valign' => 'top']);
        $sh->merged(8, 4, 1, 3, 'Contrat N°: ' . $d['contrat']['numero'] . ($d['contrat']['date_contrat'] ? ' Du ' . $d['contrat']['date_contrat'] : ''), ['bold' => true]);
        $sh->merged(15, 1, 2, 6, $d['contrat']['objet'], ['italic' => true, 'bold' => true, 'wrap' => true, 'align' => 'center']);
        $sh->put(18, 1, 'Attachement N°: ' . $d['numero'] . ' Du ' . Dates::frDate($d['attachement_date']), ['italic' => true]);
        $sh->put(19, 1, 'Période: Du ' . Dates::frDate($d['debut']) . ' Au ' . Dates::frDate($d['fin']), ['italic' => true]);
        $H = 21; foreach (['N°', 'DESIGNATIONS', 'U/M', 'QTE.', 'P.UNITAIRE', 'MONTANT EN H.T'] as $i => $v) $sh->put($H, $i + 1, $v, ['bold' => true, 'border' => true, 'align' => 'center']);
        $n = count($d['lines']); $sum = 0;
        foreach ($d['lines'] as $i => $l) {
            $r = $H + 1 + $i; $b = ['border' => true, 'align' => 'center']; $m = $l['mois'] * $l['prix_unitaire']; $sum += $m;
            $sh->put($r, 1, $i + 1 < 10 ? '0' . ($i + 1) : (string)($i + 1), $b); $sh->put($r, 2, $l['designation'], ['align' => 'left'] + $b); $sh->put($r, 3, $l['unite'], $b); $sh->put($r, 4, $l['mois'], $b);
            $sh->put($r, 5, (float)$l['prix_unitaire'], ['align' => 'right', 'format' => '#,##0.00'] + $b); $sh->put($r, 6, (float)$m, ['align' => 'right', 'format' => '#,##0.00'] + $b, "D$r*E$r");
        }
        $t = $H + max($n, 4) + 2;
        $sh->merged($t, 1, 1, 5, 'TOTAL EN HORS TAXES...', ['bold' => true, 'italic' => true, 'align' => 'center', 'border' => true]);
        $sh->put($t, 6, (float)$sum, ['bold' => true, 'border' => true, 'format' => '#,##0.00', 'align' => 'right'], $n ? 'SUM(F' . ($H + 1) . ':F' . ($H + $n) . ')' : null);
        $sh->merged($t + 2, 1, 2, 6, 'ARRETEE LA PRESENTE FACTURE A LA SOMME DE: ' . Format::amountInWords($d['totalHT']) . ' EN HORS TAXES.', ['bold' => true, 'wrap' => true]);
        $sh->put($t + 6, 5, 'Fait à: ' . ($p['prestataire_ville'] ?: '') . ', Le : ' . Dates::frDate($d['date']), ['bold' => true]);
        $sh->put($t + 7, 5, 'Direction Finances et Comptabilité', ['bold' => true]);
    }
    public static function render(string $doc, array $data, ?string $format, string $baseName): array {
        $format = $format === 'pdf' ? 'pdf' : 'xlsx';
        $sh = new Sheet(); $sh->name = mb_substr($baseName, 0, 31);
        switch ($doc) { case 'fiche': self::buildFiche($sh, $data); break; case 'attachement': self::buildAttachement($sh, $data); break; case 'facture': self::buildFacture($sh, $data); break; default: throw httpErr('Document inconnu'); }
        $bytes = $format === 'pdf' ? SheetPdf::build($sh) : Xlsx::build([$sh]);
        return ['nom' => preg_replace('/[^\w.-]+/', '_', $baseName) . '.' . $format, 'mime' => self::MIME[$format], 'base64' => base64_encode($bytes)];
    }
    /** Classeur Excel de plusieurs onglets : specs = [['name', 'rows', 'text', 'header']]. */
    public static function renderBook(array $specs, string $baseName): array {
        $sheets = [];
        foreach ($specs as $sp) {
            $sh = new Sheet(); $sh->name = (string)$sp['name']; $sh->gridlines = true;
            foreach ($sp['rows'] as $ri => $row) foreach ($row as $ci => $v) {
                $s = !empty($sp['header']) && $ri === 0 ? ['bold' => true, 'bg' => '#e8edf3'] : [];
                $sh->put($ri + 1, $ci + 1, is_string($v) && !empty($sp['text']) ? $v : (is_numeric($v) && !is_string($v) ? $v : (string)$v), $s);
            }
            if (!empty($sp['header'])) $sh->frozenRows = 1;
            $sheets[] = $sh;
        }
        return ['nom' => preg_replace('/[^\w.-]+/', '_', $baseName) . '.xlsx', 'mime' => self::MIME['xlsx'], 'base64' => base64_encode(Xlsx::build($sheets))];
    }
}
