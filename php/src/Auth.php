<?php
/** Authentification : e-mail + mot de passe, sessions en base, « Rester connecté », mot de passe oublié. */
final class Auth {
    const ITER = 300; const ONLINE_SECONDS = 180;
    private static function legacyHash(string $password, string $salt): string {
        $d = $salt . $password;
        for ($i = 0; $i < self::ITER; $i++) $d = base64_encode(hash('sha256', $d, true));
        return $d;
    }
    /** Empreinte d'un code secret (réinitialisation) : même algorithme que sur Apps Script. */
    private static function secretHash(string $secret, string $email): string { return self::legacyHash($secret, $email); }
    private static function skey(string $token): string { return 'S_' . hash('sha256', $token); }
    private static function rmKey(string $token): string { return 'RM_' . substr(preg_replace('/[^A-Za-z0-9]/', '', base64_encode(hash('sha256', $token, true))), 0, 40); }
    private static function newToken(): string { return uuid() . uuid(); }

    public static function makeCredentials($password): array {
        if (!$password || mb_strlen((string)$password) < 6) throw httpErr('Mot de passe : 6 caractères minimum');
        return ['salt' => 'bcrypt', 'password_hash' => password_hash((string)$password, PASSWORD_DEFAULT)];
    }
    /** Accepte les mots de passe créés ici (bcrypt) et ceux importés d'Apps Script (sel + SHA-256 répété). */
    public static function check(?array $agent, $password): bool {
        if (!$agent || ($agent['password_hash'] ?? '') === '') return false;
        $h = $agent['password_hash']; $pw = (string)($password ?? '');
        if ($h[0] === '$') return password_verify($pw, $h);
        return !empty($agent['salt']) && hash_equals($h, self::legacyHash($pw, $agent['salt']));
    }

    // ----- Activité et journal -----
    private static function journalAdd(array $agent): void {
        $list = json_decode(Props::get('LOG_ALL') ?? '[]', true) ?: [];
        array_unshift($list, [nowIso(), '', mb_substr((string)($agent['nom'] ?? ''), 0, 40), $agent['role'] ?? '']);
        Props::set('LOG_ALL', json_encode(array_slice($list, 0, 60), JSON_UNESCAPED_UNICODE));
    }
    public static function journal(): array { return json_decode(Props::get('LOG_ALL') ?? '[]', true) ?: []; }
    private static function noteLogin(array $agent): void {
        try {
            $k = 'LC_MAIN_' . $agent['id']; $v = json_decode(Props::get($k) ?? '{}', true) ?: [];
            Props::set($k, json_encode(['last' => nowIso(), 'prev' => $v['last'] ?? '', 'n' => ((int)($v['n'] ?? 0)) + 1]));
            self::touch($agent['id'], true); self::journalAdd($agent);
        } catch (Throwable $e) { error_log('Connexion non notée : ' . $e->getMessage()); }
    }
    private static function touch(string $agentId, bool $force = false): void {
        try {
            $m = json_decode(Cache::get('PRES_MAIN') ?? '{}', true) ?: []; $now = time();
            if (!$force && isset($m[$agentId]) && $now - $m[$agentId] < 60) return;
            $m[$agentId] = $now;
            foreach ($m as $id => $t) if ($now - $t > 3600) unset($m[$id]);
            Cache::put('PRES_MAIN', json_encode($m), 3600);
        } catch (Throwable $e) { /* présence facultative */ }
    }
    public static function activity(): array {
        $m = json_decode(Cache::get('PRES_MAIN') ?? '{}', true) ?: []; $now = time(); $out = [];
        foreach (Agents::list() as $a) {
            if ($a['actif'] !== '1' || $a['type'] === 'vehicule') continue;
            $v = json_decode(Props::get('LC_MAIN_' . $a['id']) ?? '{}', true) ?: []; $seen = $m[$a['id']] ?? 0;
            $out[] = ['id' => $a['id'], 'nom' => $a['nom'], 'role' => $a['role'], 'contrat' => $a['contrat'], 'email' => $a['email'], 'en_ligne' => $seen && $now - $seen < self::ONLINE_SECONDS, 'vu' => $seen ? gmdate('c', $seen) : '', 'derniere' => $v['last'] ?? '', 'precedente' => $v['prev'] ?? '', 'n' => (int)($v['n'] ?? 0)];
        }
        usort($out, fn($x, $y) => ($y['en_ligne'] <=> $x['en_ligne']) ?: (strcmp($y['derniere'], $x['derniere']) ?: strcoll((string)$x['nom'], (string)$y['nom'])));
        return $out;
    }

    // ----- Connexion -----
    public static function login($email, $password, $code = '', $remember = false): array {
        $email = mb_strtolower(trim((string)$email));
        if ($email === '') throw httpErr('Email ou mot de passe incorrect');
        $key = 'L_' . $email; $tries = (int)(Cache::get($key) ?? 0);
        if ($tries >= 8) throw httpErr('Trop de tentatives, réessayez dans 15 minutes');
        $agent = null;
        foreach (Agents::list() as $a) if (mb_strtolower($a['email']) === $email && $a['actif'] === '1') { $agent = $a; break; }
        if (!self::check($agent, $password)) { Cache::put($key, (string)($tries + 1), 900); throw httpErr('Email ou mot de passe incorrect'); }
        Cache::remove($key);
        $token = self::newToken();
        Cache::put(self::skey($token), '|' . $agent['id'], CFG()['SESSION_SECONDS']);
        self::noteLogin($agent);
        $out = ['token' => $token, 'user' => Agents::publicAgent($agent)];
        if ($remember) $out['remember'] = self::issueRemember($agent['id']);
        return $out;
    }
    private static function issueRemember(string $agentId): string {
        $now = time(); $mine = [];
        foreach (Props::prefix('RM_') as $k => $raw) {
            $v = json_decode($raw, true);
            if (!$v || $v['e'] < $now) { Props::delete($k); continue; }
            if ($v['a'] === $agentId) $mine[] = ['k' => $k, 'e' => $v['e']];
        }
        usort($mine, fn($x, $y) => $x['e'] <=> $y['e']);
        while (count($mine) >= 3) Props::delete(array_shift($mine)['k']);
        $token = self::newToken();
        Props::set(self::rmKey($token), json_encode(['c' => '', 'a' => $agentId, 'e' => $now + CFG()['REMEMBER_DAYS'] * 86400]));
        return $token;
    }
    public static function resume($rmToken): array {
        $key = self::rmKey((string)($rmToken ?: 'x')); $raw = Props::get($key); $v = $raw ? json_decode($raw, true) : null;
        if (!$v || $v['e'] < time()) { if ($raw) Props::delete($key); throw httpErr('Session expirée', 'SESSION'); }
        $agent = Agents::get($v['a']);
        if (!$agent || $agent['actif'] !== '1') { Props::delete($key); throw httpErr('Session expirée', 'SESSION'); }
        Props::delete($key);
        $token = self::newToken();
        Cache::put(self::skey($token), '|' . $agent['id'], CFG()['SESSION_SECONDS']);
        self::noteLogin($agent);
        return ['token' => $token, 'user' => Agents::publicAgent($agent), 'remember' => self::issueRemember($agent['id'])];
    }
    public static function forget($rmToken): bool { if ($rmToken) Props::delete(self::rmKey((string)$rmToken)); return true; }
    public static function revokeAll(string $code, string $agentId): void {
        foreach (Props::prefix('RM_') as $k => $raw) { $v = json_decode($raw, true); if (!$v || $v['a'] === $agentId) Props::delete($k); }
    }

    // ----- Mot de passe oublié : code à 6 chiffres envoyé par e-mail (30 min, 5 essais) -----
    private static function forgotKey(string $email): string { return 'P_' . $email; }
    public static function forgot($email, $code = ''): array {
        $email = mb_strtolower(trim((string)$email));
        if (Format::validEmail($email)) {
            $rl = 'F_' . $email; $n = (int)(Cache::get($rl) ?? 0);
            if ($n >= 3) throw httpErr('Trop de demandes pour cette adresse, réessayez dans une heure');
            if (!Format::allow('F_ALL', 40, 3600)) throw httpErr('Trop de demandes en ce moment, réessayez plus tard');
            Cache::put($rl, (string)($n + 1), 3600);
            $agent = null;
            foreach (Agents::list() as $a) if (mb_strtolower($a['email']) === $email && $a['actif'] === '1' && $a['type'] !== 'vehicule') { $agent = $a; break; }
            if ($agent) {
                $secret = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
                Cache::put(self::forgotKey($email), json_encode(['h' => self::secretHash($secret, $email), 'n' => 0]), 1800);
                try {
                    Mail::send(['to' => $email, 'subject' => 'Votre code de réinitialisation Sijil', 'code' => $secret, 'cta' => ['label' => 'Ouvrir Sijil', 'url' => Mail::shell()], 'body' => 'Bonjour ' . $agent['nom'] . ",\n\nVotre code de réinitialisation du mot de passe Sijil : " . $secret . "\n\nIl est valable 30 minutes. Saisissez-le sur la page de connexion, avec votre nouveau mot de passe.\n\nSi vous n'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé."]);
                } catch (Throwable $e) { error_log('Code non envoyé : ' . $e->getMessage()); }
            }
        }
        return ['envoye' => true];
    }
    public static function resetPassword($email, $secret, $newPassword, $code = ''): array {
        $email = mb_strtolower(trim((string)$email)); $key = self::forgotKey($email);
        $raw = Cache::get($key); $st = $raw ? json_decode($raw, true) : null;
        if (!$st) throw httpErr('Code invalide ou expiré');
        if ($st['n'] >= 5) { Cache::remove($key); throw httpErr("Trop d'essais : demandez un nouveau code"); }
        if (!hash_equals($st['h'], self::secretHash(trim((string)$secret), $email))) { $st['n']++; Cache::put($key, json_encode($st), 1800); throw httpErr('Code invalide ou expiré'); }
        $cred = self::makeCredentials($newPassword);
        $all = Agents::list(); $found = null;
        foreach ($all as $i => $a) if (mb_strtolower($a['email']) === $email && $a['actif'] === '1') { $all[$i]['password_hash'] = $cred['password_hash']; $all[$i]['salt'] = $cred['salt']; $found = $all[$i]; break; }
        if (!$found) throw httpErr('Code invalide ou expiré');
        Store::writeTable('Agents', $all);
        Cache::remove($key); Cache::remove('L_' . $email); self::revokeAll('', $found['id']);
        return ['ok' => true];
    }
    public static function logout(?string $token): void { if ($token) Cache::remove(self::skey($token)); }
    public static function userFromToken($token): array {
        if (!$token) throw httpErr('Session expirée', 'SESSION');
        $v = Cache::get(self::skey((string)$token));
        $i = $v !== null ? strpos($v, '|') : false;
        $id = $v === null ? '' : ($i === false ? $v : substr($v, $i + 1));
        $agent = $id !== '' ? Agents::get($id) : null;
        if (!$agent || $agent['actif'] !== '1') throw httpErr('Session expirée', 'SESSION');
        self::touch($agent['id']);
        return $agent;
    }
    public static function canSetup(array $u): bool { return $u['role'] === 'admin' || ($u['role'] === 'chef' && $u['acces_setup'] === '1'); }
}
