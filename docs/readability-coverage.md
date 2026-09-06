# Apps readability coverage

Inventory started 6 September 2026. This is the readability pass, not a security
certification or a substitute for earlier architecture/release evidence.

- **Read:** inspected the complete file in this readability pass; improvements may
  still be recorded in the review. It does not mean no future changes are needed.
- **Partial:** inspected specific functions or sections, not the whole file.
- **Pending:** not yet read end to end for this pass. Scans and passing tests do
  not promote a file to Read.

Scope: first-party source, tests, scripts, styles, current manifests and build/CI
configuration. Excludes dependencies/vendor code, lockfiles, historical releases,
generated output and documentation other than contributor instructions. Removed
obsolete files are explained in the review, not kept in this active inventory.

126 files: 26 Read, 5 Partial, 95 Pending.
Update this checklist when actually reading a file; do not reset statuses by rerunning
a static scan. New or substantially changed files need another review.

| File | Coverage |
| --- | --- |
| [apps/zotero/ui/src/AccountStep.tsx](../apps/zotero/ui/src/AccountStep.tsx) | Read |
| [apps/zotero/ui/src/StorageStep.tsx](../apps/zotero/ui/src/StorageStep.tsx) | Read |
| [apps/zotero/ui/src/setup-model.ts](../apps/zotero/ui/src/setup-model.ts) | Read |
| [apps/zotero/ui/test/setup-model.test.mjs](../apps/zotero/ui/test/setup-model.test.mjs) | Read |
| [scripts/check-app-screens.mjs](../scripts/check-app-screens.mjs) | Read |
| [.dockerignore](../.dockerignore) | Pending |
| [.github/workflows/check.yml](../.github/workflows/check.yml) | Read |
| [.github/workflows/images.yml](../.github/workflows/images.yml) | Partial |
| [.github/workflows/release.yml](../.github/workflows/release.yml) | Pending |
| [.gitignore](../.gitignore) | Read |
| [AGENTS.md](../AGENTS.md) | Read |
| [apps/docling/controller/Dockerfile](../apps/docling/controller/Dockerfile) | Pending |
| [apps/docling/controller/controller.py](../apps/docling/controller/controller.py) | Partial |
| [apps/docling/controller/test_controller.py](../apps/docling/controller/test_controller.py) | Pending |
| [apps/docling/package/compose.yaml](../apps/docling/package/compose.yaml) | Pending |
| [apps/docling/package/healthcheck.test.mjs](../apps/docling/package/healthcheck.test.mjs) | Pending |
| [apps/docling/package/scholarserver-app.yaml](../apps/docling/package/scholarserver-app.yaml) | Pending |
| [apps/docling/ui/index.html](../apps/docling/ui/index.html) | Pending |
| [apps/docling/ui/package.json](../apps/docling/ui/package.json) | Pending |
| [apps/docling/ui/src/App.tsx](../apps/docling/ui/src/App.tsx) | Read |
| [apps/docling/ui/src/main.tsx](../apps/docling/ui/src/main.tsx) | Pending |
| [apps/docling/ui/src/styles.css](../apps/docling/ui/src/styles.css) | Pending |
| [apps/docling/ui/tsconfig.json](../apps/docling/ui/tsconfig.json) | Read |
| [apps/docling/ui/vite.config.ts](../apps/docling/ui/vite.config.ts) | Pending |
| [apps/obsidian/api/.gitignore](../apps/obsidian/api/.gitignore) | Pending |
| [apps/obsidian/api/Dockerfile](../apps/obsidian/api/Dockerfile) | Read |
| [apps/obsidian/api/package.json](../apps/obsidian/api/package.json) | Read |
| [apps/obsidian/api/src/frontmatter.mjs](../apps/obsidian/api/src/frontmatter.mjs) | Pending |
| [apps/obsidian/api/src/frontmatter.test.mjs](../apps/obsidian/api/src/frontmatter.test.mjs) | Pending |
| [apps/obsidian/api/src/packaged-startup.test.mjs](../apps/obsidian/api/src/packaged-startup.test.mjs) | Read |
| [apps/obsidian/api/src/server.mjs](../apps/obsidian/api/src/server.mjs) | Partial |
| [apps/obsidian/livesync-couchdb/Dockerfile](../apps/obsidian/livesync-couchdb/Dockerfile) | Pending |
| [apps/obsidian/livesync-couchdb/entrypoint.sh](../apps/obsidian/livesync-couchdb/entrypoint.sh) | Pending |
| [apps/obsidian/livesync-couchdb/healthcheck.sh](../apps/obsidian/livesync-couchdb/healthcheck.sh) | Pending |
| [apps/obsidian/livesync-worker/Dockerfile](../apps/obsidian/livesync-worker/Dockerfile) | Pending |
| [apps/obsidian/livesync-worker/worker-state.mjs](../apps/obsidian/livesync-worker/worker-state.mjs) | Pending |
| [apps/obsidian/livesync-worker/worker-state.test.mjs](../apps/obsidian/livesync-worker/worker-state.test.mjs) | Pending |
| [apps/obsidian/livesync-worker/worker.mjs](../apps/obsidian/livesync-worker/worker.mjs) | Pending |
| [apps/obsidian/mcp/Dockerfile](../apps/obsidian/mcp/Dockerfile) | Pending |
| [apps/obsidian/mcp/package.json](../apps/obsidian/mcp/package.json) | Pending |
| [apps/obsidian/mcp/src/lib/markdown.test.ts](../apps/obsidian/mcp/src/lib/markdown.test.ts) | Pending |
| [apps/obsidian/mcp/src/lib/markdown.ts](../apps/obsidian/mcp/src/lib/markdown.ts) | Pending |
| [apps/obsidian/mcp/src/lib/vault.ts](../apps/obsidian/mcp/src/lib/vault.ts) | Pending |
| [apps/obsidian/mcp/src/obsidian-client.ts](../apps/obsidian/mcp/src/obsidian-client.ts) | Pending |
| [apps/obsidian/mcp/src/server.ts](../apps/obsidian/mcp/src/server.ts) | Pending |
| [apps/obsidian/mcp/src/test-client.ts](../apps/obsidian/mcp/src/test-client.ts) | Pending |
| [apps/obsidian/mcp/src/tools/attachments.ts](../apps/obsidian/mcp/src/tools/attachments.ts) | Pending |
| [apps/obsidian/mcp/src/tools/bulk.ts](../apps/obsidian/mcp/src/tools/bulk.ts) | Pending |
| [apps/obsidian/mcp/src/tools/contracts.test.ts](../apps/obsidian/mcp/src/tools/contracts.test.ts) | Pending |
| [apps/obsidian/mcp/src/tools/daily.ts](../apps/obsidian/mcp/src/tools/daily.ts) | Pending |
| [apps/obsidian/mcp/src/tools/files.ts](../apps/obsidian/mcp/src/tools/files.ts) | Pending |
| [apps/obsidian/mcp/src/tools/folders.ts](../apps/obsidian/mcp/src/tools/folders.ts) | Pending |
| [apps/obsidian/mcp/src/tools/links.ts](../apps/obsidian/mcp/src/tools/links.ts) | Pending |
| [apps/obsidian/mcp/src/tools/metadata.ts](../apps/obsidian/mcp/src/tools/metadata.ts) | Pending |
| [apps/obsidian/mcp/src/tools/notes.ts](../apps/obsidian/mcp/src/tools/notes.ts) | Pending |
| [apps/obsidian/mcp/src/tools/search-notes.ts](../apps/obsidian/mcp/src/tools/search-notes.ts) | Pending |
| [apps/obsidian/mcp/src/tools/search.ts](../apps/obsidian/mcp/src/tools/search.ts) | Pending |
| [apps/obsidian/mcp/src/tools/status.ts](../apps/obsidian/mcp/src/tools/status.ts) | Pending |
| [apps/obsidian/mcp/tsconfig.json](../apps/obsidian/mcp/tsconfig.json) | Pending |
| [apps/obsidian/package/compose.yaml](../apps/obsidian/package/compose.yaml) | Pending |
| [apps/obsidian/package/scholarserver-app.yaml](../apps/obsidian/package/scholarserver-app.yaml) | Pending |
| [apps/obsidian/sync/Dockerfile](../apps/obsidian/sync/Dockerfile) | Pending |
| [apps/obsidian/sync/controller.mjs](../apps/obsidian/sync/controller.mjs) | Pending |
| [apps/obsidian/sync/livesync-lifecycle.mjs](../apps/obsidian/sync/livesync-lifecycle.mjs) | Pending |
| [apps/obsidian/sync/livesync-lifecycle.test.mjs](../apps/obsidian/sync/livesync-lifecycle.test.mjs) | Pending |
| [apps/obsidian/sync/livesync-settings.mjs](../apps/obsidian/sync/livesync-settings.mjs) | Pending |
| [apps/obsidian/sync/livesync-setup.mjs](../apps/obsidian/sync/livesync-setup.mjs) | Pending |
| [apps/obsidian/sync/livesync-setup.test.mjs](../apps/obsidian/sync/livesync-setup.test.mjs) | Pending |
| [apps/obsidian/sync/package.json](../apps/obsidian/sync/package.json) | Pending |
| [apps/obsidian/ui/index.html](../apps/obsidian/ui/index.html) | Pending |
| [apps/obsidian/ui/package.json](../apps/obsidian/ui/package.json) | Pending |
| [apps/obsidian/ui/src/App.tsx](../apps/obsidian/ui/src/App.tsx) | Partial |
| [apps/obsidian/ui/src/main.tsx](../apps/obsidian/ui/src/main.tsx) | Pending |
| [apps/obsidian/ui/src/styles.css](../apps/obsidian/ui/src/styles.css) | Pending |
| [apps/obsidian/ui/tsconfig.json](../apps/obsidian/ui/tsconfig.json) | Read |
| [apps/obsidian/ui/vite.config.ts](../apps/obsidian/ui/vite.config.ts) | Pending |
| [apps/zotero/automations/Dockerfile](../apps/zotero/automations/Dockerfile) | Pending |
| [apps/zotero/automations/test_worker.mjs](../apps/zotero/automations/test_worker.mjs) | Pending |
| [apps/zotero/automations/worker.mjs](../apps/zotero/automations/worker.mjs) | Pending |
| [apps/zotero/controller/Dockerfile](../apps/zotero/controller/Dockerfile) | Read |
| [apps/zotero/controller/controller.mjs](../apps/zotero/controller/controller.mjs) | Partial |
| [apps/zotero/controller/status-model.mjs](../apps/zotero/controller/status-model.mjs) | Read |
| [apps/zotero/controller/status-model.test.mjs](../apps/zotero/controller/status-model.test.mjs) | Read |
| [apps/zotero/desktop/Dockerfile](../apps/zotero/desktop/Dockerfile) | Pending |
| [apps/zotero/desktop/novnc-index.html](../apps/zotero/desktop/novnc-index.html) | Pending |
| [apps/zotero/desktop/plugin/manifest.json](../apps/zotero/desktop/plugin/manifest.json) | Pending |
| [apps/zotero/desktop/plugin/updates.json](../apps/zotero/desktop/plugin/updates.json) | Pending |
| [apps/zotero/desktop/scholarserver-launch.mjs](../apps/zotero/desktop/scholarserver-launch.mjs) | Pending |
| [apps/zotero/desktop/start-zotero.sh](../apps/zotero/desktop/start-zotero.sh) | Pending |
| [apps/zotero/local-api-bridge/Dockerfile](../apps/zotero/local-api-bridge/Dockerfile) | Pending |
| [apps/zotero/mcp/Dockerfile](../apps/zotero/mcp/Dockerfile) | Pending |
| [apps/zotero/mcp/package.json](../apps/zotero/mcp/package.json) | Pending |
| [apps/zotero/mcp/src/server.ts](../apps/zotero/mcp/src/server.ts) | Pending |
| [apps/zotero/mcp/src/tools/attachments.ts](../apps/zotero/mcp/src/tools/attachments.ts) | Pending |
| [apps/zotero/mcp/src/tools/collections.ts](../apps/zotero/mcp/src/tools/collections.ts) | Pending |
| [apps/zotero/mcp/src/tools/items.ts](../apps/zotero/mcp/src/tools/items.ts) | Pending |
| [apps/zotero/mcp/src/tools/notes.ts](../apps/zotero/mcp/src/tools/notes.ts) | Pending |
| [apps/zotero/mcp/src/tools/tags.ts](../apps/zotero/mcp/src/tools/tags.ts) | Pending |
| [apps/zotero/mcp/src/zotero-client.ts](../apps/zotero/mcp/src/zotero-client.ts) | Pending |
| [apps/zotero/mcp/tsconfig.json](../apps/zotero/mcp/tsconfig.json) | Pending |
| [apps/zotero/package/compose.yaml](../apps/zotero/package/compose.yaml) | Pending |
| [apps/zotero/package/scholarserver-app.yaml](../apps/zotero/package/scholarserver-app.yaml) | Pending |
| [apps/zotero/package/variants.test.mjs](../apps/zotero/package/variants.test.mjs) | Read |
| [apps/zotero/ui/index.html](../apps/zotero/ui/index.html) | Pending |
| [apps/zotero/ui/package.json](../apps/zotero/ui/package.json) | Read |
| [apps/zotero/ui/src/App.tsx](../apps/zotero/ui/src/App.tsx) | Read |
| [apps/zotero/ui/src/AutomationsTab.tsx](../apps/zotero/ui/src/AutomationsTab.tsx) | Pending |
| [apps/zotero/ui/src/main.tsx](../apps/zotero/ui/src/main.tsx) | Read |
| [apps/zotero/ui/src/styles.css](../apps/zotero/ui/src/styles.css) | Pending |
| [apps/zotero/ui/tsconfig.json](../apps/zotero/ui/tsconfig.json) | Read |
| [apps/zotero/ui/vite.config.ts](../apps/zotero/ui/vite.config.ts) | Read |
| [biome.json](../biome.json) | Pending |
| [package.json](../package.json) | Read |
| [packages/controller-runtime/files.mjs](../packages/controller-runtime/files.mjs) | Pending |
| [packages/controller-runtime/files.test.mjs](../packages/controller-runtime/files.test.mjs) | Pending |
| [packages/controller-runtime/package.json](../packages/controller-runtime/package.json) | Pending |
| [packages/mcp-common/package.json](../packages/mcp-common/package.json) | Pending |
| [packages/mcp-common/src/index.ts](../packages/mcp-common/src/index.ts) | Pending |
| [packages/mcp-common/src/infisical.ts](../packages/mcp-common/src/infisical.ts) | Pending |
| [packages/mcp-common/src/schema.ts](../packages/mcp-common/src/schema.ts) | Pending |
| [packages/mcp-common/src/transport.ts](../packages/mcp-common/src/transport.ts) | Read |
| [packages/mcp-common/tsconfig.json](../packages/mcp-common/tsconfig.json) | Pending |
| [scripts/build-native-images.sh](../scripts/build-native-images.sh) | Pending |
| [scripts/build-release.sh](../scripts/build-release.sh) | Pending |
| [scripts/sync-icons.mjs](../scripts/sync-icons.mjs) | Pending |
| [tests/package-contract.test.mjs](../tests/package-contract.test.mjs) | Read |
