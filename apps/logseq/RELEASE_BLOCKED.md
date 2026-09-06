# Not ready for catalog publication

Do not publish Logseq until all of these have evidence:

- Same graph in browser editor, headless replica and a real device, bidirectionally.
- Logseq sign-in and encrypted graph setup work from the private dashboard without
  putting credentials in command arguments, logs or a central ScholarServer service.
- Restart, sync interruption, attachment sync and backup/restore preserve the graph.
- Recommended browser-editor and no-editor choices use the shared setup/access UI.
- Exact compatible upstream browser/sync/client revisions are recorded and tested.
- Native AMD64 and ARM64 builds and complete upstream licence/source notices.
- Final immutable helper/MCP images and a validated package manifest.

The upstream sync worker's semantic MCP supports only non-E2EE graphs. Do not
silently choose that route, disable graph encryption or substitute a separate graph.

## Confirmed platform access gap (6 September 2026)

The core `ApplicationEndpointService` currently accepts only browser-session or
forward-auth interfaces for optional remote access. Its browser boundary rejects
cross-origin requests, including WebSocket upgrades. Native Logseq sync carries
its own account authentication and is used from a separate browser/device origin.
It cannot safely be relabelled as a browser-session endpoint. The pinned editor
also expects root-relative assets and its own origin rather than an arbitrary
Manager path prefix.

The isolated development proof uses separate private origins. Those hand-created
test routes are not a replacement for generic installer-owned routing. Add a
shared capability for application-native authenticated endpoints and isolated
editor origins, with origin/authentication tests, before claiming a normal catalog
installation. Do not disable Manager's browser protection or add Logseq-specific
routing in core. Keep the candidate outside `package/` while this remains open.
