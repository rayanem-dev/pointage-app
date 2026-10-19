<?php
/** Version PHP : une installation = une société (pas d'annuaire de clients ni de console éditeur). */
final class Tenants {
    public static function multi(): bool { return false; }
    public static function use($code = ''): array { return ['code' => '']; }
    public static function codeActuel(): string { return ''; }
    public static function lien(string $code = ''): string { return Mail::shell(); }
    public static function isOwner($u): bool { return false; }
}
