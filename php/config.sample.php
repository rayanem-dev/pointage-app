<?php
// Copiez ce fichier en config.php et renseignez vos valeurs (config.php ne doit jamais être publié).
return [
    'db' => ['host' => 'localhost', 'name' => 'sijil', 'user' => 'sijil', 'pass' => 'mot-de-passe'],
    'timezone' => 'Africa/Algiers',
    'app_url' => 'https://votre-domaine.dz/sijil/',   // adresse publique de l'application (liens des e-mails)
    'mail_from' => 'noreply@votre-domaine.dz',         // expéditeur des e-mails (doit appartenir à votre domaine)
    'data_dir' => __DIR__ . '/data',                   // documents et sauvegardes : de préférence HORS du dossier public
    'ocr' => true,                                     // lecture du contenu des documents (nécessite pdftotext / tesseract sur le serveur)
    'editeur' => ['nom' => 'JawlaDev', 'email' => '', 'tel' => ''],
    'debug' => false,                                  // true : affiche le détail des erreurs internes
    'cron_key' => 'changez-moi',                       // clé pour lancer cron.php depuis une URL (si votre hébergeur ne permet que cela)
];
