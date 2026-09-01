#!/bin/sh
set -eu

rm -rf catalog/dist
mkdir -p catalog/dist
index=catalog/dist/index.json
printf '{\n  "schemaVersion": 1,\n  "applications": [\n' > "$index"
first=true

for manifest in apps/*/package/scholarserver-app.yaml; do
  package_dir=$(dirname "$manifest")
  app_name=$(basename "$(dirname "$package_dir")")
  compose="$package_dir/compose.yaml"
  if grep -q 'sha256:0000000000000000000000000000000000000000000000000000000000000000' "$manifest" "$compose"; then
    echo "Refusing a release with placeholder image digests in $app_name" >&2
    exit 1
  fi
  compose_images=$(sed -n 's/^[[:space:]]*image:[[:space:]]*//p' "$compose" | sort)
  manifest_images=$(sed -n 's/^[[:space:]]*reference:[[:space:]]*//p' "$manifest" | sort)
  if [ "$compose_images" != "$manifest_images" ]; then
    echo "Refusing a release whose Compose and manifest image references differ in $app_name" >&2
    exit 1
  fi

  package_id=$(sed -n 's/^id: //p' "$manifest")
  package_version=$(sed -n 's/^packageVersion: //p' "$manifest")
  archive="catalog/dist/$app_name-$package_version.tar.gz"
  tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
    -czf "$archive" -C "$package_dir" .
  digest=$(sha256sum "$archive" | cut -d ' ' -f 1)
  asset_url="https://github.com/${REPOSITORY}/releases/download/${RELEASE_TAG}/$(basename "$archive")"

  if [ "$first" = true ]; then first=false; else printf ',\n' >> "$index"; fi
  printf '    {\n      "id": "%s",\n      "version": "%s",\n      "bundle": "%s",\n      "sha256": "%s"\n    }' \
    "$package_id" "$package_version" "$asset_url" "$digest" >> "$index"
done

printf '\n  ]\n}\n' >> "$index"
