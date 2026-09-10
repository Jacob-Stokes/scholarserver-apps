#!/bin/bash
set -euo pipefail
: "${N8N_IMAGE:?Provide the native n8n image}"
: "${INTEGRATION_IMAGE:?Provide the native integration image}"
case "$(docker info --format '{{.Architecture}}')" in
  x86_64|amd64) native_arch=amd64 ;;
  aarch64|arm64) native_arch=arm64 ;;
  *) echo "This test requires a supported native Linux Docker host." >&2; exit 1 ;;
esac
for image in "$N8N_IMAGE" "$INTEGRATION_IMAGE"; do
  if [ "$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')" != "linux/$native_arch" ]; then
    echo "Refusing a non-native test image: $image" >&2
    exit 1
  fi
done
prefix="scholarserver-n8n-ci-$$"
n8n_ports=(--expose 5678)
integration_ports=(--expose 8080)
if [ "${SCHOLARSERVER_CHECK_BROWSER:-0}" = 1 ] || [ "${SCHOLARSERVER_EXPOSE_TEST_UI:-0}" = 1 ]; then
  n8n_ports=(-p 127.0.0.1:18230:5678)
  integration_ports=(-p 127.0.0.1:18231:8080)
fi
cleanup() {
  docker rm -f "$prefix-app" "$prefix-integration" "$prefix-research-fixture" >/dev/null 2>&1 || true
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
  --cpus=1 --memory=1g --memory-swap=1g --pids-limit=128 \
  --tmpfs /tmp:rw,nosuid,nodev,size=128m -v "$prefix-state:/home/node/.n8n" \
  -v "$prefix-cache:/home/node/.cache" "${n8n_ports[@]}" "$N8N_IMAGE" >/dev/null
docker run -d --name "$prefix-integration" --network "$prefix" --network-alias integration \
  --read-only --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges \
  --cpus=0.5 --memory=192m --memory-swap=192m --pids-limit=64 \
  -v "$prefix-runtime:/runtime" "${integration_ports[@]}" "$INTEGRATION_IMAGE" >/dev/null
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
  assert.equal(status.phase, "password-required");
  const html = await (await fetch("http://localhost:8080/")).text();
  assert.match(html, /assets/);
'
docker exec -i -w /app/integration "$prefix-integration" node --input-type=module < apps/n8n/integration/check-password-setup.mjs
service_identity_before=$(docker exec "$prefix-integration" sha256sum /runtime/manager-connection.json)
docker restart "$prefix-integration" >/dev/null
for attempt in $(seq 1 30); do
  if docker exec "$prefix-integration" node -e 'fetch("http://localhost:8080/api/status").then(async r => { if (!(await r.json()).connected) process.exit(1); }).catch(() => process.exit(1));'; then break; fi
  sleep 1
done
docker exec "$prefix-integration" node --input-type=module -e '
  import assert from "node:assert/strict";
  assert.deepEqual(await (await fetch("http://localhost:8080/api/status")).json(), { connected: true, phase: "ready" });
  const { ManagerConnection } = await import("/app/integration/manager-connection.mjs");
  await new ManagerConnection("/runtime").read();
'
service_identity_after=$(docker exec "$prefix-integration" sha256sum /runtime/manager-connection.json)
if [ "$service_identity_before" != "$service_identity_after" ]; then
  echo "Controller restart changed the saved Manager service identity." >&2
  exit 1
fi
if [ "${SCHOLARSERVER_CHECK_BROWSER:-0}" = 1 ]; then
  node apps/n8n/integration/check-app-ui.mjs
  docker exec -i -w /app/integration "$prefix-integration" node --input-type=module < apps/n8n/integration/check-managed.mjs
fi
echo "Native read-only n8n and integration startup passed."
if [ "${SCHOLARSERVER_CHECK_RESEARCH:-0}" = 1 ]; then
  docker run -d --name "$prefix-research-fixture" --network "$prefix" --network-alias manager --network-alias scholarserver-manager \
    --read-only --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges \
    --tmpfs /tmp:rw,nosuid,nodev,size=32m \
    -v "$prefix-runtime:/runtime:ro" \
    -v "$PWD/apps/n8n/integration/check-research-fixture.mjs:/fixture.mjs:ro" \
    -v "$PWD/apps/obsidian/sync/research-note.mjs:/research-note.mjs:ro" \
    --entrypoint node "$INTEGRATION_IMAGE" /fixture.mjs >/dev/null
  if [ "${SCHOLARSERVER_CHECK_BROWSER:-0}" = 1 ]; then
    node apps/n8n/ui/check-catalog-native.mjs
  fi
  docker exec -i -w /app/integration "$prefix-integration" node --input-type=module < apps/n8n/integration/check-research-install.mjs
  # Restart before execution so a success proves the saved connection and n8n
  # credential material still work, rather than only surviving in memory.
  docker restart "$prefix-app" "$prefix-integration" >/dev/null
  restarted=false
  for attempt in $(seq 1 90); do
    if docker exec "$prefix-integration" node -e 'fetch("http://localhost:8080/api/automations", {signal:AbortSignal.timeout(5000)}).then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));'; then
      restarted=true
      break
    fi
    sleep 2
  done
  if [ "$restarted" != true ]; then echo "Research inventory did not recover after restart." >&2; exit 1; fi
  workflow_ids=$(docker exec "$prefix-integration" node -e 'console.log(JSON.parse(require("fs").readFileSync("/runtime/research-test-ids.json")).join(" "))')
  for workflow_id in $workflow_ids; do
    node apps/n8n/integration/check-research-execute.mjs "$prefix-app" "$workflow_id"
    node apps/n8n/integration/check-research-execute.mjs "$prefix-app" "$workflow_id"
  done
  docker exec "$prefix-integration" node -e 'fetch("http://manager:8080/verify").then(async r => { const result = await r.json(); if (!r.ok) throw Error(JSON.stringify(result)); console.log(result); }).catch(error => { console.error(error); process.exit(1); })'
fi
