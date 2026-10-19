<?php
/** Pointage automatique : chaque jour à l'heure choisie, recopie du pointage de la veille (tâche planifiée cron.php, toutes les 30 min). */
final class Auto {
    const DEFAUT = '06:30';
    private static function key(string $userId): string { return 'AUTO_MAIN_' . $userId; }
    private static function read(string $userId): array { return json_decode(Props::get(self::key($userId)) ?? '{}', true) ?: []; }
    private static function validHeure($h): bool { return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string)($h ?? '')) === 1; }
    /** La tâche planifiée est « installée » si cron.php a tourné dans les 2 dernières heures. */
    public static function hasTrigger(): bool { $t = Props::get('CRON_LAST'); return $t !== null && time() - (int)$t < 7200; }
    public static function get(array $user): array {
        $s = self::read($user['id']);
        return ['on' => !empty($s['on']), 'heure' => ($s['heure'] ?? '') ?: self::DEFAUT, 'derniere' => $s['last'] ?? '', 'total' => $s['n'] ?? 0, 'quand' => $s['at'] ?? '', 'erreur' => $s['err'] ?? '', 'declencheur' => self::hasTrigger()];
    }
    public static function set(array $user, ?array $o): array {
        $o = $o ?? []; $heure = !empty($o['heure']) ? (string)$o['heure'] : self::DEFAUT;
        if (!self::validHeure($heure)) throw httpErr('Heure invalide (HH:MM, par exemple 06:30)');
        $prev = self::read($user['id']);
        $s = ['on' => ($o['on'] ?? null) === true || ($o['on'] ?? null) === '1' || ($o['on'] ?? null) === 1, 'heure' => $heure, 'last' => $prev['last'] ?? '', 'n' => $prev['n'] ?? 0, 'at' => $prev['at'] ?? '', 'err' => ''];
        Props::set(self::key($user['id']), json_encode($s));
        $res = self::get($user);
        if ($s['on'] && !$res['declencheur']) $res['avertissement'] = "La tâche planifiée n'a pas encore tourné : ajoutez cron.php au planificateur de votre hébergeur (cron toutes les 30 minutes).";
        return $res;
    }
    /** Appelée par cron.php. */
    public static function run(?string $now = null): array {
        $heureNow = $now ?: date('H:i'); $faits = [];
        Props::set('CRON_LAST', (string)time());
        foreach (Props::prefix('AUTO_MAIN_') as $k => $raw) {
            $userId = substr($k, strlen('AUTO_MAIN_')); $s = json_decode($raw, true);
            if (!$s || empty($s['on'])) continue;
            try {
                $today = Dates::today();
                if (($s['last'] ?? '') === $today || $heureNow < ($s['heure'] ?? self::DEFAUT)) continue;
                $user = Agents::get($userId);
                if (!$user || $user['actif'] !== '1' || ($user['role'] !== 'admin' && $user['role'] !== 'chef')) continue;
                $r = Store::withLock(fn() => Pointage::completer($user, ['tous' => true, 'to' => $today, 'mode' => 'meme', 'auto' => true]));
                $s['last'] = $today; $s['n'] = $r['total'] ?? 0; $s['at'] = nowIso(); $s['err'] = ''; Props::set($k, json_encode($s));
                $faits[] = ['user' => $userId, 'total' => $s['n']];
            } catch (Throwable $e) {
                error_log('Pointage automatique (' . $k . ') : ' . $e->getMessage());
                $s['err'] = mb_substr($e->getMessage(), 0, 200); Props::set($k, json_encode($s));
            }
        }
        return $faits;
    }
}
