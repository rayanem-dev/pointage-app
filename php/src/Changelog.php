<?php
/** Nouveautés selon le profil (« § » = éditeur seulement, « # » = administrateurs et responsables). */
final class Changelog {
    public static function view($niveau): array {
        $niveau = $niveau === true ? 'proprio' : (!$niveau ? 'tous' : $niveau);
        $out = [];
        foreach ($GLOBALS['SIJIL_GEN']['changelog'] as $v) {
            $pts = [];
            foreach ($v['points'] as $p) {
                if ($niveau !== 'proprio') { if (strpos($p, '§ ') === 0) continue; if (strpos($p, '# ') === 0 && $niveau !== 'staff') continue; }
                $pts[] = preg_replace('/^[§#] /u', '', $p);
            }
            if (!$pts) continue;
            $out[] = ['v' => $v['v'], 'date' => $v['date'], 'titre' => $niveau === 'proprio' ? $v['titre'] : ($v['titre_pub'] ?? $v['titre']), 'points' => $pts];
        }
        return $out;
    }
}
