#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=${NATIVE_IMAGE_ROOT:-$(CDPATH= cd -- "$script_dir/.." && pwd)}
cd "$repository_root"

: "${ARCH:?Provide the native architecture to build}"
: "${REGISTRY:?Provide the target registry and repository prefix}"
: "${REVISION:?Provide the full committed source revision}"

case "$(uname -m)" in
  x86_64) native_arch=amd64 ;;
  aarch64|arm64) native_arch=arm64 ;;
  *) echo "Unsupported native architecture" >&2; exit 1 ;;
esac

if [ "$native_arch" != "$ARCH" ]; then
  echo "Refusing emulated build: runner is $native_arch but requested $ARCH" >&2
  exit 1
fi

inventory=scripts/image-source-inventory.json
node "$script_dir/native-image-receipt.mjs" assert-source --root "$repository_root" --revision "$REVISION"

receipt=.dev/native-images/$REVISION-$ARCH.json
mkdir -p "$(dirname "$receipt")"
rm -f -- "$receipt"
records=$(mktemp ".dev/native-images/$REVISION-$ARCH.records.XXXXXX")
trap 'rm -f -- "$records"' EXIT HUP INT TERM

node "$script_dir/check-image-source.mjs" --inventory "$repository_root/$inventory" --root "$repository_root"

build() {
  image="$1"
  dockerfile="$2"
  context="$3"
  repository="${4:-scholarserver-$image}"
  variant="${5:-}"
  tag_suffix=""
  [ -z "$variant" ] || tag_suffix="-$variant"
  target="$REGISTRY/$repository:sha-$REVISION$tag_suffix-$ARCH"
  source_digest=$(node "$script_dir/native-image-receipt.mjs" fingerprint \
    --root "$repository_root" --inventory "$inventory" --recipe "$image")
  docker build --pull --build-arg TARGETARCH="$ARCH" \
    --label "org.opencontainers.image.revision=$REVISION" \
    --label "org.opencontainers.image.source=https://github.com/Jacob-Stokes/scholarserver-apps" \
    --label "com.scholarserver.source-digest=$source_digest" \
    --file "$dockerfile" --tag "$target" "$context"
  built_architecture=$(docker image inspect "$target" --format '{{.Architecture}}')
  if [ "$built_architecture" != "$ARCH" ]; then
    echo "Refusing non-native image for $image: expected $ARCH, built $built_architecture" >&2
    exit 1
  fi
  python3 scripts/check-image-contents.py "$target"
  image_id=$(docker image inspect "$target" --format '{{.Id}}')
  case "$image_id" in
    sha256:[a-f0-9][a-f0-9]*) ;;
    *) echo "Docker returned an invalid image ID for $image: $image_id" >&2; exit 1 ;;
  esac
  portable_identity=$(python3 "$script_dir/inspect-native-image.py" "$target")
  IFS="$(printf '\t')" read -r config_digest config_architecture rootfs_diff_ids <<EOF
$portable_identity
EOF
  if [ "$config_architecture" != "$ARCH" ]; then
    echo "Portable image config has the wrong architecture for $image: $config_architecture" >&2
    exit 1
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$image" "$target" "$image_id" "$config_digest" "$config_architecture" "$rootfs_diff_ids" "$source_digest" \
    >> "$records"
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

node "$script_dir/native-image-receipt.mjs" write-receipt \
  --root "$repository_root" \
  --inventory "$inventory" \
  --records "$records" \
  --receipt "$receipt" \
  --revision "$REVISION" \
  --architecture "$ARCH" \
  --registry "$REGISTRY"
echo "Built and locally verified 19 native images without publishing."
echo "Receipt: $receipt"
