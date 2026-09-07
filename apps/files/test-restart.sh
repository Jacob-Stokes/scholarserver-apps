#!/usr/bin/env bash
set -euo pipefail
image=${1:?Pass the locally built native image}
directory=$(cd "$(dirname "$0")" && pwd)
runtime=$(docker volume create)
data=$(docker volume create)
container=""
cleanup() {
  if [ -n "$container" ]; then docker rm --force "$container" >/dev/null; fi
  docker volume rm "$runtime" "$data" >/dev/null
}
trap cleanup EXIT
docker run --rm --network none --user 0:0 --volume "$runtime:/runtime" --volume "$data:/data" \
  --entrypoint node "$image" -e "const f=require('fs');for(const p of ['/runtime','/data']){f.chownSync(p,1000,1000);f.chmodSync(p,0o700)}"
container=$(docker run --detach --restart unless-stopped --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777 \
  --volume "$runtime:/runtime" --volume "$data:/shared/read-write" \
  --volume "$directory/fixtures:/shared/read-only:ro" \
  --volume "$directory/container-proof.mjs:/app/container-proof.mjs:ro" "$image")
ready() {
  for attempt in {1..30}; do
    if docker exec "$container" node -e "fetch('http://127.0.0.1:7014/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}
fingerprint() {
  docker exec "$container" node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('/runtime/service-token')).digest('hex'))"
}
ready
docker exec "$container" node /app/container-proof.mjs
before=$(fingerprint)
# Terminate only the identified upstream worker, not an arbitrary container process.
docker exec "$container" node -e "const f=require('fs');const ids=f.readFileSync('/proc/1/task/1/children','utf8').trim().split(/\s+/);const worker=ids.find(id=>f.readFileSync('/proc/'+id+'/cmdline','utf8').includes('server-filesystem/dist/index.js'));if(!worker)throw Error('Worker not found');process.kill(Number(worker),'SIGKILL')"
for attempt in {1..30}; do
  if [ "$(docker inspect --format '{{.RestartCount}}' "$container")" -ge 1 ]; then break; fi
  sleep 1
done
test "$(docker inspect --format '{{.RestartCount}}' "$container")" -ge 1
ready
test "$before" = "$(fingerprint)"
docker exec "$container" node -e "require('assert').equal(require('fs').readFileSync('/shared/read-write/proof.md','utf8'),'Synthetic container proof')"
docker exec "$container" node /app/container-proof.mjs
echo 'Unexpected worker failure recovered automatically; credentials and synthetic data survived.'
