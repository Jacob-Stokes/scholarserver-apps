#!/bin/sh
set -eu
secrets=/livesync-runtime/livesync-couchdb.env
[ -s "$secrets" ] || exit 1
user=$(sed -n 's/^COUCHDB_USER=//p' "$secrets")
password=$(sed -n 's/^COUCHDB_PASSWORD=//p' "$secrets")
curl --fail --silent --user "$user:$password" http://127.0.0.1:5984/_up >/dev/null
