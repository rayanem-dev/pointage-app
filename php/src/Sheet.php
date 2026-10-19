<?php
/** Feuille de calcul neutre (valeurs, styles, fusions, largeurs, images) : sert à produire le même document en Excel et en PDF. */
final class Sheet {
    public string $name = 'Feuille1';
    public array $cells = [];   // r => c => ['v' => valeur, 'f' => formule|null, 's' => style]
    public array $merges = [];  // [r, c, nr, nc]
    public array $colW = [];    // c (1..) => pixels
    public array $rowH = [];    // r => pixels
    public array $images = [];  // ['bytes', 'mime', 'r', 'c', 'h' (px)]
    public bool $landscape = true;
    public bool $gridlines = false;
    public int $frozenRows = 0;

    public function widths(array $px): void { foreach ($px as $i => $w) $this->colW[$i + 1] = $w; }
    public function put(int $r, int $c, $v, array $s = [], ?string $formula = null): void {
        $this->cells[$r][$c] = ['v' => $v, 'f' => $formula, 's' => $s + ($this->cells[$r][$c]['s'] ?? [])];
    }
    public function style(int $r, int $c, int $nr, int $nc, array $s): void {
        for ($i = $r; $i < $r + $nr; $i++) for ($j = $c; $j < $c + $nc; $j++) {
            $cur = $this->cells[$i][$j] ?? ['v' => null, 'f' => null, 's' => []];
            $cur['s'] = $s + $cur['s']; $this->cells[$i][$j] = $cur;
        }
    }
    public function merged(int $r, int $c, int $nr, int $nc, $v, array $s = []): void {
        $this->style($r, $c, $nr, $nc, $s);
        $this->cells[$r][$c]['v'] = $v;
        $this->merges[] = [$r, $c, $nr, $nc];
    }
    public function image(?string $fileId, int $r, int $c, int $hPx = 70): void {
        if (!$fileId) return;
        $m = Files::meta($fileId); $b = Files::bytes($fileId);
        if ($m && $b !== null && in_array($m['mime'], ['image/png', 'image/jpeg', 'image/gif'], true)) $this->images[] = ['bytes' => $b, 'mime' => $m['mime'], 'r' => $r, 'c' => $c, 'h' => $hPx];
    }
    public function maxRow(): int { return $this->cells ? max(array_keys($this->cells)) : 0; }
    public function maxCol(): int { $m = 0; foreach ($this->cells as $row) foreach (array_keys($row) as $c) $m = max($m, $c); return $m; }
    public function colWidth(int $c): int { return $this->colW[$c] ?? 100; }
}
