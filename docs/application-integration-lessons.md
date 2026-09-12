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
- Review existing MCPs before extending our own, but verify their actual backend.
  Desktop/plugin APIs and headless-worker HTTP are not interchangeable just because
  both use HTTP. Measure CLI overhead before copying upstream validation and editing
  semantics; a compatibility shim can cost more maintenance than the code it replaces.
- A direct worker transport need not replace the upstream engine. Keep lifecycle
  in the official client and transactions/sync in its worker where practical.
  Use maintained wire codecs, pin the internal API revision and measure equivalent
  operations. Test repeated edits, references and restart, not just latency of a ping.

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
- Test generated download/asset URLs from every participant, including containers.
  A service's loopback address is not reachable from its peer. Verify the downloaded
  dataset's identity and encryption, not only the upstream command's exit status.

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

- Package discovery must reject incomplete package directories, not silently skip
  a missing manifest or Compose file. Validate duplicate declarations before
  creating lookup sets/maps, which otherwise erase the evidence. The shared
  `tests/package-contract.test.mjs` covers both cases for future catalog additions.
- Source tests and compilation do not prove a container can start. Exercise the
  final image's entry point, installed dependencies, non-root permissions and
  read-only filesystem on each supported native architecture.
- Shared UI dependencies must resolve in each independent image build, not only
  an npm workspace. File-linked UI packages can leave transitive dependencies
  uninstalled. Pin required runtime dependencies in the consuming UI manifests
  and check fresh isolated installs. Shared motion respects the browser-wide off
  preference and device reduction; animate explicit navigation, never status polls.
- Pinning makes selected inputs deliberate; final digests make installation
  repeatable. Neither alone proves cross-component compatibility or bit-for-bit
  rebuilds. Record compatible versions and remaining moving build inputs.
- Exercise declared setup inputs against the exact pinned image. A source-only
  action change can make an otherwise valid manifest incompatible with its old
  controller. n8n beta.3 exposed this in fresh installation; source unit tests
  against the new controller did not test the old shipped artifact.
- Include platform-issued reserved inputs in native setup tests when a package
  requests them. Verify their protected persistence and restart behaviour without
  printing credentials. A failed setup test must stop, not create accounts or
  keys as a diagnostic fallback. Select final package images from the manifest
  rather than assuming tested development tags match its digests.
- Keep evidence levels separate: unit/mock tests, native containers, browser
  rendering, shared-data sync, installer, published package and deployed instance.
  Source pushed is not package released. Keep incomplete candidates outside the
  catalog and maintain an explicit release gate.
- Use disposable data and isolated resources. Clean up only resources positively
  identified as ours; unavailable CI is not permission to modify shared services,
  merge a default branch or substitute emulation for native release proofs.
- For sync-backed restore tests, disconnect independent clients before creating
  post-backup writes. Assert both restored content and absence of newer content;
  verify attachment bytes outside the browser cache. Reconnect afterward and
  prove a new edit still travels. Same-host restore is not cross-host recovery.
- Optional-service transitions must close removed service routes, not just stop
  containers. Test the reverse transition with preserved data and stable addresses;
  keep fresh installation as a separate proof.
- Verify redistribution obligations separately from technical operation. Free
  use, downloadable binaries and successful builds are not legal clearance.

## Keeping these notes useful

### Source and image drift, 12 September 2026

A signed core bundle authenticates its selected catalog; it does not establish
that an app image contains the current source. Record a fingerprint of each
recipe's runtime, UI, lockfiles, shared build inputs and Dockerfile alongside
its immutable image reference and native architectures. Release assembly now
requires matching records. These records are engineering evidence, not registry
attestations or substitutes for native acceptance.

The audit also found a second entry point for Zotero's controller whose image
omitted newly imported modules. Check every Dockerfile that ships a shared
entry point, not only its primary service. The bridge recipe regression and
native startup check cover this failure.

See [the package build audit](package-build-audit-20260912.md) and
`scripts/check-image-source.mjs`. No live deployment follows from these checks.

### Completion feedback, 11 September 2026

The shared UI snapshot now uses Sonner 2.0.7 for routine `notice` messages.
Errors, setup state, unknown outcomes and recovery instructions stay inline.
Each of the six UI manifests and independent lockfiles pins the runtime for
isolated image builds; `tests/notifications.test.mjs` guards this boundary.
External CSS provides rendering under restrictive CSP without a style exemption.
The Obsidian clipboard path clears the previous notice before awaiting the copy,
so repeating the same copy can announce a new completion.

Full apps tests and all six UI builds pass; core's local browser fixture exercises
the shared frame, expiry, close, repeated completions and reduced motion. These
are source/presentation checks, not new published packages or live acceptance.
Existing manifests remain immutable. Toast-only releases must start from their
published source baseline or qualify additional unpublished app changes first.
The project-vault documentation update is pending; no vault connector was used
for this shared UI pass.

### Local device setup is separate from server setup

Keep the web experience complete. An optional future desktop companion may reuse
app-owned setup guidance, but is not implemented. When documenting a new app,
state which steps run on the server and which require software on the user's
computer. Record the official download source, supported setup link/API, version
limitations, consent needed and manual fallback in the app's development notes.
Separate server paths from device folders. Do not silently modify existing
vaults/libraries, assume OS administrator rights or embed arbitrary native scripts
in the package contract. Prefer existing links and shared presentation; no new
manifest schema or desktop abstraction is justified without a real consumer.

### Other reusable checks

- Direct MCP tests do not prove Gateway compatibility. Assert the manifest's tool
  namespace in definitions, then verify actual Gateway discovery and authenticated
  calls separately. Include duplicate-instance ownership checks: tool names,
  network aliases and credentials must not collide between copies.
- Test setup writes through the deployed Manager proxy, not only directly against
  an app container. The n8n controller correctly required `x-requested-with`, but
  Manager's app-UI header allowlist dropped it. Forwarding that marker fixed the
  integration without forwarding Manager cookies or authorization. Core's Manager
  route regression test also verifies that cross-origin writes stay blocked.
- Native application theming should use upstream extension hooks and shared UI
  tokens, not source patches or a second palette table. Make it reversible without
  changing native preferences. Browser-local preferences only cross pages on the
  same origin; do not promise automatic inheritance at a different hostname.

Record a short observation, why it matters, the decision or fix, and its evidence.
Link to app notes/tests instead of duplicating detailed version matrices here.
Keep unresolved questions explicit, remove obsolete advice, and never include
credentials, enrollment links or personal research data.

Current worked example: [Logseq development notes](../apps/logseq/DEVELOPMENT_NOTES.md).
