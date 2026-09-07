<?php
declare(strict_types=1);
require '/var/www/FreshRSS/cli/_cli.php';
$configuration = FreshRSS_Context::systemConf();
$extensions = $configuration->attributeArray('extensions_enabled') ?? [];
if (($extensions['ScholarServer appearance'] ?? false) !== true) {
    $extensions['ScholarServer appearance'] = true;
    $configuration->extensions_enabled = $extensions;
    $configuration->save();
}
