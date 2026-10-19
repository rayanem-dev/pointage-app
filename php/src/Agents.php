<?php
/** Agents : le responsable d’équipe ET l'admin peuvent créer des agents ; seul l'admin gère rôles, groupes et accès au Setup. */
final class Agents {
    public static function list(): array { return Store::readTable('Agents'); }
    public static function get($id): ?array { foreach (self::list() as $a) if ($a['id'] === $id) return $a; return null; }
    public static function publicAgent(array $a): array { unset($a['password_hash'], $a['salt']); return $a; }
    private static function activeAdmins(array $all): int { return count(array_filter($all, fn($x) => $x['role'] === 'admin' && $x['actif'] === '1')); }
    private static function randomPassword(): string { return substr(uuid(), 0, 10); }
    /** Ni administrateur, ni compte de consultation, ni personnel administratif du prestataire (non pointé). */
    public static function isPerson(array $a): bool { return $a['role'] !== 'admin' && $a['role'] !== 'client' && $a['origine'] === ''; }
    public static function tous(?array $u): bool { return $u && $u['role'] === 'chef' && $u['portee'] === 'tous'; }
    public static function alpha(array $arr): array { usort($arr, fn($a, $b) => strcmp(Format::norm($a['nom']), Format::norm($b['nom'])) ?: strcmp((string)$a['nom'], (string)$b['nom'])); return $arr; }
    public static function visibleTo(array $user): array { return self::alpha(self::visibleRaw($user)); }
    private static function visibleRaw(array $user): array {
        $all = array_values(array_filter(self::list(), fn($a) => $a['actif'] === '1' && self::isPerson($a)));
        if ($user['role'] === 'admin') return $all;
        if ($user['role'] === 'client') return $user['contrat'] !== '' ? array_values(array_filter($all, fn($a) => $a['contrat'] === $user['contrat'])) : $all;
        if (self::tous($user)) return $all;
        if ($user['role'] === 'chef') return array_values(array_filter($all, fn($a) => $a['chef_id'] === $user['id'] || $a['id'] === $user['id']));
        return array_values(array_filter($all, fn($a) => $a['id'] === $user['id']));
    }
    public static function normRotation($v): string {
        $t = preg_replace('/\s/', '', (string)($v ?? ''));
        if ($t === '') return '';
        if (!preg_match('/^(\d{1,3})\/(\d{1,3})$/', $t, $m) || (int)$m[1] < 1 || (int)$m[2] < 1) throw httpErr('Rotation invalide : écrire jours de travail/jours de repos, par exemple 14/14');
        return (int)$m[1] . '/' . (int)$m[2];
    }
    public static function rotationParams(?array $a, array $params): array {
        if ($a && ($a['rotation'] ?? '') !== '' && preg_match('/^(\d+)\/(\d+)$/', $a['rotation'], $t)) { $params['jours_travail'] = $t[1]; $params['jours_repos'] = $t[2]; }
        return $params;
    }
    public static function manageable(array $user, array $a): bool { return $user['role'] === 'admin' || ($user['role'] === 'chef' && ($a['chef_id'] === $user['id'] || self::tous($user)) && $a['role'] === 'agent' && $a['origine'] === ''); }
    private static function flag($v): string { return $v === true || $v === '1' || $v === 1 ? '1' : '0'; }

    public static function create(array $user, array $data): array {
        $nom = trim((string)($data['nom'] ?? ''));
        $type = ($data['type'] ?? '') === 'vehicule' ? 'vehicule' : 'personne'; $isVh = $type === 'vehicule';
        $email = $isVh ? '' : mb_strtolower(trim((string)($data['email'] ?? '')));
        if ($nom === '') throw httpErr($isVh ? 'Immatriculation / identifiant du véhicule obligatoire' : 'Nom obligatoire');
        if (!$isVh && !Format::validEmail($email)) throw httpErr('Email invalide');
        $isAdmin = $user['role'] === 'admin';
        $role = $isVh ? 'agent' : ($isAdmin ? (($data['role'] ?? '') ?: 'agent') : 'agent');
        if ($role === 'client' && !$isAdmin) throw httpErr("Réservé à l'administrateur", 'FORBIDDEN');
        if (!in_array($role, CFG()['ROLES'], true)) throw httpErr('Rôle invalide');
        $all = self::list();
        if ($email !== '') foreach ($all as $a) if (mb_strtolower($a['email']) === $email) throw httpErr('Email déjà utilisé');
        $password = $isVh ? '' : (($data['password'] ?? '') ?: self::randomPassword());
        $cred = $isVh ? ['password_hash' => '', 'salt' => ''] : Auth::makeCredentials($password);
        $fonction = Contrats::checkAffectation(['contrat' => trim((string)($data['contrat'] ?? '')), 'fonction' => trim((string)($data['fonction'] ?? '')), 'role' => $role, 'type' => $type, 'origine' => ''], '');
        $agent = [
            'id' => newId('A'), 'nom' => $nom, 'fonction' => $fonction, 'affectation' => trim((string)($data['affectation'] ?? '')),
            'contrat' => trim((string)($data['contrat'] ?? '')), 'email' => $email, 'role' => $role,
            'chef_id' => $isAdmin ? (string)($data['chef_id'] ?? '') : $user['id'], 'actif' => '1',
            'acces_setup' => $isAdmin && $role === 'chef' && !empty($data['acces_setup']) ? '1' : '0', 'acces_exports' => $isAdmin && $role === 'chef' && !empty($data['acces_exports']) ? '1' : '0',
            'password_hash' => $cred['password_hash'], 'salt' => $cred['salt'], 'date_entree' => (string)($data['date_entree'] ?? ''), 'type' => $type, 'rotation' => $isVh ? '' : self::normRotation($data['rotation'] ?? ''),
        ];
        Store::writeTable('Agents', array_merge($all, [$agent]));
        return ['agent' => self::publicAgent($agent), 'password' => $password];
    }
    public static function update(array $user, $id, array $data): array {
        $all = self::list(); $a = self::applyUpdate($user, $all, $id, $data);
        Store::writeTable('Agents', $all);
        return self::publicAgent($a);
    }
    public static function updateMany(array $user, $ids, ?array $data): array {
        $ids = array_values(array_unique((array)($ids ?? [])));
        if (!$ids) throw httpErr('Aucun agent sélectionné');
        $allowed = [];
        foreach (['affectation', 'rotation', 'contrat', 'fonction', 'chef_id', 'actif'] as $k) if (isset($data[$k])) $allowed[$k] = $data[$k];
        if (!$allowed) throw httpErr('Rien à modifier : renseignez au moins un champ');
        $all = self::list();
        foreach ($ids as $id) self::applyUpdate($user, $all, $id, $allowed);
        Store::writeTable('Agents', $all);
        return ['modifies' => count($ids)];
    }
    private static function applyUpdate(array $user, array &$all, $id, array $data): array {
        $idx = null; foreach ($all as $i => $x) if ($x['id'] === $id) { $idx = $i; break; }
        if ($idx === null) throw httpErr('Agent introuvable');
        $a = &$all[$idx];
        if (!self::manageable($user, $a)) throw httpErr('Vous ne pouvez pas modifier cet agent', 'FORBIDDEN');
        $isAdmin = $user['role'] === 'admin';
        $before = ['contrat' => $a['contrat'], 'fonction' => $a['fonction'], 'actif' => $a['actif']];
        foreach (['nom', 'fonction', 'affectation', 'contrat', 'date_entree'] as $k) if (array_key_exists($k, $data) && $data[$k] !== null) $a[$k] = trim((string)$data[$k]);
        if (isset($data['email']) && $a['type'] !== 'vehicule') {
            $email = mb_strtolower(trim((string)$data['email']));
            if (!Format::validEmail($email)) throw httpErr('Email invalide');
            foreach ($all as $x) if ($x['id'] !== $id && mb_strtolower($x['email']) === $email) throw httpErr('Email déjà utilisé');
            $a['email'] = $email;
        }
        if (array_key_exists('rotation', $data) && $a['type'] !== 'vehicule') $a['rotation'] = self::normRotation($data['rotation']);
        if (array_key_exists('actif', $data) && $data['actif'] !== null) {
            $actif = self::flag($data['actif']);
            if ($actif === '0' && $a['role'] === 'admin' && self::activeAdmins($all) < 2) throw httpErr('Il faut au moins un administrateur');
            $a['actif'] = $actif;
        }
        if ($isAdmin) {
            if (isset($data['chef_id'])) $a['chef_id'] = (string)$data['chef_id'];
            if (isset($data['role']) && $a['type'] !== 'vehicule') {
                if (!in_array($data['role'], CFG()['ROLES'], true)) throw httpErr('Rôle invalide');
                if ($a['role'] === 'admin' && $data['role'] !== 'admin' && self::activeAdmins($all) < 2) throw httpErr('Il faut au moins un administrateur');
                $a['role'] = $data['role'];
            }
            if (isset($data['acces_setup'])) $a['acces_setup'] = self::flag($data['acces_setup']);
            if (isset($data['acces_exports'])) $a['acces_exports'] = self::flag($data['acces_exports']);
            if ($a['role'] !== 'chef') { $a['acces_setup'] = '0'; $a['acces_exports'] = '0'; }
        }
        if ($a['role'] !== 'admin' && $a['actif'] === '1' && ($a['contrat'] !== $before['contrat'] || $a['fonction'] !== $before['fonction'] || $before['actif'] !== '1')) $a['fonction'] = Contrats::checkAffectation($a, $a['id'], $all);
        $copy = $a; unset($a);
        return $copy;
    }
    public static function setPassword(array $user, $id, string $password): void {
        $all = self::list(); $idx = null; foreach ($all as $i => $x) if ($x['id'] === $id) { $idx = $i; break; }
        if ($idx === null) throw httpErr('Agent introuvable');
        if ($id !== $user['id'] && !self::manageable($user, $all[$idx])) throw httpErr('Accès refusé', 'FORBIDDEN');
        $cred = Auth::makeCredentials($password);
        $all[$idx]['password_hash'] = $cred['password_hash']; $all[$idx]['salt'] = $cred['salt'];
        Store::writeTable('Agents', $all);
        Auth::revokeAll('', $id);
    }
    public static function sendAccess(array $user, $id, $password): array {
        $a = self::get($id);
        if (!$a) throw httpErr('Agent introuvable');
        if (!self::manageable($user, $a)) throw httpErr('Accès refusé', 'FORBIDDEN');
        if ($a['type'] === 'vehicule' || !Format::validEmail($a['email'] ?? '')) throw httpErr("Cet agent n'a pas d'adresse e-mail");
        if ($a['actif'] !== '1') throw httpErr("Compte désactivé : réactivez-le avant d'envoyer les accès");
        $pw = (string)($password ?? ''); $reuse = $pw !== '' && Auth::check($a, $pw);
        if (!$reuse) { $pw = self::randomPassword(); self::setPassword($user, $id, $pw); }
        $societe = Params::get()['prestataire_nom'] ?: 'Sijil';
        $body = 'Bonjour ' . $a['nom'] . ",\n\nVotre accès à Sijil (" . $societe . ") :\nLien : " . Mail::shell() . "\nIdentifiant : " . $a['email'] . "\nMot de passe provisoire : " . $pw . "\n(à changer à la première connexion)\n\nCordialement,\n" . $user['nom'];
        Mail::send(['to' => $a['email'], 'replyTo' => $user['email'] ?: null, 'subject' => 'Votre accès Sijil — ' . $societe, 'body' => $body, 'societe' => $societe, 'cta' => ['label' => 'Ouvrir Sijil', 'url' => Mail::shell()]]);
        return ['envoye' => true, 'to' => $a['email'], 'nouveau' => !$reuse, 'password' => $reuse ? '' : $pw];
    }
    public static function changeOwnPassword(array $user, $current, $next): void {
        if (!Auth::check($user, $current)) throw httpErr('Mot de passe actuel incorrect');
        self::setPassword($user, $user['id'], (string)$next);
    }
    /** Création du premier administrateur (installation). */
    public static function ensureAdmin($email, $password, $nom = ''): ?array {
        $all = self::list();
        foreach ($all as $a) if ($a['role'] === 'admin') return null;
        $email = mb_strtolower(trim((string)$email));
        if (!Format::validEmail($email)) throw httpErr("E-mail de l'administrateur invalide");
        $cred = Auth::makeCredentials($password);
        $admin = ['id' => newId('A'), 'nom' => $nom ?: 'Administrateur', 'fonction' => '', 'affectation' => '', 'contrat' => '', 'email' => $email, 'role' => 'admin', 'chef_id' => '', 'actif' => '1', 'acces_setup' => '1', 'password_hash' => $cred['password_hash'], 'salt' => $cred['salt'], 'date_entree' => ''];
        Store::writeTable('Agents', array_merge($all, [$admin]));
        return self::publicAgent($admin);
    }
}
