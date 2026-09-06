#!/bin/sh
set -eu

case "$(uname -m)" in
  x86_64) architecture=amd64 ;;
  aarch64|arm64) architecture=arm64 ;;
  *) echo "Unsupported native architecture" >&2; exit 1 ;;
esac

# This script never adopts existing data. Run it in a disposable checkout.
proof_data=apps/logseq/development/data
if [ -e "$proof_data" ]; then
  echo "Refusing to use an existing Logseq test directory: $proof_data" >&2
  exit 1
fi
sudo install -d -m 700 -o 1000 -g 1000 "$proof_data/graph" "$proof_data/runtime"

docker build --build-arg TARGETARCH="$architecture" -f apps/logseq/helper/Dockerfile -t scholarserver-logseq-proof:helper .
docker build -f apps/logseq/mcp/Dockerfile -t scholarserver-logseq-proof:mcp .
for image in helper mcp; do
  actual=$(docker image inspect "scholarserver-logseq-proof:$image" --format '{{.Architecture}}')
  if [ "$actual" != "$architecture" ]; then
    echo "Refusing an emulated runtime" >&2
    exit 1
  fi
done

compose() {
  docker compose -p scholarserver-logseq-proof -f apps/logseq/development/compose.yaml "$@"
}
trap 'compose down --remove-orphans' EXIT
compose up -d --wait --wait-timeout 120
compose exec -T mcp node --input-type=module < apps/logseq/development/check-mcp.mjs
compose exec -T mcp node --input-type=module < apps/logseq/development/check-research-mcp.mjs
compose restart
compose up -d --wait --wait-timeout 120
compose exec -T -e LOGSEQ_PROOF_PHASE=restart mcp node --input-type=module < apps/logseq/development/check-mcp.mjs
compose exec -T -e LOGSEQ_PROOF_PHASE=restart mcp node --input-type=module < apps/logseq/development/check-research-mcp.mjs
echo "Native $architecture candidate proof passed. No images or catalog entries were published."
