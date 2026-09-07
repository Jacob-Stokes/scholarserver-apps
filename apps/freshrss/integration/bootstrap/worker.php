<?php
declare(strict_types=1);
umask(0077);
function status(array $value): void {
    file_put_contents('/runtime/worker-status.json.tmp', json_encode($value, JSON_THROW_ON_ERROR));
    rename('/runtime/worker-status.json.tmp', '/runtime/worker-status.json');
}
function command(array $arguments): void {
    // Upstream can log exception details. Do not forward credential-related output.
    $process = proc_open($arguments, [0 => ['file', '/dev/null', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes, '/var/www/FreshRSS');
    if (!is_resource($process)) throw new RuntimeException('FreshRSS could not start');
    $deadline = time() + 240;
    do {
        touch('/runtime/heartbeat');
        $state = proc_get_status($process);
        if (!$state['running']) break;
        if (time() >= $deadline) {
            proc_terminate($process, 9);
            proc_close($process);
            throw new RuntimeException('FreshRSS operation timed out');
        }
        usleep(200000);
    } while (true);
    proc_close($process);
    if ($state['exitcode'] !== 0) throw new RuntimeException('FreshRSS operation failed');
}
$lastRefresh = 0;
while (true) {
    touch('/runtime/heartbeat');
    try {
        if (is_file('/runtime/account.json') && !is_file('/runtime/setup-complete')) {
            $account = json_decode(file_get_contents('/runtime/account.json'), true, 32, JSON_THROW_ON_ERROR);
            status(['phase' => 'preparing', 'ready' => false]);
            if (!is_file('/var/www/FreshRSS/data/applied_migrations.txt')) {
                command(['php', 'cli/do-install.php', '--default-user', $account['username'], '--db-type', 'sqlite', '--api-enabled', '--disable-update', '--base-url', 'http://freshrss:8080']);
            }
            command(['php', '/opt/scholarserver/setup.php']);
            file_put_contents('/runtime/setup-complete', '1');
        }
        if (is_file('/runtime/setup-complete')) {
            if (time() - $lastRefresh >= 1800 || is_file('/runtime/refresh-request')) {
                status(['phase' => 'refreshing', 'ready' => true]);
                @unlink('/runtime/refresh-request');
                command(['php', 'app/actualize_script.php']);
                $lastRefresh = time();
            }
            status(['phase' => 'ready', 'ready' => true, 'lastRefresh' => $lastRefresh]);
        } else {
            status(['phase' => 'account', 'ready' => false]);
        }
    } catch (Throwable $error) {
        status(['phase' => 'error', 'ready' => is_file('/runtime/setup-complete'), 'error' => 'FreshRSS could not complete this step. Your existing data has been kept. Retry after checking the service.']);
        sleep(15);
    }
    sleep(3);
}
