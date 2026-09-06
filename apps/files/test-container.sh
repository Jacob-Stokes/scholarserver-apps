#!/usr/bin/env bash
set -euo pipefail
image=${1:?Pass the locally built native image}
directory=$(cd "$(dirname "$0")" && pwd)
container=$(docker run --detach --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777 \
  --tmpfs /runtime:rw,noexec,nosuid,nodev,size=1m,uid=1000,gid=1000,mode=0700 \
  --tmpfs /shared/read-write:rw,noexec,nosuid,nodev,size=16m,uid=1000,gid=1000,mode=0700 \
  --volume "$directory/fixtures:/shared/read-only:ro" \
  --volume "$directory/container-proof.mjs:/app/container-proof.mjs:ro" "$image")
trap 'docker rm --force "$container" >/dev/null' EXIT
for attempt in {1..30}; do
  if docker exec "$container" node -e "fetch('http://127.0.0.1:7014/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    docker exec "$container" node /app/container-proof.mjs
    exit 0
  fi
  sleep 1
done
echo 'Files did not become ready' >&2
exit 1
