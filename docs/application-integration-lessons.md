# Application integration lessons

Durable engineering guidance, first recorded 6 September 2026. This complements
the [packaging policy](image-packaging.md) and contributor guide; it is not a
release checklist or proof that a particular application is ready.

## Start with ownership and the data path

- Prefer maintained upstream images. Our setup controller, API and MCP are
  separate responsibilities, not automatic justification for packaging an app.
  Document any custom-image exception, its maintenance cost and what would let
  us remove it. Running without a GUI does not mean an image contains no desktop
  runtime or carries no redistribution obligations.
- Establish which product generation and data format each artifact supports.
  Similar npm names, Docker tags and desktop releases can describe incompatible
  software. Check the exact pinned artifact, not just a project's homepage.
- Prove one small operation through the real data path before polishing setup.
  A browser editor, working MCP and healthy sync server may all use different
  data. For a sync app, prove browser/device/server edits reach the **same** graph
  or vault; a separate demo is only a rendering test.
- Let upstream own database transactions and identities. Use supported APIs or
  clients rather than writing its database ourselves. Keep research operations
  narrow; do not expose an arbitrary shell or command runner through MCP.

## Resolve authentication and encryption early

- Self-hosted storage does not necessarily mean self-hosted authentication.
  Identify external account dependencies and remote-server login requirements
  before promising a simple installer.
- Do not silently disable encryption to make an upstream integration work.
  Document where decryption occurs and verify the proposed route with a disposable
  dataset. A plausible design is not a working encrypted-sync proof.
- Minimize credentials and note contents in process arguments, environment and
  logs. Forward useful classified errors, not raw upstream output that may contain
  private information. Use bounded requests and responses.

## Design failure paths, not just successful installation

- Distinguish our own interrupted first setup from missing or damaged user data.
  Persist initialization ownership before creating data; never treat a missing
  database as permission to recreate an existing installation.
- A timed-out write may have succeeded. Report an unknown outcome and reconcile
  before retrying; automatic retries can duplicate notes, blocks or tasks.
- Bound queue length and total operation time, including waiting. Expired queued
  operations must not execute later. Decode streamed UTF-8 after buffering bytes,
  not independently per chunk.
- Polling observes status; it must not replace unsaved user choices. Reuse the
  shared screen/setup/access components, while app-owned code retains its rules.
  Do not invent a workflow framework merely to avoid small explicit differences.

## Test the artifact we actually ship

- Source tests and compilation do not prove a container can start. Exercise the
  final image's entry point, installed dependencies, non-root permissions and
  read-only filesystem on each supported native architecture.
- Pinning makes selected inputs deliberate; final digests make installation
  repeatable. Neither alone proves cross-component compatibility or bit-for-bit
  rebuilds. Record compatible versions and remaining moving build inputs.
- Keep evidence levels separate: unit/mock tests, native containers, browser
  rendering, shared-data sync, installer, published package and deployed instance.
  Source pushed is not package released. Keep incomplete candidates outside the
  catalog and maintain an explicit release gate.
- Use disposable data and isolated resources. Clean up only resources positively
  identified as ours; unavailable CI is not permission to modify shared services,
  merge a default branch or substitute emulation for native release proofs.
- Verify redistribution obligations separately from technical operation. Free
  use, downloadable binaries and successful builds are not legal clearance.

## Keeping these notes useful

Record a short observation, why it matters, the decision or fix, and its evidence.
Link to app notes/tests instead of duplicating detailed version matrices here.
Keep unresolved questions explicit, remove obsolete advice, and never include
credentials, enrollment links or personal research data.

Current worked example: [Logseq development notes](../apps/logseq/DEVELOPMENT_NOTES.md).
