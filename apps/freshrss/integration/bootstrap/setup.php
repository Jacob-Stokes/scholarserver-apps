<?php
declare(strict_types=1);
// Use the same upstream user-creation API as cli/create-user.php, without
// putting passwords in process arguments. Only our fixed account is managed.
require '/var/www/FreshRSS/cli/_cli.php';
$request = json_decode(file_get_contents('/runtime/account.json'), true, 32, JSON_THROW_ON_ERROR);
$username = $request['username'];
if (!FreshRSS_user_Controller::checkUsername($username)) throw new RuntimeException('Invalid user');
if (!in_array($username, FreshRSS_user_Controller::listUsers(), true)) {
    $created = FreshRSS_user_Controller::createUser($username, '', $request['password'], [
        'language' => 'en', 'is_admin' => true, 'enabled' => true,
    ], false);
    if (!$created) throw new RuntimeException('Could not create account');
}
cliInitUser($username);
$error = FreshRSS_api_Controller::updatePassword($request['apiPassword']);
if ($error !== false) throw new RuntimeException('Could not configure API');
invalidateHttpCache($username);
