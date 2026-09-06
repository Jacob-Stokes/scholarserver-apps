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
