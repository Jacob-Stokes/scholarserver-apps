<?php
declare(strict_types=1);
require '/var/www/FreshRSS/cli/_cli.php';
$binding = json_decode(file_get_contents('/runtime/browser-identity.json'), true, 32, JSON_THROW_ON_ERROR);
$account = json_decode(file_get_contents('/runtime/account.json'), true, 32, JSON_THROW_ON_ERROR);
if (!in_array($account['username'], FreshRSS_user_Controller::listUsers(), true)) {
    throw new RuntimeException('The linked reader account is missing');
}
$proxy = gethostbyname('integration');
if (!filter_var($proxy, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) throw new RuntimeException('Reader proxy is unavailable');
$config = FreshRSS_Context::systemConf();
if (!is_file('/runtime/browser-auth-backup.json')) {
    file_put_contents('/runtime/browser-auth-backup.json', json_encode([
        'auth_type' => $config->auth_type,
        'http_auth_auto_register' => $config->http_auth_auto_register,
        'trusted_sources' => $config->trusted_sources,
    ], JSON_THROW_ON_ERROR));
}
// Only the integration on this instance's private network can supply identity.
// The integration verifies Manager's signature and exact account binding first.
$config->auth_type = 'http_auth';
$config->http_auth_auto_register = false;
$config->trusted_sources = [$proxy . '/32'];
$config->save();
// Node fingerprints the parsed declaration in this fixed property order.
$ordered = [
    'version' => $binding['version'], 'audience' => $binding['audience'],
    'subject' => $binding['subject'], 'username' => $binding['username'],
    'publicKey' => $binding['publicKey'],
];
$fingerprint = hash('sha256', json_encode($ordered, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
file_put_contents('/runtime/browser-identity-ready.json.tmp', json_encode(['fingerprint' => $fingerprint], JSON_THROW_ON_ERROR));
rename('/runtime/browser-identity-ready.json.tmp', '/runtime/browser-identity-ready.json');
