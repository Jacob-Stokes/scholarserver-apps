#!/usr/bin/env bash
# Development-only, on each disposable native GitHub runner after build-native-images.sh.
# Requires ARCH, REGISTRY, REVISION, SCHOLARSERVER_BROWSER_MODULES (node_modules),
# and SCHOLARSERVER_BROWSER_EXECUTABLE (native Playwright Chromium).
# This does not write the publication qualification receipt or lift release blocks.
set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=${NATIVE_IMAGE_ROOT:-$(CDPATH= cd -- "$script_dir/.." && pwd)}
cd "$repository_root"

: "${ARCH:?Provide the native architecture}"
: "${REGISTRY:?Provide the build receipt registry prefix}"
: "${REVISION:?Provide the full committed source revision}"
: "${SCHOLARSERVER_BROWSER_MODULES:?Provide the isolated Playwright node_modules directory}"
: "${SCHOLARSERVER_BROWSER_EXECUTABLE:?Provide the native Chromium executable}"

fail() { echo "Development qualification failed: $*" >&2; exit 1; }

[[ ${GITHUB_ACTIONS:-} == true && ${RUNNER_ENVIRONMENT:-} == github-hosted ]] ||
  fail "Use a disposable GitHub-hosted runner, not a retained development host."
[[ $(uname -s) == Linux ]] || fail "A native Linux runner is required."
case "$(uname -m)" in
  x86_64) native_arch=amd64 ;;
  aarch64|arm64) native_arch=arm64 ;;
  *) fail "Unsupported runner architecture." ;;
esac
[[ $ARCH == "$native_arch" ]] || fail "Runner architecture differs from ARCH; emulation is not allowed."
[[ -z ${DOCKER_HOST:-} && -z ${DOCKER_CONTEXT:-} ]] || fail "Do not redirect Docker away from the runner."
[[ $(docker context inspect --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]] ||
  fail "Use the runner's local Docker socket."
case "$(docker info --format '{{.OSType}}/{{.Architecture}}')" in
  linux/x86_64|linux/amd64) docker_arch=amd64 ;;
  linux/aarch64|linux/arm64) docker_arch=arm64 ;;
  *) fail "Unsupported Docker platform." ;;
esac
[[ $docker_arch == "$ARCH" ]] || fail "Docker architecture differs from the native runner."

receipt=".dev/native-images/$REVISION-$ARCH.json"
receipt_arguments=(--root "$repository_root" --inventory scripts/image-source-inventory.json
  --receipt "$receipt" --revision "$REVISION" --architecture "$ARCH" --registry "$REGISTRY")
# The existing verifier checks committed HEAD, receipt shape, exact tags and source fingerprints.
records=$(node "$script_dir/native-image-receipt.mjs" verify-receipt "${receipt_arguments[@]}")
recipes=(docling-app logseq-helper logseq-mcp zotero-controller zotero-desktop
  zotero-local-api-bridge zotero-automations zotero-mcp)
image_variables=(DOCLING_CONTROLLER_IMAGE LOGSEQ_PROOF_HELPER_IMAGE LOGSEQ_PROOF_MCP_IMAGE
  ZOTERO_CONTROLLER_IMAGE ZOTERO_DESKTOP_IMAGE ZOTERO_LOCAL_API_BRIDGE_IMAGE
  ZOTERO_AUTOMATIONS_IMAGE ZOTERO_MCP_IMAGE)
targets=() image_ids=()
for index in "${!recipes[@]}"; do
  recipe=${recipes[$index]}
  record=$(printf '%s\n' "$records" | awk -F '\t' -v recipe="$recipe" '$1 == recipe')
  [[ -n $record ]] || fail "Receipt is missing $recipe."
  IFS=$'\t' read -r _ target image_id config_digest image_arch rootfs _ <<< "$record"
  targets[$index]=$target
  image_ids[$index]=$image_id
  [[ $(docker image inspect "$target" --format '{{.Id}}') == "$image_id" ]] ||
    fail "Local tag does not match the build receipt for $recipe."
  [[ $(docker image inspect "$image_id" --format '{{.Os}}/{{.Architecture}}') == "linux/$ARCH" ]] ||
    fail "Image platform differs for $recipe."
  expected_identity="$config_digest"$'\t'"$image_arch"$'\t'"$rootfs"
  [[ $(python3 "$script_dir/inspect-native-image.py" "$image_id") == "$expected_identity" ]] ||
    fail "Portable image identity differs for $recipe."
  # Execute receipt-bound IDs, not tags that could change before startup.
  export "${image_variables[$index]}=$image_id"
done

# Preflight the same executable used by all three gates before any Docker fixtures.
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { access, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
assert.equal(process.arch, process.env.ARCH === 'amd64' ? 'x64' : 'arm64', 'Node must be native');
const require = createRequire(path.join(process.env.SCHOLARSERVER_BROWSER_MODULES, 'package.json'));
const { chromium } = require('playwright');
require('playwright/test');
const executablePath = process.env.SCHOLARSERVER_BROWSER_EXECUTABLE;
await access(executablePath, constants.X_OK);
const executable = await open(executablePath, 'r');
try {
  const header = Buffer.alloc(20);
  await executable.read(header, 0, header.length, 0);
  assert.deepEqual([...header.subarray(0, 5)], [127, 69, 76, 70, 2], 'Chromium must be a 64-bit Linux ELF');
  assert.equal(header[5], 1, 'Chromium must be little endian');
  assert.equal(header.readUInt16LE(18), process.env.ARCH === 'amd64' ? 62 : 183, 'Chromium must be native');
} finally {
  await executable.close();
}
const browser = await chromium.launch({ executablePath, headless: true });
await browser.close();
JS

output=$(mktemp -d "$repository_root/.dev/native-images/$REVISION-$ARCH.development.XXXXXX")
echo "Development gate evidence: $output"
export LOGSEQ_PROOF_HELPER_REVISION=$REVISION LOGSEQ_PROOF_MCP_REVISION=$REVISION
export LOGSEQ_PROOF_ARCH=$ARCH LOGSEQ_PROOF_SOURCE=$repository_root
export LOGSEQ_PROOF_BROWSER_EXECUTABLE=$SCHOLARSERVER_BROWSER_EXECUTABLE
export LOGSEQ_PROOF_OUTPUT="$output/logseq-native"
export SCHOLARSERVER_EVIDENCE=$output

echo "Gate 1/3: Docling controller UI, validation and restart"
node "$script_dir/check-docling-packaging.mjs" 2>&1 | tee "$output/docling.log"
echo "Gate 2/3: Logseq unsynced graph/MCP, restart and managed setup UI"
node "$script_dir/check-logseq-packaging.mjs" 2>&1 | tee "$output/logseq.log"
echo "Gate 3/3: Zotero disposable desktop, protected bridge, UI and restart"
node "$script_dir/check-zotero-packaging.mjs" 2>&1 | tee "$output/zotero.log"

[[ $(node "$script_dir/native-image-receipt.mjs" verify-receipt "${receipt_arguments[@]}") == "$records" ]] ||
  fail "Build receipt changed during the gates."
for index in "${!recipes[@]}"; do
  [[ $(docker image inspect "${targets[$index]}" --format '{{.Id}}') == "${image_ids[$index]}" ]] ||
    fail "Local tag changed during the gates for ${recipes[$index]}."
done
node --input-type=module - "$receipt" "$output/summary.json" <<'JS'
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const receipt = await readFile(process.argv[2]);
const { revision, architecture } = JSON.parse(receipt);
const summary = {
  format: 1, result: 'passed', kind: 'development-app-gates', revision, architecture,
  buildReceiptDigest: `sha256:${createHash('sha256').update(receipt).digest('hex')}`,
  completedAt: new Date().toISOString(),
  scopes: ['Docling controller UI, validation and restart',
    'Logseq unsynced graph/MCP, restart and managed setup UI',
    'Zotero disposable desktop, protected bridge, UI and restart'],
  limits: ['Not full installation or retained-host acceptance',
    'No account, encrypted sync, Gateway or real-library acceptance',
    'Does not qualify the Logseq sync adapter or upstream browser editor',
    'Docling conversion engine is outside the mandatory controller gate',
    'Package release blocks remain unchanged']
};
await writeFile(process.argv[3], `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
JS
echo "Three development app gates passed on native $ARCH; release blocks remain unchanged."
