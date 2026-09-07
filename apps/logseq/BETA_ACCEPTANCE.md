# Logseq beta acceptance and production gates

7 September 2026: the user requested a clearly labelled beta catalog release
before physical-device and final public OAuth acceptance. Those two gates remain
open; they are not requirements waived for a stable release. The package warns
users to start with a disposable Logseq 2 database notebook.

Distribution preparation now records exact runtime and packaging source revisions,
preserves upstream notices, and supplies source archives alongside the release.
Final public multi-architecture images are pinned in `package/`. See
`BETA_RELEASE.md` for the final verification record. The checklist below remains
the historical candidate record and the baseline for production acceptance.

Do not call Logseq production-ready until all of these have evidence:

- Same graph in browser editor, headless replica and a real device, bidirectionally.
- Logseq sign-in and encrypted graph setup work from the private dashboard without
  putting credentials in command arguments, logs or a central ScholarServer service.
- Restart, sync interruption, attachment sync and backup/restore preserve the graph.
- Recommended browser-editor and no-editor choices use the shared setup/access UI.
- Exact compatible upstream browser/sync/client revisions are recorded and tested.
- Native AMD64 and ARM64 builds and complete upstream licence/source notices.
- Final immutable helper/MCP images and a validated package manifest.
- Authenticated public Gateway calls against the final package, not only direct
  provider calls; deploy and verify the core namespace-ownership guards.

The upstream sync worker's semantic MCP supports only non-E2EE graphs. Do not
silently choose that route, disable graph encryption or substitute a separate graph.

## Platform gap resolved; release gates remain (6 September 2026)

Core `e9fc896` / `fa24d93` now provide generic installer-owned private isolated
origins, without weakening Manager's browser protection or adding Logseq rules.
The unpublished AMD64 acceptance package installed through the actual catalog
wizard. Account enrollment, encrypted download, all fourteen MCP tools, browser
sync both ways and automatic service-restart recovery passed on the fresh host.
See `VERIFICATION.md` for the exact artifacts and evidence limits.

Follow-up recovery checks passed on that candidate: sync-service outage with
edits on both sides, one small attachment with exact-byte verification, same-host
application backup/restore, and browser/devices-only/browser transitions. These
do not prove every network failure, large attachments or a new-device enrollment.

Fresh devices-only catalog enrollment now also passes, including forced helper
termination during first download and safe retry. An isolated native ARM64 stack
passes account enrollment, encrypted download, all fourteen MCP tools, browser
sync both ways and automatic restart recovery. ARM64 was not a fresh core install.

Do not publish yet: physical-device acceptance, complete source and licence
notices, and final immutable release artifacts still need evidence. The remaining
packaging work is itemized in `PACKAGING_AUDIT.md`.
The acceptance assembler is test-only and does not create a public package.

Gateway follow-up corrected unprefixed tool names: local-only `.3` now discovers
all fourteen tools through Gateway. Direct mutation and persisted-data checks
pass, but fresh public OAuth navigation failed in the browser. The corrected MCP
image still needs final native ARM64 verification. A second installation exposed
a core namespace/credential collision; guards are source-tested, and the test
registry was repaired. Multiple AI-connected copies are not supported yet.
