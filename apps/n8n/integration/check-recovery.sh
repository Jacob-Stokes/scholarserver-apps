#!/bin/bash
# Run as root on the disposable acceptance host, never against a user instance.
set -euo pipefail
service=scholarserver-n8n-acceptance-20260909
controller=scholarserver-n8n-controller-acceptance-20260909
state_volume=scholarserver-n8n-state-acceptance-20260909
controller_volume=scholarserver-n8n-controller-acceptance-20260909
state_path=$(docker volume inspect "$state_volume" --format '{{.Mountpoint}}')
controller_path=$(docker volume inspect "$controller_volume" --format '{{.Mountpoint}}')
recovery_directory=$(mktemp -d /tmp/scholarserver-n8n-recovery.XXXXXXXX)
export RESTIC_REPOSITORY="$recovery_directory/repository"
export RESTIC_PASSWORD_FILE="$recovery_directory/password"
openssl rand -hex 32 > "$RESTIC_PASSWORD_FILE"
chmod 600 "$RESTIC_PASSWORD_FILE"
cleanup() {
  docker start "$service" "$controller" >/dev/null
  case "$recovery_directory" in
    /tmp/scholarserver-n8n-recovery.*) rm -rf -- "$recovery_directory" ;;
  esac
}
trap cleanup EXIT

# The only added credential is a synthetic test value. No production keys are read.
docker exec "$controller" node --input-type=module -e '
  import { N8nSetup } from "./setup.mjs";
  const setup = new N8nSetup({ directory: "/runtime", baseUrl: "http://n8n:5678" });
  const client = await setup.client();
  await client.createCredential({ name: "Recovery acceptance", type: "httpHeaderAuth",
    data: { name: "X-Recovery", value: "synthetic-recovery-test" } });
'
docker stop "$service" "$controller" >/dev/null
restic init --quiet
restic backup --quiet "$state_path" "$controller_path"
restic check --quiet
restic restore latest --target "$recovery_directory/restored" --quiet
restored_state="$recovery_directory/restored$state_path"
restored_controller="$recovery_directory/restored$controller_path"
cmp "$controller_path/connection.json" "$restored_controller/connection.json"
cmp "$controller_path/installations.json" "$restored_controller/installations.json"
test "$(stat -c %a "$restored_controller/connection.json")" = 600
test "$(stat -c %u "$restored_state")" = 1000
docker run --rm --read-only --user 1000:1000 --network none \
  --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,nosuid,nodev,size=64m \
  -v "$restored_state:/home/node/.n8n" --entrypoint node scholarserver-n8n:dev -e '
    const { execFileSync } = require("node:child_process");
    const { readFileSync } = require("node:fs");
    execFileSync("n8n", ["export:credentials", "--all", "--decrypted", "--output=/tmp/credentials.json"], { stdio: "pipe" });
    const credentials = JSON.parse(readFileSync("/tmp/credentials.json", "utf8"));
    if (!credentials.some(value => value.name === "Recovery acceptance" && value.data.value === "synthetic-recovery-test")) {
      throw new Error("Restored credential did not decrypt");
    }
  '
echo "Encrypted restic restore preserved workflow receipts, API key permissions and n8n credential decryption."
