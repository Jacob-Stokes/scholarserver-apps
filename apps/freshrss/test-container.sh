#!/bin/bash
set -euo pipefail
reader_image=${1:?reader image required}
integration_image=${2:?integration image required}
prefix="scholarserver-freshrss-test-$$"
proof_dir=$(mktemp -d /tmp/scholarserver-freshrss-test.XXXXXX)
cleanup() {
  docker rm -f "$prefix-reader" "$prefix-integration" >/dev/null 2>&1 || true
  docker network rm "$prefix" >/dev/null 2>&1 || true
  # Only the exact disposable directory created by this invocation is removed.
  docker run --rm -v "$proof_dir:/proof" --entrypoint /bin/sh "$reader_image" -c 'rm -rf /proof/data /proof/runtime /proof/data.before /proof/runtime.before /proof/backup.tar' >/dev/null 2>&1 || true
  docker run --rm --user 0 -v "$proof_dir:/proof" --entrypoint chown "$reader_image" "$(id -u):$(id -g)" /proof >/dev/null 2>&1 || true
  rmdir "$proof_dir" 2>/dev/null || true
}
trap cleanup EXIT
network_options=()
if [ -n "${FRESHRSS_TEST_SUBNET:-}" ]; then network_options=(--subnet "$FRESHRSS_TEST_SUBNET"); fi
docker network create "${network_options[@]}" "$prefix" >/dev/null
docker run --rm --user 0 -v "$proof_dir:/proof" --entrypoint /bin/sh "$reader_image" -c 'mkdir /proof/data /proof/runtime; chown -R 1000:1000 /proof' >/dev/null
start_reader() {
  docker run -d --name "$prefix-reader" --network "$prefix" --network-alias freshrss \
    --read-only --cap-drop ALL --security-opt no-new-privileges \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777 \
    -v "$proof_dir/data:/var/www/FreshRSS/data" -v "$proof_dir/runtime:/runtime" "$reader_image" >/dev/null
}
start_integration() {
  docker run -d --name "$prefix-integration" --network "$prefix" --network-alias integration \
    --read-only --cap-drop ALL --security-opt no-new-privileges \
    -v "$proof_dir/runtime:/runtime" "$integration_image" >/dev/null
}
proof() {
  docker exec -i "$prefix-integration" node --input-type=module < apps/freshrss/integration/native-proof.mjs
}
start_integration
sleep 2
# Save setup while the reader is unavailable, then prove startup resumes it.
proof &
proof_pid=$!
sleep 2
start_reader
wait "$proof_pid"
docker restart "$prefix-reader" "$prefix-integration" >/dev/null
sleep 3
proof
docker rm -f "$prefix-reader" "$prefix-integration" >/dev/null
docker run --rm --user 1000 -v "$proof_dir:/proof" --entrypoint /bin/sh "$reader_image" -c \
  'cd /proof; tar -cf backup.tar data runtime; mv data data.before; mv runtime runtime.before; tar -xf backup.tar'
start_reader
start_integration
sleep 3
proof
echo "PASS: unavailable-reader setup recovery, restart, stopped-filesystem backup and restore"
