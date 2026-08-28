#!/bin/sh
set -eu

manifest=apps/obsidian/package/scholarserver-app.yaml
compose=apps/obsidian/package/compose.yaml
if grep -q 'sha256:0000000000000000000000000000000000000000000000000000000000000000' "$manifest" "$compose"; then
  echo "Refusing a release with placeholder image digests" >&2
  exit 1
fi

mkdir -p catalog/dist
package_version=$(sed -n 's/^packageVersion: //p' "$manifest")
archive="catalog/dist/obsidian-$package_version.tar.gz"
tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  -czf "$archive" -C apps/obsidian/package .
digest=$(sha256sum "$archive" | cut -d ' ' -f 1)
asset_url="https://github.com/${REPOSITORY}/releases/download/${RELEASE_TAG}/$(basename "$archive")"
cat > catalog/dist/index.json <<EOF
{
  "schemaVersion": 1,
  "applications": [
    {
      "id": "org.scholarserver.obsidian",
      "version": "$package_version",
      "bundle": "$asset_url",
      "sha256": "$digest"
    }
  ]
}
EOF
