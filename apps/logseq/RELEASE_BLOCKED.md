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

## Platform gap resolved; release gates remain (6 September 2026)

Core `e9fc896` / `fa24d93` now provide generic installer-owned private isolated
origins, without weakening Manager's browser protection or adding Logseq rules.
The unpublished AMD64 acceptance package installed through the actual catalog
wizard. Account enrollment, encrypted download, all fourteen MCP tools, browser
sync both ways and automatic service-restart recovery passed on the fresh host.
See `VERIFICATION.md` for the exact artifacts and evidence limits.

Do not publish yet: physical-device and native ARM64 encrypted-sync acceptance,
the devices-only variant, attachments/network-loss/restore, complete source and
licence notices, and final immutable release artifacts still need evidence.
The acceptance assembler is test-only and does not create a public package.
