# Logseq candidate proof — 6 September 2026

## Verified

Disposable graphs and native Docker containers: AMD64 on Resolution and ARM64 on
Freelove. No
researcher's notes, account, existing Logseq graph or existing service was used.
No host ports were published. The browser preview used a loopback-only SSH tunnel.

- Official Logseq 2.0.1 Linux archive checksum verified at image build.
- CLI created a database graph, research page and block without a GUI/display server.
- Hardened helper and MCP containers start as UID 1000 with read-only roots,
  dropped capabilities and no Docker socket.
- Actual MCP protocol: all six tools work, including search, page/block/task
  creation and reading the resulting tree.
- Unicode and a synthetic DOI citation survived storage and retrieval.
- Two concurrent MCP clients worked (not the older npm CLI's MCP transport).
- Restarting both containers preserved the page, block, task and service identity.
- The graph API rejects unauthenticated requests.
- Unit tests exercise validation, command serialization, timeout outcomes,
  bounded queues/output, stdin transport and non-destructive graph initialization.
- Our own interrupted initialization is resumable. A pre-existing graph with a
  missing or empty database is rejected before the upstream CLI can recreate it.
- The maintained upstream sync and DB web images start under the development
  recipe's non-root/read-only constraints. Sync health returns 200; graph listing
  without credentials returns 401.
- The DB editor loads in the in-app browser. It starts with its own **Demo** graph.
  That is a rendering/startup proof, **not** evidence of shared-graph sync.
- Complete existing apps repository test suite and lint pass with the candidate.

## Not yet verified / not yet implemented

- Real Logseq account authorization and encrypted graph enrollment.
- Browser, server replica and a device using the same graph bidirectionally.
- Compatibility of the three pinned upstream builds across the sync protocol.
- Attachments, reconnect after network loss and consistent backup/restore.
- ScholarServer setup screens, access-route integration and the two install choices.
- Final package manifest, release image digests and full redistribution/source notices.

This is not available in the published catalog. `RELEASE_BLOCKED.md` records the
acceptance gates. Existing Obsidian and Zotero installations are unchanged.

The new non-publishing GitHub workflow cannot be dispatched until its file exists
on the default branch (GitHub returned 404). Native proofs were run on the two
hosts above instead; neither host was reinstalled.

## Reproduce

From a fresh disposable repository checkout on a native Linux Docker host:

```sh
npm ci --ignore-scripts
npm run test:logseq
sh scripts/check-logseq-candidate.sh
```

The native script refuses existing test data and does not publish images. It stops
its own containers afterward; the disposable graph remains in the checkout for
inspection. The optional upstream preview is separate and is not a sync test.
