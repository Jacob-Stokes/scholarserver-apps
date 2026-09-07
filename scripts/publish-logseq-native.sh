#!/bin/sh
set -eu
: "${REVISION:?Provide the verified source commit}"
case "$(uname -m)" in
  x86_64) architecture=amd64 ;;
  aarch64|arm64) architecture=arm64 ;;
  *) echo "A native AMD64 or ARM64 host is required" >&2; exit 1 ;;
esac
for component in helper mcp sync; do
  directory="$component"
  if [ "$component" = sync ]; then directory=sync-adapter; fi
  image="ghcr.io/jacob-stokes/scholarserver-logseq-$component:beta1-$REVISION-$architecture"
  docker build --build-arg TARGETARCH="$architecture" \
    --label org.opencontainers.image.source=https://github.com/Jacob-Stokes/scholarserver-apps \
    --label "org.opencontainers.image.revision=$REVISION" \
    -f "apps/logseq/$directory/Dockerfile" -t "$image" .
  test "$(docker image inspect "$image" --format '{{.Architecture}}')" = "$architecture"
  node=node
  if [ "$component" = sync ]; then node=/nodejs/bin/node; fi
  docker run --rm --entrypoint "$node" "$image" -e \
    'const fs=require("node:fs"); for(const p of ["LICENSE","DISTRIBUTION.md"]) if(!fs.statSync("/usr/share/doc/scholarserver-logseq/"+p).size) process.exit(1)'
  docker push "$image"
done
