#!/bin/sh
set -eu

case "$(uname -m)" in
  x86_64) native_arch=amd64 ;;
  aarch64|arm64) native_arch=arm64 ;;
  *) echo "Unsupported native architecture" >&2; exit 1 ;;
esac

if [ "$native_arch" != "$ARCH" ]; then
  echo "Refusing emulated build: runner is $native_arch but requested $ARCH" >&2
  exit 1
fi

node scripts/check-image-source.mjs --inventory scripts/image-source-inventory.json

build() {
  image="$1"
  dockerfile="$2"
  context="$3"
  repository="${4:-scholarserver-$image}"
  variant="${5:-}"
  tag_suffix=""
  [ -z "$variant" ] || tag_suffix="-$variant"
  target="$REGISTRY/$repository:sha-$REVISION$tag_suffix-$ARCH"
  source_digest=$(node --input-type=module -e '
    import { loadInventory, fingerprintRecipe } from "./scripts/check-image-source.mjs";
    const inventory = await loadInventory("scripts/image-source-inventory.json");
    const recipe = inventory.recipes.find((entry) => entry.name === process.argv[1]);
    console.log((await fingerprintRecipe(process.cwd(), recipe)).digest);
  ' "$image")
  docker build --pull --build-arg TARGETARCH="$ARCH" \
    --label "org.opencontainers.image.revision=$REVISION" \
    --label "org.opencontainers.image.source=https://github.com/Jacob-Stokes/scholarserver-apps" \
    --label "com.scholarserver.source-digest=$source_digest" \
    --file "$dockerfile" --tag "$target" "$context"
  python3 scripts/check-image-contents.py "$target"
  if [ "$image" = files ]; then
    bash apps/files/test-container.sh "$target"
    bash apps/files/test-restart.sh "$target"
  fi
  docker push "$target"
  case "$image" in
    obsidian-sync|obsidian-api|obsidian-mcp)
      docker tag "$target" "scholarserver-packaging-review:$image" ;;
    obsidian-livesync-couchdb)
      docker tag "$target" "scholarserver-packaging-review:couchdb" ;;
    obsidian-livesync-worker)
      docker tag "$target" "scholarserver-packaging-review:livesync-worker" ;;
  esac
}

build files apps/files/Dockerfile .
build n8n apps/n8n/Dockerfile .
build n8n-app apps/n8n/integration/Dockerfile . scholarserver-n8n-app
build logseq-helper apps/logseq/helper/Dockerfile .
build logseq-mcp apps/logseq/mcp/Dockerfile .
build logseq-sync apps/logseq/sync-adapter/Dockerfile .
build obsidian-sync apps/obsidian/sync/Dockerfile .
build obsidian-api apps/obsidian/api/Dockerfile apps/obsidian/api
build obsidian-mcp apps/obsidian/mcp/Dockerfile .
build obsidian-livesync-couchdb apps/obsidian/livesync-couchdb/Dockerfile . scholarserver-obsidian-sync livesync-couchdb
build obsidian-livesync-worker apps/obsidian/livesync-worker/Dockerfile . scholarserver-obsidian-sync livesync-worker
build zotero-desktop apps/zotero/desktop/Dockerfile apps/zotero/desktop
build zotero-controller apps/zotero/controller/Dockerfile .
build zotero-local-api-bridge apps/zotero/local-api-bridge/Dockerfile .
build zotero-automations apps/zotero/automations/Dockerfile .
build zotero-mcp apps/zotero/mcp/Dockerfile .
build docling-app apps/docling/controller/Dockerfile .
build freshrss-reader apps/freshrss/reader/Dockerfile .
build freshrss-app apps/freshrss/integration/Dockerfile .
