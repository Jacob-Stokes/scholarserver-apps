#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=${NATIVE_IMAGE_ROOT:-$(CDPATH= cd -- "$script_dir/.." && pwd)}
cd "$repository_root"

: "${ARCH:?Provide the native architecture to publish}"
: "${REGISTRY:?Provide the target registry and repository prefix}"
: "${REVISION:?Provide the full committed source revision}"

case "$(uname -m)" in
  x86_64) native_arch=amd64 ;;
  aarch64|arm64) native_arch=arm64 ;;
  *) echo "Unsupported native architecture" >&2; exit 1 ;;
esac
if [ "$native_arch" != "$ARCH" ]; then
  echo "Refusing emulated publication: runner is $native_arch but requested $ARCH" >&2
  exit 1
fi

inventory=scripts/image-source-inventory.json
node "$script_dir/native-image-receipt.mjs" assert-source --root "$repository_root" --revision "$REVISION"

receipt=.dev/native-images/$REVISION-$ARCH.json
qualification=.dev/native-images/$REVISION-$ARCH.qualified.json
node "$script_dir/native-image-receipt.mjs" verify-qualification \
  --root "$repository_root" \
  --inventory "$inventory" \
  --receipt "$receipt" \
  --qualification "$qualification" \
  --revision "$REVISION" \
  --architecture "$ARCH" \
  --registry "$REGISTRY"

work_directory=$(mktemp -d ".dev/native-images/publish-$REVISION-$ARCH.XXXXXX")
verified_records="$work_directory/verified.tsv"
trap 'rm -rf -- "$work_directory"' EXIT HUP INT TERM

node "$script_dir/native-image-receipt.mjs" verify-receipt \
  --root "$repository_root" \
  --inventory "$inventory" \
  --receipt "$receipt" \
  --revision "$REVISION" \
  --architecture "$ARCH" \
  --registry "$REGISTRY" > "$verified_records"

manifest_is_missing() {
  grep -Eiq 'manifest unknown|no such manifest|name unknown|manifest[^:]*:.*not found' "$1"
}

while IFS="$(printf '\t')" read -r recipe target local_image_id config_digest image_architecture rootfs_diff_ids layer_count source_digest; do
  [ -n "$recipe" ] || continue

  # Recheck the commit, complete working tree and this recipe's fingerprint as
  # close as possible to the registry mutation.
  node "$script_dir/native-image-receipt.mjs" verify-receipt \
    --root "$repository_root" \
    --inventory "$inventory" \
    --receipt "$receipt" \
    --revision "$REVISION" \
    --architecture "$ARCH" \
    --registry "$REGISTRY" \
    --recipe "$recipe" > /dev/null

  current_id=$(docker image inspect "$target" --format '{{.Id}}')
  if [ "$current_id" != "$local_image_id" ]; then
    echo "Local tag changed after build for $recipe: receipt $local_image_id, current $current_id" >&2
    exit 1
  fi
  id_check=$(docker image inspect "$local_image_id" --format '{{.Id}}')
  if [ "$id_check" != "$local_image_id" ]; then
    echo "Receipt image ID is no longer available locally for $recipe: $local_image_id" >&2
    exit 1
  fi

  portable_identity=$(python3 "$script_dir/inspect-native-image.py" "$local_image_id")
  IFS="$(printf '\t')" read -r current_config_digest current_architecture current_rootfs_diff_ids <<EOF
$portable_identity
EOF
  if [ "$current_config_digest" != "$config_digest" ] || \
    [ "$current_architecture" != "$image_architecture" ] || \
    [ "$current_rootfs_diff_ids" != "$rootfs_diff_ids" ]; then
    echo "Portable image identity changed after build for $recipe" >&2
    exit 1
  fi

  # Rebind the tag to the recorded object. Keep this builder exclusive: Docker
  # tag/push has no compare-and-swap against another local or registry writer.
  docker tag "$local_image_id" "$target"
  tagged_id=$(docker image inspect "$target" --format '{{.Id}}')
  if [ "$tagged_id" != "$local_image_id" ]; then
    echo "Unable to bind $target to verified image ID $local_image_id" >&2
    exit 1
  fi

  remote_manifest="$work_directory/$recipe.remote.json"
  remote_error="$work_directory/$recipe.remote.err"
  if docker manifest inspect --verbose "$target" > "$remote_manifest" 2> "$remote_error"; then
    if ! node "$script_dir/native-image-receipt.mjs" verify-remote \
      --input "$remote_manifest" --config-digest "$config_digest" \
      --architecture "$image_architecture" --layer-count "$layer_count"; then
      echo "Refusing to replace immutable tag $target with different image content" >&2
      exit 1
    fi
    echo "Immutable tag already contains the verified image; skipping push: $target"
    continue
  fi
  if ! manifest_is_missing "$remote_error"; then
    echo "Unable to establish whether immutable tag exists: $target" >&2
    cat "$remote_error" >&2
    exit 1
  fi

  docker push "$target"
  docker manifest inspect --verbose "$target" > "$remote_manifest"
  node "$script_dir/native-image-receipt.mjs" verify-remote \
    --input "$remote_manifest" --config-digest "$config_digest" \
    --architecture "$image_architecture" --layer-count "$layer_count"
  echo "Published verified image: $target (local $local_image_id; config $config_digest; $source_digest)"
done < "$verified_records"
