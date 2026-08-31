#!/bin/sh
set -eu

secrets=/livesync-runtime/livesync-couchdb.env
while [ ! -s "$secrets" ]; do sleep 1; done

COUCHDB_USER=$(sed -n 's/^COUCHDB_USER=//p' "$secrets")
COUCHDB_PASSWORD=$(sed -n 's/^COUCHDB_PASSWORD=//p' "$secrets")
[ -n "$COUCHDB_USER" ] && [ -n "$COUCHDB_PASSWORD" ]
export COUCHDB_USER COUCHDB_PASSWORD

exec /docker-entrypoint.sh /opt/couchdb/bin/couchdb
