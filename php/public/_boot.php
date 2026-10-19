<?php
// Charge Sijil : dossier « src » à côté de « public » (cas normal), ou ailleurs si public/base.txt contient son chemin (hébergement mutualisé).
$base = is_file(__DIR__ . '/base.txt') ? rtrim(trim((string)file_get_contents(__DIR__ . '/base.txt')), '/') : __DIR__ . '/..';
require $base . '/src/bootstrap.php';
