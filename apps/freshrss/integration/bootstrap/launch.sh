#!/bin/sh
set -eu
cd /var/www/FreshRSS
# Keep the upstream image untouched; only runtime Apache paths change.
sed 's@IncludeOptional /etc/apache2/conf.d/\*.conf@IncludeOptional /etc/apache2/conf.d/php*.conf\nInclude /tmp/freshrss.conf@; s@^PidFile .*@PidFile /tmp/httpd.pid@' /etc/apache2/httpd.conf > /tmp/httpd.conf
sed 's/^Listen 80/Listen 8080/; /^CustomLog /d; /^RemoteIPHeader /d; /^RemoteIPInternalProxy /d' /etc/apache2/conf.d/FreshRSS.Apache.conf > /tmp/freshrss.conf
php cli/prepare.php
php /opt/scholarserver/worker.php &
worker=$!
httpd -f /tmp/httpd.conf -c 'PidFile /tmp/httpd.pid' -D FOREGROUND &
web=$!
trap 'kill "$web" "$worker" 2>/dev/null || true; wait || true' EXIT TERM INT
while kill -0 "$web" 2>/dev/null && kill -0 "$worker" 2>/dev/null; do sleep 2; done
exit 1
