#!/bin/sh
set -eu
proof_project=${LOGSEQ_PROOF_PROJECT:-scholarserver-logseq-proof}
export LOGSEQ_PROOF_HELPER_IMAGE=${LOGSEQ_PROOF_HELPER_IMAGE:-scholarserver-logseq-proof:helper}
export LOGSEQ_PROOF_MCP_IMAGE=${LOGSEQ_PROOF_MCP_IMAGE:-scholarserver-logseq-proof:mcp}

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

if [ "${LOGSEQ_PROOF_PULL_ONLY:-0}" = 1 ]; then
  for image in "$LOGSEQ_PROOF_HELPER_IMAGE" "$LOGSEQ_PROOF_MCP_IMAGE"; do
    case "$image" in
      ghcr.io/jacob-stokes/scholarserver-logseq-*@sha256:*) docker pull "$image" ;;
      *) echo "Release verification requires an immutable published image" >&2; exit 1 ;;
    esac
  done
else
  docker build --build-arg TARGETARCH="$architecture" -f apps/logseq/helper/Dockerfile -t "$LOGSEQ_PROOF_HELPER_IMAGE" .
  docker build -f apps/logseq/mcp/Dockerfile -t "$LOGSEQ_PROOF_MCP_IMAGE" .
fi
for image in "$LOGSEQ_PROOF_HELPER_IMAGE" "$LOGSEQ_PROOF_MCP_IMAGE"; do
  actual=$(docker image inspect "$image" --format '{{.Architecture}}')
  if [ "$actual" != "$architecture" ]; then
    echo "Refusing an emulated runtime" >&2
    exit 1
  fi
done

compose() {
  docker compose -p "$proof_project" -f apps/logseq/development/compose.yaml "$@"
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
