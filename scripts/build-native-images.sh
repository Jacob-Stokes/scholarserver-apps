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

build() {
  image="$1"
  dockerfile="$2"
  context="$3"
  target="$REGISTRY/scholarserver-$image:sha-$REVISION-$ARCH"
  docker build --pull --build-arg TARGETARCH="$ARCH" --file "$dockerfile" --tag "$target" "$context"
  docker push "$target"
}

build obsidian-sync apps/obsidian/sync/Dockerfile .
build obsidian-api apps/obsidian/api/Dockerfile apps/obsidian/api
build obsidian-mcp apps/obsidian/mcp/Dockerfile .
build zotero-desktop apps/zotero/desktop/Dockerfile apps/zotero/desktop
build zotero-controller apps/zotero/controller/Dockerfile .
build zotero-automations apps/zotero/automations/Dockerfile .
build zotero-mcp apps/zotero/mcp/Dockerfile .
build docling-app apps/docling/controller/Dockerfile .
