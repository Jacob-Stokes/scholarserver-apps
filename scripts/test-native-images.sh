#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=${NATIVE_IMAGE_ROOT:-$(CDPATH= cd -- "$script_dir/.." && pwd)}
cd "$repository_root"

: "${ARCH:?Provide the native architecture to test}"
: "${REGISTRY:?Provide the target registry and repository prefix}"
: "${REVISION:?Provide the full committed source revision}"

case "$(uname -m)" in
  x86_64) native_arch=amd64 ;;
  aarch64|arm64) native_arch=arm64 ;;
  *) echo "Unsupported native architecture" >&2; exit 1 ;;
esac
if [ "$native_arch" != "$ARCH" ]; then
  echo "Refusing emulated native tests: runner is $native_arch but requested $ARCH" >&2
  exit 1
fi

inventory=scripts/image-source-inventory.json
receipt=.dev/native-images/$REVISION-$ARCH.json
qualification=.dev/native-images/$REVISION-$ARCH.qualified.json
node "$script_dir/native-image-receipt.mjs" assert-source --root "$repository_root" --revision "$REVISION"
rm -f -- "$qualification"

receipt_record() {
  node "$script_dir/native-image-receipt.mjs" verify-receipt \
    --root "$repository_root" \
    --inventory "$inventory" \
    --receipt "$receipt" \
    --revision "$REVISION" \
    --architecture "$ARCH" \
    --registry "$REGISTRY" \
    --recipe "$1"
}

verified_recipe() {
  record=$(receipt_record "$1")
  IFS="$(printf '\t')" read -r recipe target local_image_id config_digest image_architecture rootfs_diff_ids _ <<EOF
$record
EOF
  current_id=$(docker image inspect "$target" --format '{{.Id}}')
  if [ "$current_id" != "$local_image_id" ]; then
    echo "Local tag does not match the build receipt for $recipe" >&2
    return 1
  fi
  portable_identity=$(python3 "$script_dir/inspect-native-image.py" "$local_image_id")
  IFS="$(printf '\t')" read -r current_config_digest current_architecture current_rootfs_diff_ids <<EOF
$portable_identity
EOF
  if [ "$current_config_digest" != "$config_digest" ] || \
    [ "$current_architecture" != "$image_architecture" ] || \
    [ "$current_rootfs_diff_ids" != "$rootfs_diff_ids" ]; then
    echo "Portable image identity does not match the build receipt for $recipe" >&2
    return 1
  fi
  printf '%s\t%s\n' "$target" "$local_image_id"
}

files_record=$(verified_recipe files)
IFS="$(printf '\t')" read -r files_image _ <<EOF
$files_record
EOF
echo "Gate 1/4: Files container and restart checks"
bash apps/files/test-container.sh "$files_image"
bash apps/files/test-restart.sh "$files_image"

for obsidian_recipe in obsidian-sync obsidian-api obsidian-mcp obsidian-livesync-couchdb obsidian-livesync-worker; do
  obsidian_record=$(verified_recipe "$obsidian_recipe")
  IFS="$(printf '\t')" read -r _ obsidian_image_id <<EOF
$obsidian_record
EOF
  case "$obsidian_recipe" in
    obsidian-sync|obsidian-api|obsidian-mcp)
      docker tag "$obsidian_image_id" "scholarserver-packaging-review:$obsidian_recipe" ;;
    obsidian-livesync-couchdb)
      docker tag "$obsidian_image_id" "scholarserver-packaging-review:couchdb" ;;
    obsidian-livesync-worker)
      docker tag "$obsidian_image_id" "scholarserver-packaging-review:livesync-worker" ;;
  esac
done
echo "Gate 2/4: Obsidian native startup, user download and two-peer LiveSync check"
if [ "${NATIVE_IMAGE_TEST_USE_SUDO:-0}" = 1 ]; then
  sudo python3 scripts/check-obsidian-packaging.py
else
  python3 scripts/check-obsidian-packaging.py
fi

reader_record=$(verified_recipe freshrss-reader)
IFS="$(printf '\t')" read -r reader_image _ <<EOF
$reader_record
EOF
app_record=$(verified_recipe freshrss-app)
IFS="$(printf '\t')" read -r app_image _ <<EOF
$app_record
EOF
echo "Gate 3/4: FreshRSS setup, MCP, restart and restore check"
bash apps/freshrss/test-container.sh "$reader_image" "$app_image"

n8n_record=$(verified_recipe n8n)
IFS="$(printf '\t')" read -r n8n_image _ <<EOF
$n8n_record
EOF
integration_record=$(verified_recipe n8n-app)
IFS="$(printf '\t')" read -r integration_image _ <<EOF
$integration_record
EOF
echo "Gate 4/4: n8n password-only setup and controller restart check"
N8N_IMAGE="$n8n_image" INTEGRATION_IMAGE="$integration_image" bash apps/n8n/test-container.sh

node "$script_dir/native-image-receipt.mjs" write-qualification \
  --root "$repository_root" \
  --inventory "$inventory" \
  --receipt "$receipt" \
  --qualification "$qualification" \
  --revision "$REVISION" \
  --architecture "$ARCH" \
  --registry "$REGISTRY"
echo "The named Files, Obsidian, FreshRSS and n8n native gates passed."
echo "This is not full all-application native acceptance."
echo "Qualification: $qualification"
