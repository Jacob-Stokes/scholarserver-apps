#!/bin/bash
set -euo pipefail
: "${N8N_IMAGE:?Provide the native n8n image}"
: "${INTEGRATION_IMAGE:?Provide the native integration image}"
prefix="scholarserver-n8n-ci-$$"
cleanup() {
  docker rm -f "$prefix-app" "$prefix-integration" >/dev/null 2>&1 || true
  docker volume rm "$prefix-state" "$prefix-cache" "$prefix-runtime" >/dev/null 2>&1 || true
  docker network rm "$prefix" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create "$prefix" >/dev/null
for volume in state cache runtime; do docker volume create "$prefix-$volume" >/dev/null; done
docker run --rm --user 0 --entrypoint sh \
  -v "$prefix-state:/state" -v "$prefix-cache:/cache" -v "$prefix-runtime:/runtime" \
  "$INTEGRATION_IMAGE" -c 'chown 1000:1000 /state /cache /runtime && chmod 700 /state /cache /runtime'
docker run -d --name "$prefix-app" --network "$prefix" --network-alias n8n \
  --read-only --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,nosuid,nodev,size=128m -v "$prefix-state:/home/node/.n8n" \
  -v "$prefix-cache:/home/node/.cache" "$N8N_IMAGE" >/dev/null
docker run -d --name "$prefix-integration" --network "$prefix" \
  --read-only --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges \
  -v "$prefix-runtime:/runtime" "$INTEGRATION_IMAGE" >/dev/null
ready=false
for attempt in $(seq 1 90); do
  if docker exec "$prefix-integration" node -e 'fetch("http://n8n:5678/healthz/readiness").then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));'; then
    ready=true
    break
  fi
  sleep 2
done
if [ "$ready" != true ]; then docker logs "$prefix-app"; exit 1; fi
docker exec "$prefix-integration" node --input-type=module -e '
  import assert from "node:assert/strict";
  const status = await (await fetch("http://localhost:8080/api/status")).json();
  assert.deepEqual(status, { connected: false });
  const html = await (await fetch("http://localhost:8080/")).text();
  assert.match(html, /assets/);
'
docker restart "$prefix-integration" >/dev/null
echo "Native read-only n8n and integration startup passed."
