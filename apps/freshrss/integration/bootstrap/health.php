<?php
$connection = @fsockopen('127.0.0.1', 8080, $errno, $error, 2);
$heartbeat = @filemtime('/runtime/heartbeat');
exit($connection && $heartbeat && time() - $heartbeat < 300 ? 0 : 1);
