<?php
/** Dispatcher RPC (équivalent de Main.gs) : contrôle des droits puis appel du module. */
final class Rpc {
    const STAFF = ['chef', 'admin']; const WORKERS = ['agent', 'chef', 'admin']; const VIEWERS = ['chef', 'admin', 'client'];
    private static function monthOrNow($m): string { return Dates::isMonthKey($m) ? $m : substr(Dates::today(), 0, 7); }
    private static function clientScope(array $u, $numero): void { if ($u['role'] === 'client' && $u['contrat'] !== '' && $u['contrat'] !== $numero) throw httpErr('Contrat non autorisé', 'FORBIDDEN'); }
    private static function inScope(array $u, $agentId): bool { foreach (Agents::visibleTo($u) as $a) if ($a['id'] === $agentId) return true; return false; }
    private static function exportsOk(array $u): void { if ($u['role'] === 'chef' && $u['acces_exports'] !== '1') throw httpErr("Accès aux exports non accordé (demandez-le à l'administrateur)", 'FORBIDDEN'); }
    private static function nonDispo(string $quoi): Closure { return function () use ($quoi) { throw httpErr($quoi . " : pas encore disponible dans la version PHP / MySQL"); }; }
    private static function filtrerType(array $list, bool $personnesSeules): array { return array_values(array_filter($list, fn($x) => !$personnesSeules || $x['type'] !== 'vehicule')); }

    public static function handlers(): array {
        static $H = null; if ($H) return $H;
        $S = self::STAFF; $W = self::WORKERS; $V = self::VIEWERS; $A = ['admin'];
        return $H = [
            // ----- public -----
            'appInfo' => ['pub' => true, 'fn' => function ($u, $a) {
                $p = Params::get();
                return ['multi' => false, 'version' => CFG()['VERSION'], 'copyright' => CFG()['COPYRIGHT'], 'shell' => Mail::shell(), 'installed' => Setup::hasAdmin(), 'prestataire' => $p['prestataire_nom'], 'code' => ''];
            }],
            'charte' => ['pub' => true, 'fn' => function () { $c = $GLOBALS['SIJIL_GEN']['charte']; return ['editeur' => CFG()['EDITEUR'], 'copyright' => CFG()['COPYRIGHT'], 'maj' => $c['maj'], 'sections' => $c['sections']]; }],
            'changelog' => ['pub' => true, 'fn' => fn() => ['version' => CFG()['VERSION'], 'copyright' => CFG()['COPYRIGHT'], 'versions' => Changelog::view(false)]],
            'changelogMoi' => ['roles' => ['agent', 'chef', 'admin', 'client'], 'fn' => fn($u) => ['version' => CFG()['VERSION'], 'copyright' => CFG()['COPYRIGHT'], 'versions' => Changelog::view(($u['role'] === 'admin' || $u['role'] === 'chef') ? 'staff' : 'tous')]],
            'login' => ['pub' => true, 'fn' => fn($u, $a) => Auth::login($a[0] ?? '', $a[1] ?? '', $a[2] ?? '', $a[3] ?? false)],
            'resume' => ['pub' => true, 'fn' => fn($u, $a) => Auth::resume($a[0] ?? '')],
            'forget' => ['pub' => true, 'fn' => fn($u, $a) => Auth::forget($a[0] ?? '')],
            'passwordForgot' => ['pub' => true, 'fn' => fn($u, $a) => Auth::forgot($a[0] ?? '', $a[1] ?? '')],
            'passwordReset' => ['pub' => true, 'write' => true, 'fn' => fn($u, $a) => Auth::resetPassword($a[0] ?? '', $a[1] ?? '', $a[2] ?? '', $a[3] ?? '')],
            // ----- tout utilisateur connecté -----
            'logout' => ['fn' => function ($u, $a, $token) { Auth::logout($token); return true; }],
            'me' => ['fn' => fn($u) => ['owner' => false, 'code' => '', 'user' => Agents::publicAgent($u), 'canSetup' => Auth::canSetup($u), 'params' => Params::pub(Params::get()), 'rotations' => CFG()['ROTATIONS']]],
            'remarqueAdd' => ['roles' => ['client', 'agent'], 'write' => true, 'fn' => fn($u, $a) => Remarques::add($u, $a[0] ?? [])],
            'remarqueTraiter' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Remarques::traiter($u, $a[0] ?? '', $a[1] ?? [])],
            'badges' => ['fn' => fn($u) => ['now' => nowIso(), 'documents' => Documents::nouveaux($u), 'demandes' => $u['role'] === 'agent' ? 0 : Demandes::counts($u)['a_traiter'], 'remarques' => Remarques::countNew($u)]],
            'documentsLus' => ['roles' => $W, 'write' => true, 'fn' => fn($u) => Documents::marquerLus($u)],
            'params' => ['fn' => fn() => Params::pub(Params::get())],
            'passwordOwn' => ['write' => true, 'fn' => function ($u, $a) { Agents::changeOwnPassword($u, $a[0] ?? '', $a[1] ?? ''); return true; }],
            'overview' => ['roles' => $W, 'fn' => function ($u, $a) {
                $key = self::monthOrNow($a[0] ?? null); $ov = Pointage::overview($u); $g = Pointage::grid($key, [$u]);
                $chef = $u['chef_id'] !== '' ? Agents::get($u['chef_id']) : null; $p = Params::get(); $rp = Agents::rotationParams($u, $p);
                return ['agent' => Agents::publicAgent($u), 'chef' => $chef ? ['id' => $chef['id'], 'nom' => $chef['nom']] : null, 'cumul' => $ov['cumul'], 'mois' => $ov['mois'], 'cycle' => $ov['cycle'], 'aujourdhui' => $ov['aujourdhui'], 'soldeChange' => $ov['soldeChange'], 'contrat' => Contrats::info($u['contrat']), 'today' => $ov['today'],
                    'month' => $key, 'nd' => $g['nd'], 'label' => $g['label'], 'grid' => $g['rows'][0] ?? null, 'rotation' => ['travail' => (int)$rp['jours_travail'], 'repos' => (int)$rp['jours_repos']], 'demandes' => Demandes::counts($u), 'documents' => Documents::count($u['id'])];
            }],
            'gridPeriod' => ['roles' => array_merge($V, ['agent']), 'fn' => function ($u, $a) {
                $list = Agents::visibleTo($u); if (!empty($a[2])) $list = array_values(array_filter($list, fn($x) => $x['contrat'] === $a[2]));
                $tl = Pointage::timeline(self::monthOrNow($a[0] ?? null), $a[1] ?? 1, $list, ($a[3] ?? true) !== false);
                $tl['remarques'] = Remarques::between($u, $tl['from'], $tl['to']); return $tl;
            }],
            'gridMonth' => ['roles' => array_merge($V, ['agent']), 'fn' => function ($u, $a) {
                $list = Agents::visibleTo($u); if (!empty($a[1])) $list = array_values(array_filter($list, fn($x) => $x['contrat'] === $a[1]));
                $g = Pointage::grid(self::monthOrNow($a[0] ?? null), $list); $g['remarques'] = Remarques::between($u, $g['month'] . '-01', $g['month'] . '-31'); return $g;
            }],
            'demandeModifier' => ['roles' => $W, 'write' => true, 'fn' => fn($u, $a) => Demandes::modifier($u, $a[0] ?? '', $a[1] ?? [])],
            'demandeReouvrir' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Demandes::reouvrir($u, $a[0] ?? '')],
            'demandeReponseDirection' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Demandes::repondreDirection($u, $a[0] ?? '', $a[1] ?? '', $a[2] ?? '')],
            'demandeDocuments' => ['roles' => $S, 'fn' => fn($u, $a) => Demandes::documentsPour($u, $a[0] ?? '')],
            'demandeCloturer' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Demandes::cloturer($u, $a[0] ?? '', $a[1] ?? null)],
            'demandeAnnulerCloture' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Demandes::annulerCloture($u, $a[0] ?? '')],
            'envoiAnnuler' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Demandes::annulerEnvoi($u, $a[0] ?? '')],
            'demandeSupprimer' => ['roles' => $W, 'write' => true, 'fn' => fn($u, $a) => Demandes::supprimer($u, $a[0] ?? '')],
            'demandesList' => ['roles' => $W, 'fn' => fn($u) => Demandes::lister($u)],
            'demandeCreate' => ['roles' => $W, 'write' => true, 'fn' => fn($u, $a) => Demandes::create($u, $a[0] ?? [])],
            'documentsList' => ['roles' => $W, 'fn' => fn($u, $a) => Documents::list($u, $a[0] ?? null)],
            'documentDownload' => ['roles' => $W, 'fn' => fn($u, $a) => Documents::download($u, $a[0] ?? '')],
            // ----- responsable d’équipe / admin -----
            'agentsVisible' => ['roles' => $S, 'fn' => fn($u, $a) => array_map([Agents::class, 'publicAgent'], self::filtrerType(Agents::visibleTo($u), !empty($a[0])))],
            'autoPointageGet' => ['roles' => $S, 'fn' => fn($u) => Auto::get($u)],
            'autoPointageSet' => ['roles' => $S, 'fn' => fn($u, $a) => Auto::set($u, $a[0] ?? [])],
            'pointerCompleter' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Pointage::completer($u, $a[0] ?? [])],
            'pointer' => ['roles' => $S, 'write' => true, 'fn' => function ($u, $a) {
                $o = $a[0] ?? []; if (!self::inScope($u, $o['agent_id'] ?? '')) throw httpErr("Cet agent n'est pas dans votre groupe", 'FORBIDDEN');
                return Pointage::setStatus($o['agent_id'], $o['date'] ?? '', $o['date_fin'] ?? null, $o['statut'] ?? '');
            }],
            'contratsLite' => ['roles' => $S, 'fn' => fn() => Contrats::effectifs()],
            'agentsManage' => ['roles' => $S, 'fn' => function ($u) {
                $all = Agents::list();
                if ($u['role'] !== 'admin') $all = array_values(array_filter($all, fn($x) => ($x['chef_id'] === $u['id'] || Agents::tous($u)) && $x['role'] === 'agent' && $x['origine'] === ''));
                return array_map([Agents::class, 'publicAgent'], Agents::alpha($all));
            }],
            'agentCreate' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Agents::create($u, $a[0] ?? [])],
            'agentsUpdateMany' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Agents::updateMany($u, $a[0] ?? [], $a[1] ?? [])],
            'agentUpdate' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Agents::update($u, $a[0] ?? '', $a[1] ?? [])],
            'agentEnvoyerAcces' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Agents::sendAccess($u, $a[0] ?? '', $a[1] ?? '')],
            'agentPassword' => ['roles' => $S, 'write' => true, 'fn' => function ($u, $a) { Agents::setPassword($u, $a[0] ?? '', (string)($a[1] ?? '')); return true; }],
            'demandeRepondre' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Demandes::repondre($u, $a[0] ?? '', $a[1] ?? '', $a[2] ?? '')],
            'demandesEnvoyer' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Demandes::envoyerDirection($u, $a[0] ?? null, $a[1] ?? '')],
            'envoiTraiter' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Demandes::traiterEnvoi($u, $a[0] ?? '', $a[1] ?? '', $a[2] ?? '')],
            'documentUpload' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Documents::upload($u, $a[0] ?? [])],
            'depotAdd' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Documents::depotAdd($u, $a[0] ?? [])],
            'depotList' => ['roles' => $S, 'fn' => fn($u) => Documents::depotList($u)],
            'depotUpdate' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Documents::depotUpdate($u, $a[0] ?? '', $a[1] ?? [])],
            'depotValider' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Documents::depotValider($u, $a[0] ?? [], ($a[1] ?? null) === true)],
            'depotApercu' => ['roles' => $S, 'fn' => fn($u, $a) => Documents::depotApercu($u, $a[0] ?? '')],
            'depotVider' => ['roles' => $S, 'write' => true, 'fn' => fn($u) => Documents::depotVider($u)],
            'depotRejeter' => ['roles' => $S, 'write' => true, 'fn' => fn($u, $a) => Documents::depotRejeter($u, $a[0] ?? [])],
            'documentUpdate' => ['roles' => $S, 'write' => true, 'fn' => function ($u, $a) { $o = $a[0] ?? []; return Documents::update($u, $o['id'] ?? '', $o); }],
            'documentDelete' => ['roles' => $S, 'write' => true, 'fn' => function ($u, $a) { Documents::remove($u, $a[0] ?? ''); return true; }],
            'ficheApercu' => ['roles' => $S, 'fn' => function ($u, $a) { $o = $a[0] ?? []; return DocData::ficheApercu($o['month'] ?? '', $o['contrat'] ?? '', Agents::visibleTo($u)); }],
            'exportFiche' => ['roles' => $V, 'fn' => function ($u, $a) {
                $o = $a[0] ?? []; if ($u['role'] === 'client') { $o['tous'] = false; if ($u['contrat'] !== '') $o['contrat'] = $u['contrat']; }
                $data = DocData::ficheData($o['month'] ?? '', $o['contrat'] ?? '', ['prevu' => !empty($o['prevu']), 'tous' => !empty($o['tous']), 'agents' => Agents::visibleTo($u)]);
                return Export::render('fiche', $data, $o['format'] ?? 'xlsx', 'Fiche_pointage_' . ($o['month'] ?? ''));
            }],
            // ----- onglet Setup -----
            'setupGet' => ['setup' => true, 'fn' => function ($u) {
                $vals = Params::get();
                if ($vals['client_emails'] === '') { $em = []; foreach (Contrats::contrats() as $c) if ($c['client_email'] !== '') foreach (preg_split('/[\s,;]+/', $c['client_email']) as $x) if ($x !== '' && !in_array($x, $em, true)) $em[] = $x; $vals['client_emails'] = implode(', ', array_slice($em, 0, 4)); }
                if ($vals['staff_emails'] === '' && strpos($vals['direction_nom'], '@') !== false) {
                    $resp = array_values(array_filter(preg_split('/[\s,;]+/', $vals['direction_nom']), fn($x) => strpos($x, '@') !== false));
                    $anciens = array_values(array_filter(preg_split('/[\s,;]+/', $vals['direction_email'])));
                    $vals['direction_email'] = implode(', ', array_slice($resp, 0, 2));
                    $vals['staff_emails'] = implode(', ', array_map(fn($x) => $x . '|0', array_slice(array_values(array_filter($anciens, fn($x) => !in_array($x, $resp, true))), 0, 4)));
                }
                return ['defs' => Params::defsForClient(), 'values' => $vals, 'isAdmin' => $u['role'] === 'admin', 'status' => Setup::status()];
            }],
            'setupSave' => ['setup' => true, 'write' => true, 'fn' => function ($u, $a) {
                $o = $a[0] ?? []; $res = Params::set($o); $comptes = [];
                if (array_key_exists('client_emails', $o) && $u['role'] === 'admin') $comptes = array_merge($comptes, Contrats::ensureClientAccounts($u));
                if ((array_key_exists('direction_email', $o) || array_key_exists('staff_emails', $o)) && $u['role'] === 'admin') { Params::set(['direction_nom' => '']); $comptes = array_merge($comptes, Contrats::ensurePrestataireAccounts($u)); }
                return (array_key_exists('client_emails', $o) || array_key_exists('direction_email', $o) || array_key_exists('staff_emails', $o)) && $u['role'] === 'admin' ? array_merge($res, ['comptes' => $comptes]) : $res;
            }],
            'logoUpload' => ['setup' => true, 'write' => true, 'fn' => fn($u, $a) => Params::logoUpload($a[0] ?? [])],
            'logoRemove' => ['setup' => true, 'write' => true, 'fn' => fn($u, $a) => Params::logoRemove($a[0] ?? '')],
            'logoView' => ['setup' => true, 'fn' => fn($u, $a) => Params::logoView($a[0] ?? '')],
            'bordereauAnalyser' => ['setup' => true, 'fn' => fn($u, $a) => Bordereau::analyser($a[0] ?? [])],
            'typesDemandeGet' => ['setup' => true, 'fn' => fn() => Demandes::typesConfig()],
            'typesDemandeSave' => ['setup' => true, 'write' => true, 'fn' => fn($u, $a) => Demandes::typesSave($u, $a[0] ?? [])],
            'contratsGet' => ['setup' => true, 'fn' => function () {
                $chefs = array_map(fn($c) => ['id' => $c['id'], 'nom' => $c['nom'], 'contrat' => $c['contrat']], array_values(array_filter(Agents::list(), fn($a) => $a['role'] === 'chef' && $a['actif'] === '1')));
                return ['contrats' => Contrats::contrats(), 'fonctions' => Contrats::fonctions(), 'chefs' => $chefs];
            }],
            'contratsSave' => ['setup' => true, 'write' => true, 'fn' => function ($u, $a) {
                $o = $a[0] ?? []; $res = ['contrats' => Contrats::saveContrats($o['contrats'] ?? []), 'fonctions' => Contrats::saveFonctions($o['fonctions'] ?? [])];
                $res['comptes'] = $u['role'] === 'admin' ? Contrats::ensureClientAccounts($u) : []; return $res;
            }],
            // ----- admin -----
            'moisList' => ['roles' => $A, 'fn' => fn() => Pointage::monthsWithData()],
            'attachementQte' => ['roles' => $A, 'write' => true, 'fn' => function ($u, $a) { $o = $a[0] ?? []; if (DocData::validation($o['contrat'] ?? '', $o['mois'] ?? '')) throw httpErr('Attachement validé : rouvrez-le pour modifier une quantité.'); Contrats::saveOverride($o); return true; }],
            'attachementValider' => ['roles' => $A, 'write' => true, 'fn' => function ($u, $a) { $o = $a[0] ?? []; return DocData::valider($u, $o['month'] ?? '', $o['contrat'] ?? ''); }],
            'attachementRouvrir' => ['roles' => $A, 'write' => true, 'fn' => function ($u, $a) { $o = $a[0] ?? []; return DocData::rouvrir($u, $o['month'] ?? '', $o['contrat'] ?? ''); }],
            'attachementFacturer' => ['roles' => $A, 'write' => true, 'fn' => function ($u, $a) { $o = $a[0] ?? []; return DocData::facturer($u, $o['month'] ?? '', $o['contrat'] ?? '', $o); }],
            'contratsSynthese' => ['roles' => $V, 'fn' => fn($u) => Contrats::synthese($u['role'] === 'admin', $u['role'] !== 'chef', $u['role'] === 'client' ? $u['contrat'] : '')],
            'attachementPreview' => ['roles' => ['admin', 'chef'], 'fn' => function ($u, $a) { self::exportsOk($u); return DocData::attachementData($a[0] ?? '', $a[1] ?? ''); }],
            'exportAttachement' => ['roles' => ['admin', 'chef', 'client'], 'fn' => function ($u, $a) {
                $o = $a[0] ?? []; self::clientScope($u, $o['contrat'] ?? ''); self::exportsOk($u);
                $d = DocData::attachementData($o['month'] ?? '', $o['contrat'] ?? '');
                if ($u['role'] === 'client' && !$d['verrouille']) throw httpErr("Cet attachement n'est pas encore validé", 'FORBIDDEN');
                return Export::render('attachement', $d, $o['format'] ?? 'xlsx', 'Attachement_N' . $d['numero'] . '_' . ($o['month'] ?? ''));
            }],
            'factureCopie' => ['roles' => ['admin', 'chef', 'client'], 'fn' => function ($u, $a) {
                $o = $a[0] ?? []; self::clientScope($u, $o['contrat'] ?? ''); self::exportsOk($u);
                if (empty(DocData::attachementData($o['month'] ?? '', $o['contrat'] ?? '')['facture_numero'])) throw httpErr("Cette facture n'est pas encore établie", 'FORBIDDEN');
                $d = DocData::factureData($o['month'] ?? '', $o['contrat'] ?? '');
                return Export::render('facture', $d, $o['format'] ?? 'xlsx', 'Facture_' . preg_replace('/[^\w-]+/', '_', (string)($d['facture_numero'] ?: ($o['month'] ?? ''))));
            }],
            'exportFacture' => ['roles' => $A, 'write' => true, 'fn' => function ($u, $a) {
                $o = $a[0] ?? [];
                if (!empty($o['facture_numero'])) DocData::facturer($u, $o['month'] ?? '', $o['contrat'] ?? '', $o);
                elseif (empty(DocData::attachementData($o['month'] ?? '', $o['contrat'] ?? '')['facture_numero'])) throw httpErr('N° de facture obligatoire');
                $d = DocData::factureData($o['month'] ?? '', $o['contrat'] ?? '');
                return Export::render('facture', $d, $o['format'] ?? 'xlsx', 'Facture_' . preg_replace('/[^\w-]+/', '_', (string)($d['facture_numero'] ?: ($o['month'] ?? ''))));
            }],
            'connexions' => ['roles' => $A, 'fn' => fn() => ['maintenant' => nowIso(), 'gens' => Auth::activity()]],
            'cacheVider' => ['roles' => $A, 'fn' => function () { Store::reset(); return ['ok' => true, 'at' => nowIso()]; }],
            'repairStructure' => ['roles' => $A, 'write' => true, 'fn' => fn() => Setup::repairStructure()],
            'vider' => ['roles' => $A, 'write' => true, 'fn' => fn($u, $a) => Setup::vider($a[0] ?? '', $a[1] ?? '')],
            'pointageExport' => ['roles' => $A, 'fn' => fn($u, $a) => Archive::exportXlsx($u, $a[0] ?? [])],
            'pointageImportAnalyser' => ['roles' => $A, 'fn' => fn($u, $a) => PointageImport::analyser($a[0] ?? [])],
            'pointageImportAppliquer' => ['roles' => $A, 'write' => true, 'fn' => fn($u, $a) => PointageImport::appliquer($u, $a[0] ?? [])],
            'apropos' => ['roles' => $A, 'fn' => function () { $c = conf('editeur', []); return ['societe' => Params::get()['prestataire_nom'], 'code' => '', 'licence' => ['statut' => 'actif', 'fin' => '', 'jours' => null, 'illimitee' => true], 'editeur' => ['nom' => $c['nom'] ?? CFG()['EDITEUR'], 'email' => $c['email'] ?? '', 'tel' => $c['tel'] ?? ''], 'version' => CFG()['VERSION'], 'copyright' => CFG()['COPYRIGHT']]; }],
            'commentaire' => ['roles' => $A, 'write' => true, 'fn' => function ($u, $a) {
                $o = $a[0] ?? []; $sujet = mb_substr(trim((string)($o['sujet'] ?? '')), 0, 120); $message = mb_substr(trim((string)($o['message'] ?? '')), 0, 4000);
                if (mb_strlen($message) < 5) throw httpErr('Écrivez votre commentaire');
                if (!Format::allow('CMT_' . $u['id'], 5, 3600)) throw httpErr('Trop de messages : réessayez dans une heure');
                $to = (conf('editeur', [])['email'] ?? '');
                if ($to === '') throw httpErr("L'éditeur n'a pas encore indiqué son adresse e-mail : contactez-le directement");
                Mail::send(['to' => $to, 'replyTo' => $u['email'], 'subject' => '[Sijil] ' . (Params::get()['prestataire_nom'] ?: 'Client') . ' — ' . ($sujet ?: 'Commentaire'), 'body' => $message . "\n\n— " . $u['nom'] . ' <' . $u['email'] . ">\nVersion : " . CFG()['VERSION']]);
                return ['envoye' => true];
            }],
            'backupCreate' => ['roles' => $A, 'write' => true, 'fn' => fn($u) => Setup::backup($u)],
            'backupList' => ['roles' => $A, 'fn' => fn() => Setup::listBackups()],
            'backupRestore' => ['roles' => $A, 'write' => true, 'fn' => fn($u, $a) => Setup::restore($u, $a[0] ?? '', $a[1] ?? '')],
            'backupDelete' => ['roles' => $A, 'write' => true, 'fn' => fn($u, $a) => Setup::removeBackup($a[0] ?? '')],
        ];
    }

    /** Seule entrée appelée par l'interface : enveloppe { ok, data | error, code }. */
    public static function call($token, $name, $args): array {
        try {
            $h = self::handlers()[$name] ?? null;
            if (!$h) throw httpErr('Fonction inconnue : ' . $name);
            $user = !empty($h['pub']) ? null : Auth::userFromToken($token);
            if (!empty($h['roles']) && !in_array($user['role'], $h['roles'], true)) throw httpErr('Accès refusé', 'FORBIDDEN');
            if (!empty($h['setup']) && !Auth::canSetup($user)) throw httpErr("Accès au Setup non autorisé (demandez-le à l'administrateur)", 'FORBIDDEN');
            $run = fn() => $h['fn']($user, is_array($args) ? $args : [], $token);
            return ['ok' => true, 'data' => !empty($h['write']) ? Store::withLock($run) : $run()];
        } catch (SijilError $e) {
            return ['ok' => false, 'error' => $e->getMessage(), 'code' => $e->errCode];
        } catch (Throwable $e) {
            error_log($e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            return ['ok' => false, 'error' => conf('debug') ? $e->getMessage() : 'Erreur interne du serveur', 'code' => 'ERR'];
        }
    }
}
