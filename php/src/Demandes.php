<?php
/** Demandes des agents : arrivent chez le responsable d’équipe (ou l'admin), regroupées par thème et envoyées en UNE demande à la direction. */
final class Demandes {
    const DECIDEES = ['acceptee', 'refusee', 'traitee'];
    const REPONSES = ['acceptee', 'refusee', 'traitee'];
    const PHRASE = ['titre_conge' => 'le(s) Titre(s) de congé', 'attestation_travail' => "l'(les) Attestation(s) de travail", 'ats' => "l'(les) ATS", 'fiche_emolument' => "la (les) Fiche(s) d'émoluments", 'contrat' => 'la (les) Copie(s) du contrat',
        'attestation_cnas' => "l'(les) Attestation(s) CNAS", 'maj_cnas' => 'la (les) Mise(s) à jour CNAS', 'attestation_emoluments' => "l'(les) Attestation(s) d'émoluments", 'prolongation_conge' => 'la (les) Prolongation(s) de congé', 'prolongation_sejour' => 'la (les) Prolongation(s) de séjour'];
    const DOC_DE = ['titre_conge' => 'titre_conge', 'attestation_travail' => 'attestation_travail', 'fiche_emolument' => 'fiche_emolument', 'contrat' => 'contrat', 'attestation_cnas' => 'attestation_cnas', 'maj_cnas' => 'maj_cnas', 'attestation_emoluments' => 'attestation_emoluments'];

    /** Types intégrés + types ajoutés dans Setup → Demandes (Params « types_demande » : custom [cle, label, doc], off [clés non proposées]). */
    private static function cfgTypes(): array {
        $o = json_decode(Params::get()['types_demande'] ?: '{}', true); if (!is_array($o)) $o = [];
        return ['custom' => is_array($o['custom'] ?? null) ? $o['custom'] : [], 'off' => is_array($o['off'] ?? null) ? $o['off'] : []];
    }
    private static function T(): array { $o = CFG()['TYPES_DEMANDE']; foreach (self::cfgTypes()['custom'] as $c) $o[$c['cle']] = $c['label']; return $o; }
    private static function masque($t): bool { return in_array($t, CFG()['TYPES_DEMANDE_MASQUES'], true) || in_array($t, self::cfgTypes()['off'], true); }
    private static function docDe($type): string { if (isset(self::DOC_DE[$type])) return self::DOC_DE[$type]; foreach (self::cfgTypes()['custom'] as $c) if ($c['cle'] === $type) return $c['doc'] ?? ''; return ''; }
    private static function byId(array $list): array { $m = []; foreach ($list as $x) $m[$x['id']] = $x; return $m; }
    private static function handlerId(?array $agent, array $by): string { $chef = $agent && $agent['chef_id'] !== '' ? ($by[$agent['chef_id']] ?? null) : null; return $chef && $chef['actif'] === '1' ? $chef['id'] : 'admin'; }
    private static function canHandle(array $user, array $d, array $by): bool {
        if ($user['role'] === 'admin') return true;
        return $user['role'] === 'chef' && $d['agent_id'] !== $user['id'] && (Agents::tous($user) || self::handlerId($by[$d['agent_id']] ?? null, $by) === $user['id']);
    }
    private static function contexte(): array { return ['envois' => self::byId(Store::readTable('Envois')), 'docs' => self::byId(Store::readTable('Documents'))]; }
    private static function etapes(array $d, array $ctx): array {
        $rep = in_array($d['statut'], self::REPONSES, true); $direct = $d['envoi_id'] === '' && $rep && $d['statut'] !== 'envoyee'; $env = $ctx['envois'][$d['envoi_id']] ?? null;
        $out = [['cle' => 'recue', 'label' => 'Demande reçue', 'date' => $d['date_creation'], 'etat' => 'fait']];
        if (!$direct) $out[] = ['cle' => 'transmise', 'label' => 'Transmise à la direction', 'date' => $env ? $env['date_envoi'] : '', 'etat' => $d['envoi_id'] !== '' ? 'fait' : 'attente'];
        $out[] = ['cle' => 'reponse', 'label' => $rep ? 'Réponse : ' . (CFG()['STATUTS_DEMANDE'][$d['statut']] ?? $d['statut']) : 'Réponse', 'date' => $rep ? $d['date_traitement'] : '', 'etat' => $rep ? 'fait' : 'attente'];
        $out[] = ['cle' => 'cloturee', 'label' => 'Clôturée', 'date' => $d['date_cloture'], 'etat' => $d['date_cloture'] !== '' ? 'fait' : 'attente'];
        return $out;
    }
    private static function enrich(array $d, array $by, ?array $ctx = null): array {
        $ctx = $ctx ?? self::contexte(); $a = $by[$d['agent_id']] ?? [];
        $o = $d; $T = self::T();
        $o['agent_nom'] = ($a['nom'] ?? '') ?: '?'; $o['agent_fonction'] = $a['fonction'] ?? ''; $o['type_label'] = $T[$d['type']] ?? $d['type'];
        $o['reprise'] = self::reprise($d, $a ?: null);
        $o['cloturee'] = $d['date_cloture'] !== ''; $o['etapes'] = self::etapes($d, $ctx);
        $doc = $d['document_id'] !== '' ? ($ctx['docs'][$d['document_id']] ?? null) : null;
        $o['document'] = $doc ? ['id' => $doc['id'], 'nom' => $doc['nom_original'] ?: $doc['titre'], 'type' => $doc['type'], 'periode' => $doc['periode'] ?: ''] : null;
        $o['a_cloturer'] = in_array($d['statut'], self::REPONSES, true) && $d['date_cloture'] === '';
        $hid = self::handlerId($a ?: null, $by); $o['responsable_nom'] = $hid === 'admin' ? '' : (($by[$hid]['nom'] ?? '') ?: '');
        return $o;
    }
    private static function reprise(array $d, ?array $agent): string {
        if ($d['type'] !== 'titre_conge' || $d['date_debut'] === '' || !Dates::isDate($d['date_debut'])) return '';
        $fin = $d['date_fin'] !== '' && Dates::isDate($d['date_fin']) ? $d['date_fin'] : '';
        if ($fin === '') { $repos = (int)(Agents::rotationParams($agent, Params::get())['jours_repos'] ?? 0); if (!$repos) return ''; $fin = Dates::addDays($d['date_debut'], $repos - 1); }
        return Dates::addDays($fin, 1);
    }
    private static function sortDesc(array &$l): void { usort($l, fn($a, $b) => strcmp($b['date_creation'], $a['date_creation'])); }

    public static function create(array $user, ?array $data): array {
        $data = $data ?? []; $T = self::T();
        // Le responsable d'équipe peut créer une demande POUR un agent de son équipe ; la demande appartient alors à l'agent.
        $cible = $user;
        if (!empty($data['agent_id']) && $data['agent_id'] !== $user['id']) {
            $by = self::byId(Agents::list()); $ag = $by[$data['agent_id']] ?? null;
            if ($user['role'] === 'agent' || !$ag || !Agents::isPerson($ag) || $ag['type'] === 'vehicule' || $ag['actif'] !== '1' || !self::canHandle($user, ['agent_id' => $ag['id']], $by)) throw httpErr('Agent non accessible', 'FORBIDDEN');
            $cible = $ag;
        } elseif ($user['role'] === 'admin') throw httpErr("L'administrateur ne fait pas de demande", 'FORBIDDEN');
        $type = $data['type'] ?? '';
        if (!isset($T[$type]) || self::masque($type)) throw httpErr('Type de demande invalide');
        foreach (['date_debut', 'date_fin'] as $k) if (!empty($data[$k]) && !Dates::isDate($data[$k])) throw httpErr('Date invalide');
        if (!empty($data['date_debut']) && !empty($data['date_fin']) && $data['date_fin'] < $data['date_debut']) throw httpErr('La date de fin précède la date de début');
        if (!Format::allow('DEM_' . $user['id'], 20, 3600)) throw httpErr('Trop de demandes en peu de temps, réessayez plus tard');
        $d = ['id' => newId('D'), 'agent_id' => $cible['id'], 'type' => $type, 'objet' => mb_substr(trim((string)($data['objet'] ?? '')), 0, 120) ?: $T[$type], 'message' => mb_substr(trim((string)($data['message'] ?? '')), 0, 500),
            'date_debut' => $data['date_debut'] ?? '', 'date_fin' => $data['date_fin'] ?? '', 'date_creation' => nowIso(), 'statut' => 'en_attente', 'envoi_id' => '', 'reponse' => '', 'traite_par' => '', 'date_traitement' => ''];
        Store::writeTable('Demandes', array_merge(Store::readTable('Demandes'), [$d]));
        if ($cible['id'] === $user['id']) self::notifyHandler($user, $d);
        return $d;
    }
    private static function notifyHandler(array $user, array $d): void {
        try {
            $all = Agents::list(); $by = self::byId($all); $h = self::handlerId($user, $by); $T = self::T();
            $dest = $h === 'admin' ? array_values(array_filter($all, fn($a) => $a['role'] === 'admin' && $a['actif'] === '1')) : [$by[$h] ?? null];
            $dest = array_slice(array_values(array_filter($dest, fn($a) => $a && Format::validEmail($a['email'] ?? ''))), 0, 3);
            foreach ($dest as $a) {
                $rep = self::reprise($d, $user);
                Mail::send(['to' => $a['email'], 'replyTo' => $user['email'] ?: null, 'subject' => 'Nouvelle demande — ' . $user['nom'] . ' : ' . $d['objet'], 'cta' => ['label' => 'Ouvrir les demandes', 'url' => Mail::lien()], 'societe' => Params::get()['prestataire_nom'],
                    'body' => 'Bonjour ' . $a['nom'] . ",\n\n" . $user['nom'] . ($user['fonction'] ? ' (' . $user['fonction'] . ')' : '') . ' a fait une demande : ' . ($T[$d['type']] ?? $d['type']) . "\nObjet : " . $d['objet'] . ($d['date_debut'] ? "\nDu " . Dates::frDate($d['date_debut']) . ($d['date_fin'] ? ' au ' . Dates::frDate($d['date_fin']) : '') : '') . ($rep ? "\nReprise du travail prévue le " . Dates::frDate($rep) : '') . ($d['message'] ? "\n\n" . $d['message'] : '') . "\n\nOuvrez Sijil, onglet Demandes, pour la traiter."]);
            }
        } catch (Throwable $e) { error_log('Demande non notifiée : ' . $e->getMessage()); }
    }
    private static function find(array &$all, $id): ?int { foreach ($all as $i => $x) if ($x['id'] === $id) return $i; return null; }

    public static function modifier(array $user, $id, ?array $data): array {
        $data = $data ?? []; $T = self::T(); $by = self::byId(Agents::list()); $all = Store::readTable('Demandes');
        $i = self::find($all, $id); if ($i === null) throw httpErr('Demande introuvable');
        $d = &$all[$i];
        if (!($d['agent_id'] === $user['id'] || self::canHandle($user, $d, $by))) throw httpErr('Demande non accessible', 'FORBIDDEN');
        if ($d['date_cloture'] !== '') throw httpErr('Cette demande est clôturée : annulez d’abord la clôture');
        $decidee = in_array($d['statut'], self::DECIDEES, true) && $d['envoi_id'] === ''; $attente = $d['statut'] === 'envoyee';
        if ($d['statut'] !== 'en_attente' && !(($decidee || $attente) && self::canHandle($user, $d, $by))) throw httpErr($attente ? 'Cette demande est déjà transmise à la direction : seul votre responsable peut la corriger' : 'La direction a répondu à cette demande : elle ne peut plus être modifiée');
        $type = !empty($data['type']) ? $data['type'] : $d['type'];
        if (!isset($T[$type]) || ($type !== $d['type'] && self::masque($type))) throw httpErr('Type de demande invalide');
        $debut = array_key_exists('date_debut', $data) ? $data['date_debut'] : $d['date_debut']; $fin = array_key_exists('date_fin', $data) ? $data['date_fin'] : $d['date_fin'];
        foreach ([$debut, $fin] as $x) if ($x && !Dates::isDate($x)) throw httpErr('Date invalide');
        if ($debut && $fin && $fin < $debut) throw httpErr('La date de fin précède la date de début');
        if ($type !== $d['type']) $d['objet'] = $T[$type];
        $d['type'] = $type; $d['date_debut'] = $debut ?: ''; $d['date_fin'] = $fin ?: '';
        if (array_key_exists('message', $data)) $d['message'] = trim((string)($data['message'] ?? ''));
        if ($decidee) {
            if (array_key_exists('statut', $data)) { if (!in_array($data['statut'], self::DECIDEES, true)) throw httpErr('Statut invalide'); $d['statut'] = $data['statut']; }
            if (array_key_exists('reponse', $data)) $d['reponse'] = mb_substr(trim((string)($data['reponse'] ?? '')), 0, 500);
            $d['traite_par'] = $user['nom']; $d['date_traitement'] = nowIso();
        }
        $copy = $d; unset($d);
        Store::writeTable('Demandes', $all);
        return self::enrich($copy, $by);
    }
    public static function reouvrir(array $user, $id): array {
        $by = self::byId(Agents::list()); $all = Store::readTable('Demandes'); $i = self::find($all, $id);
        if ($i === null || !self::canHandle($user, $all[$i], $by)) throw httpErr('Demande non accessible', 'FORBIDDEN');
        $d = &$all[$i];
        if ($d['statut'] === 'en_attente') { $c = $d; return self::enrich($c, $by); }
        if ($d['date_cloture'] !== '') throw httpErr('Cette demande est clôturée : annulez d’abord la clôture');
        if ($d['statut'] !== 'envoyee' && $d['envoi_id'] !== '') throw httpErr('La direction a répondu à cette demande : elle ne peut plus être annulée');
        $envoi = $d['envoi_id'];
        $d['statut'] = 'en_attente'; $d['reponse'] = ''; $d['traite_par'] = ''; $d['date_traitement'] = ''; $d['envoi_id'] = '';
        $copy = $d; unset($d);
        Store::writeTable('Demandes', $all);
        if ($envoi !== '') self::majEnvoi($envoi, $all);
        return self::enrich($copy, $by);
    }
    public static function supprimer(array $user, $id): array {
        $by = self::byId(Agents::list()); $all = Store::readTable('Demandes'); $i = self::find($all, $id);
        if ($i === null) throw httpErr('Demande introuvable');
        $d = $all[$i]; $handler = self::canHandle($user, $d, $by);
        if ($d['date_cloture'] !== '' && $handler) throw httpErr('Cette demande est clôturée : annulez d’abord la clôture');
        if (!($handler || ($d['agent_id'] === $user['id'] && $d['statut'] === 'en_attente'))) throw httpErr('Demande non accessible', 'FORBIDDEN');
        if ($d['statut'] !== 'envoyee' && $d['envoi_id'] !== '') throw httpErr('La direction a répondu à cette demande : elle ne peut plus être supprimée');
        if ($d['statut'] === 'envoyee' && !$handler) throw httpErr('Demande non accessible', 'FORBIDDEN');
        $reste = array_values(array_filter($all, fn($x) => $x['id'] !== $id));
        Store::writeTable('Demandes', $reste);
        if ($d['envoi_id'] !== '') self::majEnvoi($d['envoi_id'], $reste);
        return ['ok' => true, 'id' => $id];
    }
    private static function majEnvoi(string $envoiId, array $demandes): void {
        $envois = Store::readTable('Envois'); $i = null; foreach ($envois as $k => $x) if ($x['id'] === $envoiId) $i = $k;
        if ($i === null) return;
        $items = array_values(array_filter($demandes, fn($d) => $d['envoi_id'] === $envoiId));
        if (!$items) { unset($envois[$i]); Store::writeTable('Envois', array_values($envois)); return; }
        $envois[$i]['nb'] = (string)count($items);
        $envois[$i]['themes'] = implode(', ', array_map(fn($g) => $g['label'] . ' (' . count($g['items']) . ')', self::groupBy($items)));
        Store::writeTable('Envois', $envois);
    }
    public static function annulerEnvoi(array $user, $envoiId): array {
        $envois = Store::readTable('Envois'); $e = null; foreach ($envois as $x) if ($x['id'] === $envoiId) $e = $x;
        if (!$e || ($user['role'] !== 'admin' && !Agents::tous($user) && $e['chef_id'] !== $user['id'])) throw httpErr('Envoi introuvable', 'FORBIDDEN');
        if ($e['statut'] !== 'envoye') throw httpErr('La direction a répondu à cet envoi : il ne peut plus être annulé');
        $all = Store::readTable('Demandes'); $n = 0;
        foreach ($all as &$d) if ($d['envoi_id'] === $envoiId && $d['statut'] === 'envoyee') { $d['statut'] = 'en_attente'; $d['envoi_id'] = ''; $n++; }
        unset($d);
        Store::writeTable('Demandes', $all); Store::writeTable('Envois', array_values(array_filter($envois, fn($x) => $x['id'] !== $envoiId)));
        return ['ok' => true, 'remises' => $n];
    }
    private static function groupBy(array $items): array {
        $groups = []; foreach ($items as $d) $groups[$d['type']][] = $d;
        $out = []; foreach (self::T() as $t => $label) if (isset($groups[$t])) $out[] = ['type' => $t, 'label' => $label, 'items' => $groups[$t]];
        return $out;
    }
    public static function lister(array $user): array {
        $T = self::T(); $by = self::byId(Agents::list()); $ctx = self::contexte();
        $all = array_map(fn($d) => self::enrich($d, $by, $ctx), Store::readTable('Demandes'));
        $mine = array_values(array_filter($all, fn($d) => $d['agent_id'] === $user['id'])); self::sortDesc($mine);
        $toHandle = $user['role'] === 'agent' ? [] : array_values(array_filter($all, fn($d) => self::canHandle($user, $d, $by))); self::sortDesc($toHandle);
        $envois = [];
        if ($user['role'] !== 'agent') {
            $rows = [];
            foreach (Store::readTable('Envois') as $e) {
                $tous = array_values(array_filter($all, fn($d) => $d['envoi_id'] === $e['id']));
                $items = $user['role'] === 'admin' ? $tous : array_values(array_filter($tous, fn($d) => self::canHandle($user, $d, $by)));
                if ($user['role'] === 'admin' || $items || $e['chef_id'] === $user['id']) $rows[] = ['e' => $e, 'items' => $items];
            }
            usort($rows, fn($a, $b) => strcmp($b['e']['date_envoi'], $a['e']['date_envoi']));
            foreach (array_slice($rows, 0, 40) as $x) {
                $o = $x['e']; $o['chef_nom'] = ($by[$o['chef_id']]['nom'] ?? '') ?: 'Administration'; $o['groupes'] = self::groupBy($x['items']); $o['nb'] = count($x['items']);
                $o['peut_agir'] = $user['role'] === 'admin' || Agents::tous($user) || $x['e']['chef_id'] === $user['id'];
                $envois[] = $o;
            }
        }
        $utilises = []; foreach ($all as $d) $utilises[$d['type']] = 1;
        $types = []; foreach ($T as $k => $v) if (!self::masque($k) || isset($utilises[$k])) $types[$k] = $v;
        $proposes = array_values(array_filter(array_keys($T), fn($k) => !self::masque($k)));
        return ['mine' => $mine, 'toHandle' => $toHandle, 'envois' => $envois, 'types' => $types, 'proposes' => $proposes, 'statuts' => CFG()['STATUTS_DEMANDE']];
    }
    public static function repondre(array $user, $id, $statut, $reponse): array {
        if (!in_array($statut, self::REPONSES, true)) throw httpErr('Statut invalide');
        $by = self::byId(Agents::list()); $all = Store::readTable('Demandes'); $i = self::find($all, $id);
        if ($i === null || !self::canHandle($user, $all[$i], $by)) throw httpErr('Demande non accessible', 'FORBIDDEN');
        $all[$i]['statut'] = $statut; $all[$i]['reponse'] = mb_substr((string)($reponse ?? ''), 0, 500); $all[$i]['traite_par'] = $user['nom']; $all[$i]['date_traitement'] = nowIso();
        Store::writeTable('Demandes', $all);
        return self::enrich($all[$i], $by);
    }
    private static function esc($t): string { return str_replace(['&', '<', '>'], ['&amp;', '&lt;', '&gt;'], (string)($t ?? '')); }
    private static function buildMessage(array $envoi, array $groups): array {
        $sig = 'Admin Sijil'; $t = ['Bonjour,', '']; $hh = ['<p>Bonjour,</p>'];
        if ($envoi['note'] !== '') { $t[] = $envoi['note']; $t[] = ''; $hh[] = '<p>' . self::esc($envoi['note']) . '</p>'; }
        foreach ($groups as $g) {
            $conge = $g['type'] === 'titre_conge';
            $intro = 'Je vous remercie de bien vouloir préparer ' . (self::PHRASE[$g['type']] ?? ($g['label'] . ' (' . count($g['items']) . ')')) . ' pour :';
            $t[] = $intro; $t[] = ''; $hh[] = '<p>' . self::esc($intro) . '</p>';
            foreach ($g['items'] as $d) {
                $rep = $d['reprise']; $nom = $d['agent_nom'] . ($d['agent_fonction'] ? ' (' . $d['agent_fonction'] . ')' : ''); $lignes = [];
                if ($conge && $d['date_debut']) {
                    $lignes[] = ['Date de sortie', Dates::frDate($d['date_debut'])];
                    if ($rep) { $lignes[] = ['Durée', Dates::diffDays($d['date_debut'], $rep) . ' jours', true]; $lignes[] = ['Date de reprise', Dates::frDate($rep)]; }
                } else {
                    if ($d['date_debut'] && $d['date_fin']) { $lignes[] = ['Date de début', Dates::frDate($d['date_debut'])]; $lignes[] = ['Date de fin', Dates::frDate($d['date_fin'])]; $lignes[] = ['Durée', (Dates::diffDays($d['date_debut'], $d['date_fin']) + 1) . ' jours', true]; }
                    elseif ($d['date_debut']) $lignes[] = ['À partir du', Dates::frDate($d['date_debut'])];
                }
                if ($d['message']) $lignes[] = ['Précisions', $d['message']];
                $t[] = $nom; foreach ($lignes as $l) $t[] = '    - ' . $l[0] . ' : ' . $l[1]; $t[] = '';
                $hh[] = '<p style="margin:0 0 4px"><b>' . self::esc($nom) . '</b></p><ul style="margin:0 0 14px">' . implode('', array_map(fn($l) => '<li>' . self::esc($l[0]) . ' : ' . (!empty($l[2]) ? '<b>' . self::esc($l[1]) . '</b>' : self::esc($l[1])) . '</li>', $lignes)) . '</ul>';
            }
        }
        $t[] = 'Cordialement,'; $t[] = ''; $t[] = $sig; $hh[] = '<p>Cordialement,</p><p>' . self::esc($sig) . '</p>';
        return ['text' => implode("\n", $t), 'html' => '<div style="font-family:Arial,sans-serif;font-size:14px">' . implode('', $hh) . '</div>'];
    }
    public static function envoyerDirection(array $user, $ids, $note): array {
        if ($user['role'] === 'agent') throw httpErr('Accès refusé', 'FORBIDDEN');
        $params = Params::get(); $by = self::byId(Agents::list()); $all = Store::readTable('Demandes');
        $wanted = $ids ? array_flip((array)$ids) : null; $idx = [];
        foreach ($all as $i => $d) if (($d['statut'] === 'en_attente' || ($d['statut'] === 'acceptee' && $d['envoi_id'] === '')) && self::canHandle($user, $d, $by) && (!$wanted || isset($wanted[$d['id']]))) $idx[] = $i;
        if (!$idx) throw httpErr('Aucune demande à envoyer');
        $items = array_map(fn($i) => self::enrich($all[$i], $by), $idx); $groups = self::groupBy($items);
        $envoi = ['id' => newId('E'), 'chef_id' => $user['id'], 'date_envoi' => nowIso(), 'nb' => (string)count($idx), 'themes' => implode(', ', array_map(fn($g) => $g['label'] . ' (' . count($g['items']) . ')', $groups)), 'note' => mb_substr((string)($note ?? ''), 0, 300), 'statut' => 'envoye', 'reponse' => '', 'date_reponse' => ''];
        foreach ($idx as $i) { $all[$i]['statut'] = 'envoyee'; $all[$i]['envoi_id'] = $envoi['id']; }
        Store::writeTable('Demandes', $all); Store::writeTable('Envois', array_merge(Store::readTable('Envois'), [$envoi]));
        $msg = self::buildMessage($envoi, $groups); $mail = false;
        if ($params['direction_email']) {
            try { Mail::send(['to' => $params['direction_email'], 'subject' => 'Demande groupée — ' . ($params['prestataire_nom'] ?: 'Prestataire') . ' — ' . $envoi['nb'] . ' demande(s)', 'body' => $msg['text'], 'html' => $msg['html'], 'societe' => $params['prestataire_nom']]); $mail = true; }
            catch (Throwable $e) { error_log('Envoi e-mail impossible : ' . $e->getMessage()); }
        }
        $envoiOut = $envoi; $envoiOut['nb'] = count($idx);
        return ['envoi' => $envoiOut, 'groupes' => array_map(fn($g) => ['type' => $g['type'], 'label' => $g['label'], 'n' => count($g['items'])], $groups), 'mail' => $mail, 'texte' => $msg['text']];
    }
    public static function traiterEnvoi(array $user, $envoiId, $statut, $reponse): array {
        if (!in_array($statut, self::REPONSES, true)) throw httpErr('Statut invalide');
        $envois = Store::readTable('Envois'); $ei = null; foreach ($envois as $k => $x) if ($x['id'] === $envoiId) $ei = $k;
        if ($ei === null || ($user['role'] !== 'admin' && !Agents::tous($user) && $envois[$ei]['chef_id'] !== $user['id'])) throw httpErr('Envoi introuvable', 'FORBIDDEN');
        $all = Store::readTable('Demandes'); $now = nowIso(); $rep = mb_substr((string)($reponse ?? ''), 0, 500);
        foreach ($all as &$d) if ($d['envoi_id'] === $envoiId && $d['statut'] === 'envoyee') { $d['statut'] = $statut; $d['reponse'] = $rep; $d['traite_par'] = $user['nom']; $d['date_traitement'] = $now; }
        unset($d);
        $envois[$ei]['statut'] = 'traite'; $envois[$ei]['reponse'] = $rep; $envois[$ei]['date_reponse'] = $now;
        Store::writeTable('Demandes', $all); Store::writeTable('Envois', $envois);
        return $envois[$ei];
    }
    public static function repondreDirection(array $user, $id, $statut, $reponse): array {
        if (!in_array($statut, self::REPONSES, true)) throw httpErr('Statut invalide');
        $by = self::byId(Agents::list()); $all = Store::readTable('Demandes'); $i = self::find($all, $id);
        if ($i === null || !self::canHandle($user, $all[$i], $by)) throw httpErr('Demande non accessible', 'FORBIDDEN');
        if ($all[$i]['statut'] !== 'envoyee') throw httpErr('Cette demande n’attend pas de réponse de la direction');
        $now = nowIso();
        $all[$i]['statut'] = $statut; $all[$i]['reponse'] = mb_substr((string)($reponse ?? ''), 0, 500); $all[$i]['traite_par'] = $user['nom']; $all[$i]['date_traitement'] = $now;
        Store::writeTable('Demandes', $all);
        $envoiId = $all[$i]['envoi_id']; $restent = false;
        foreach ($all as $x) if ($x['envoi_id'] === $envoiId && $x['statut'] === 'envoyee') $restent = true;
        if (!$restent) { $envois = Store::readTable('Envois'); foreach ($envois as &$e) if ($e['id'] === $envoiId) { $e['statut'] = 'traite'; $e['date_reponse'] = $now; } unset($e); Store::writeTable('Envois', $envois); }
        return self::enrich($all[$i], $by);
    }
    public static function documentsPour(array $user, $id): array {
        $by = self::byId(Agents::list()); $all = Store::readTable('Demandes'); $i = self::find($all, $id);
        if ($i === null || !self::canHandle($user, $all[$i], $by)) throw httpErr('Demande non accessible', 'FORBIDDEN');
        $d = $all[$i]; $voulu = self::docDe($d['type']);
        $docs = array_values(array_filter(Store::readTable('Documents'), fn($x) => $x['agent_id'] === $d['agent_id']));
        usort($docs, fn($a, $b) => strcmp($b['date'], $a['date']));
        $out = array_map(fn($x) => ['id' => $x['id'], 'nom' => $x['nom_original'] ?: $x['titre'], 'type' => $x['type'], 'type_label' => CFG()['TYPES_DOC'][$x['type']] ?? $x['type'], 'periode' => $x['periode'] ?: '', 'date' => $x['date'], 'correspond' => $voulu !== '' && $x['type'] === $voulu], $docs);
        usort($out, fn($a, $b) => (int)$b['correspond'] <=> (int)$a['correspond']);
        return $out;
    }
    public static function cloturer(array $user, $id, $docId): array {
        $by = self::byId(Agents::list()); $all = Store::readTable('Demandes'); $i = self::find($all, $id);
        if ($i === null || !self::canHandle($user, $all[$i], $by)) throw httpErr('Demande non accessible', 'FORBIDDEN');
        $d = &$all[$i];
        if ($d['date_cloture'] !== '') throw httpErr('Cette demande est déjà clôturée');
        if (!in_array($d['statut'], self::REPONSES, true)) throw httpErr('La demande n’a pas encore reçu de réponse : elle ne peut pas être clôturée');
        if ($docId) {
            $doc = null; foreach (Store::readTable('Documents') as $x) if ($x['id'] === $docId) $doc = $x;
            if (!$doc || $doc['agent_id'] !== $d['agent_id']) throw httpErr('Document introuvable chez cet agent');
            $d['document_id'] = $docId;
        } elseif ($d['statut'] !== 'refusee') throw httpErr('Choisissez le document à remettre à l’agent (ou déposez-le d’abord dans l’onglet Documents)');
        $d['date_cloture'] = nowIso(); $d['cloture_par'] = $user['nom'];
        $copy = $d; unset($d);
        Store::writeTable('Demandes', $all);
        try {
            $ag = $by[$copy['agent_id']] ?? null; $T = self::T();
            if ($ag && Format::validEmail($ag['email'] ?? '')) Mail::send(['to' => $ag['email'], 'replyTo' => $user['email'] ?: null, 'subject' => 'Votre demande est clôturée — ' . ($T[$copy['type']] ?? $copy['type']), 'cta' => ['label' => 'Ouvrir mes demandes', 'url' => Mail::lien()], 'societe' => Params::get()['prestataire_nom'],
                'body' => 'Bonjour ' . $ag['nom'] . ",\n\nVotre demande « " . ($T[$copy['type']] ?? $copy['type']) . ' » est clôturée (' . (CFG()['STATUTS_DEMANDE'][$copy['statut']] ?? $copy['statut']) . ').' . ($copy['document_id'] ? "\nLe document est disponible dans votre espace Sijil, onglet « Mes documents » et sur la demande." : '') . ($copy['reponse'] ? "\n\nRéponse : " . $copy['reponse'] : '')]);
        } catch (Throwable $e) { error_log('Clôture non notifiée : ' . $e->getMessage()); }
        return self::enrich($copy, $by);
    }
    public static function annulerCloture(array $user, $id): array {
        $by = self::byId(Agents::list()); $all = Store::readTable('Demandes'); $i = self::find($all, $id);
        if ($i === null || !self::canHandle($user, $all[$i], $by)) throw httpErr('Demande non accessible', 'FORBIDDEN');
        $all[$i]['date_cloture'] = ''; $all[$i]['cloture_par'] = ''; $all[$i]['document_id'] = '';
        Store::writeTable('Demandes', $all);
        return self::enrich($all[$i], $by);
    }
    public static function counts(array $user): array {
        $by = self::byId(Agents::list()); $all = Store::readTable('Demandes');
        $mine = array_values(array_filter($all, fn($d) => $d['agent_id'] === $user['id']));
        return ['total' => count($mine), 'en_attente' => count(array_filter($mine, fn($d) => $d['statut'] === 'en_attente' || $d['statut'] === 'envoyee')),
            'a_traiter' => $user['role'] === 'agent' ? 0 : count(array_filter($all, fn($d) => ($d['statut'] === 'en_attente' || (in_array($d['statut'], self::REPONSES, true) && $d['date_cloture'] === '' && $d['envoi_id'] !== '')) && self::canHandle($user, $d, $by)))];
    }

    // ----- Types de demande réglables (Setup → Demandes) -----
    public static function typesConfig(): array {
        $c = self::cfgTypes(); $used = []; foreach (Store::readTable('Demandes') as $d) $used[$d['type']] = 1; $masq = CFG()['TYPES_DEMANDE_MASQUES'];
        $builtin = []; foreach (CFG()['TYPES_DEMANDE'] as $k => $label) if (!in_array($k, $masq, true) || isset($used[$k])) $builtin[] = ['cle' => $k, 'label' => $label, 'propose' => !in_array($k, $c['off'], true) && !in_array($k, $masq, true)];
        $custom = array_map(fn($x) => ['cle' => $x['cle'], 'label' => $x['label'], 'doc' => $x['doc'] ?? '', 'propose' => !in_array($x['cle'], $c['off'], true), 'utilise' => isset($used[$x['cle']])], $c['custom']);
        return ['builtin' => $builtin, 'custom' => $custom, 'docs' => CFG()['TYPES_DOC']];
    }
    private static function slugType($label): string { return 'x_' . substr(trim(preg_replace('/[^a-z0-9]+/', '_', Format::norm($label)), '_'), 0, 30); }
    public static function typesSave(array $user, ?array $o): array {
        $o = $o ?? []; $old = self::cfgTypes(); $used = []; foreach (Store::readTable('Demandes') as $d) $used[$d['type']] = 1;
        $masq = CFG()['TYPES_DEMANDE_MASQUES']; $labels = []; foreach (CFG()['TYPES_DEMANDE'] as $k => $l) $labels[Format::norm($l)] = $k;
        $custom = []; $off = []; $keys = []; $oldKeys = array_column($old['custom'], 'cle');
        foreach (($o['builtin'] ?? []) as $k => $v) if (isset(CFG()['TYPES_DEMANDE'][$k]) && !in_array($k, $masq, true) && $v === false) $off[] = $k;
        foreach (($o['custom'] ?? []) as $c) {
            $label = mb_substr(trim(preg_replace('/[\x00-\x1f]+/', ' ', (string)($c['label'] ?? ''))), 0, 60);
            if (mb_strlen($label) < 3) throw httpErr('Nom du type de demande : 3 caractères minimum');
            $n = Format::norm($label); $cle = in_array($c['cle'] ?? null, $oldKeys, true) ? $c['cle'] : self::slugType($label);
            if (isset($labels[$n]) && $labels[$n] !== $cle) throw httpErr('Ce type de demande existe déjà : ' . $label);
            $labels[$n] = $cle;
            $base = $cle; $k = 1; while (isset($keys[$cle]) || (isset(CFG()['TYPES_DEMANDE'][$cle]) && !in_array($cle, $oldKeys, true))) { $k++; $cle = $base . '_' . $k; }
            $keys[$cle] = true;
            $custom[] = ['cle' => $cle, 'label' => $label, 'doc' => isset(CFG()['TYPES_DOC'][$c['doc'] ?? '']) ? $c['doc'] : ''];
            if (($c['propose'] ?? null) === false) $off[] = $cle;
        }
        if (count($custom) > 20) throw httpErr('20 types ajoutés au maximum');
        foreach ($old['custom'] as $x) if (!isset($keys[$x['cle']]) && isset($used[$x['cle']])) { $custom[] = ['cle' => $x['cle'], 'label' => $x['label'], 'doc' => $x['doc'] ?? '']; $off[] = $x['cle']; $keys[$x['cle']] = true; }
        Params::set(['types_demande' => json_encode(['custom' => $custom, 'off' => $off], JSON_UNESCAPED_UNICODE)]);
        return self::typesConfig();
    }
}
