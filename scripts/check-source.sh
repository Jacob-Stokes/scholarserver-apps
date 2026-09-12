#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repository_root"

npm ci --no-audit --no-fund
# This controller is independently packaged and keeps its own dependency lock.
npm ci --prefix apps/obsidian/sync --ignore-scripts --no-audit --no-fund
npm run lint
npm test
npm run test:packaging
npm run build
