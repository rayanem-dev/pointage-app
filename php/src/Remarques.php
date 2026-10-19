<?php
/** Remarques du client (ou de l'agent) sur le pointage ; le prestataire les marque « vu » et peut répondre. */
final class Remarques {
    private static function all(): array { return Store::readTable('Remarques'); }
    private static function clip($v, int $n): string { return mb_substr(trim(preg_replace('/[\x00-\x08\x0b-\x1f]+/', ' ', (string)($v ?? ''))), 0, $n); }
    private static function visibleIds(array $user): array { $m = []; foreach (Agents::visibleTo($user) as $a) $m[$a['id']] = $a; return $m; }
    public static function add(array $user, ?array $data): array {
        if ($user['role'] !== 'client' && $user['role'] !== 'agent') throw httpErr('Réservé au compte client et à l’agent', 'FORBIDDEN');
        $data = $data ?? [];
        $agent = self::visibleIds($user)[$data['agent_id'] ?? ''] ?? null;
        if (!$agent) throw httpErr('Agent introuvable');
        if (!Dates::isDate($data['date'] ?? null)) throw httpErr('Date invalide');
        $texte = self::clip($data['texte'] ?? '', 600); if ($texte === '') throw httpErr('Écrivez votre remarque');
        if (!Format::allow('REM_' . $user['id'], 30, 3600)) throw httpErr('Trop de remarques en peu de temps, réessayez plus tard');
        $r = ['id' => newId('R'), 'agent_id' => $agent['id'], 'date' => $data['date'], 'texte' => $texte, 'auteur_id' => $user['id'], 'auteur_nom' => $user['nom'], 'contrat' => $agent['contrat'] ?: ($user['contrat'] ?: ''), 'date_creation' => nowIso(), 'statut' => 'nouveau', 'reponse' => '', 'date_reponse' => ''];
        Store::writeTable('Remarques', array_merge(self::all(), [$r]));
        self::notify($user, $agent, $r);
        return self::enrich($r, self::visibleIds($user));
    }
    private static function notify(array $user, array $agent, array $r): void {
        try {
            $agents = Agents::list(); $chef = null;
            if ($agent['chef_id'] !== '') foreach ($agents as $a) if ($a['id'] === $agent['chef_id'] && $a['actif'] === '1') $chef = $a;
            $dest = $chef ? [$chef] : array_values(array_filter($agents, fn($a) => $a['role'] === 'admin' && $a['actif'] === '1'));
            $dest = array_slice(array_values(array_filter($dest, fn($a) => Format::validEmail($a['email'] ?? ''))), 0, 3);
            foreach ($dest as $a) {
                Mail::send(['to' => $a['email'], 'replyTo' => $user['email'] ?: null, 'cta' => ['label' => 'Ouvrir le pointage', 'url' => Mail::lien()], 'societe' => Params::get()['prestataire_nom'],
                    'subject' => ($user['role'] === 'agent' ? 'Remarque de l’agent — ' : 'Remarque du client — ') . $agent['nom'] . ' le ' . Dates::frDate($r['date']),
                    'body' => 'Bonjour ' . $a['nom'] . ",\n\n" . $user['nom'] . ($user['role'] === 'agent' ? ' (agent)' : ' (client)') . ' a laissé une remarque sur le pointage de ' . $agent['nom'] . ' du ' . Dates::frDate($r['date']) . " :\n\n« " . $r['texte'] . " »\n\nOuvrez Sijil, onglet Pointage, pour la consulter et répondre."]);
            }
        } catch (Throwable $e) { error_log('Remarque non notifiée : ' . $e->getMessage()); }
    }
    private static function enrich(array $r, array $by): array { $r['agent_nom'] = ($by[$r['agent_id']]['nom'] ?? null) ?: '?'; return $r; }
    public static function between(array $user, string $from, string $to): array {
        $by = self::visibleIds($user); $role = []; foreach (Agents::list() as $x) $role[$x['id']] = $x['role'];
        $out = array_values(array_filter(self::all(), function ($r) use ($by, $from, $to, $user, $role) {
            if (!isset($by[$r['agent_id']]) || $r['date'] < $from || $r['date'] > $to) return false;
            if ($user['role'] === 'agent') return $r['auteur_id'] === $user['id'];
            if ($user['role'] === 'client') return ($role[$r['auteur_id']] ?? '') === 'client';
            return true;
        }));
        usort($out, fn($a, $b) => strcmp($a['date'], $b['date']) ?: strcmp($a['date_creation'], $b['date_creation']));
        return array_map(fn($r) => self::enrich($r, $by), $out);
    }
    public static function traiter(array $user, $id, ?array $data): array {
        $data = $data ?? []; $rows = self::all(); $idx = null;
        foreach ($rows as $i => $x) if ($x['id'] === $id) { $idx = $i; break; }
        if ($idx === null) throw httpErr('Remarque introuvable');
        $by = self::visibleIds($user);
        if (!isset($by[$rows[$idx]['agent_id']])) throw httpErr('Accès refusé', 'FORBIDDEN');
        $rows[$idx]['statut'] = 'vu';
        if (array_key_exists('reponse', $data)) { $rows[$idx]['reponse'] = self::clip($data['reponse'], 600); $rows[$idx]['date_reponse'] = $rows[$idx]['reponse'] !== '' ? nowIso() : ''; }
        Store::writeTable('Remarques', $rows);
        return self::enrich($rows[$idx], $by);
    }
    public static function countNew(array $user): int {
        if ($user['role'] === 'client' || $user['role'] === 'agent') return 0;
        $by = self::visibleIds($user);
        return count(array_filter(self::all(), fn($r) => $r['statut'] === 'nouveau' && isset($by[$r['agent_id']])));
    }
}
