# Packaging verification — 6 September 2026

This is a source/candidate checkpoint, not a published catalog update. See
`image-packaging.md` for the inventory and maintenance decisions.

## Passed

- Core `pnpm check`: explicit backup exclusion, including compatibility of
  existing reproducible bindings, Go tests, TS/Go conformance and app boundary.
- Apps `npm test`, `npm run lint`, and production builds for all three app UIs,
  the vault API, shared MCP library and both MCP integrations.
- Six download tests: consent/LiveSync denial, concurrent request coalescing,
  restart, interrupted transfer, bad integrity, tampering, interrupted activation,
  explicit version replacement and unexpected archive content.
- Packaging policy tests require digest-pinned bases, lockfile installation,
  no build-time Headless installation, separate excluded client storage and
  inclusion of the runtime launcher in the image.
- Production UI with synthetic APIs: responsive navigation for all three apps
  at 320/390/768/1280 pixels, explicit download, reload during progress, failed
  download retry and account-form handover. No real login is claimed here.
- Native AMD64 images built for the new Obsidian controller, vault API, MCP,
  CouchDB wrapper and LiveSync worker on Resolution in an isolated temporary
  build directory. No live containers, accounts or vaults were used or changed.
- Real container: no client before consent; direct npm download and SHA-512
  verification; official CLI `0.0.14` runs as UID 1000; restart retains the same
  receipt; synthetic notes and configuration remain untouched. The native
  SQLite dependency opens an in-memory database successfully.
- Legacy enrollment fixture: old-format enrollment is preserved while a missing
  downloaded client waits for explicit confirmation; no sync process starts.
- Real MCP transport: tool discovery, create/edit/read of a disposable Markdown
  note, backed by the separate vault-file API.
- Real two-peer LiveSync: independent CLI peer uploads a note, server worker
  joins after confirmation, peer receives the MCP-created/edited note, worker
  resumes after restart. Headless is absent throughout the LiveSync phase.
- Layer inspection finds no known official Headless package or client bytes in
  those five newly built images (controller 17, API 10, MCP 9, CouchDB 13,
  LiveSync worker 12 layers). Both classic and OCI Docker-save layer paths are
  followed using the export manifest. Source scans alone are not this proof.
- Native GitHub build [34037389197](https://github.com/Jacob-Stokes/scholarserver-apps/actions/runs/34037389197)
  passed on AMD64 and ARM64 at `7349641`. All eleven custom images built and
  passed layer inspection before upload; both architectures passed the same
  real Obsidian packaging/MCP/LiveSync smoke tests. Candidate multi-platform
  manifests were published, not a catalog release or live deployment.
- Clean checkout of `7349641`: explicit dependency installation and the full
  apps test suite passed without relying on development-workspace dependencies.
- Real restic 0.19.1 encrypted backup/list/restore: synthetic downloaded bytes
  were absent from the archive, notes and version metadata were restored, and
  a newer local download was not overwritten. Container stop/start was simulated;
  this is a generic archive proof, not a live app consistency or disaster drill.
- The final bounded-command/error-handling change at `c781a54` also passed the
  complete native build/layer/smoke checks in
  [34037852365](https://github.com/Jacob-Stokes/scholarserver-apps/actions/runs/34037852365).
  The unpublished Obsidian candidate references that run's verified
  multi-platform digests. The release block remains for the other gates.

## Remaining acceptance / publication gates

- Official paid Sync login/MFA, remote encrypted vault selection and bidirectional
  official device sync require a disposable vault on an authorized Sync account.
- The LiveSync CLI peer is not an Obsidian desktop/mobile plugin. Repeat with
  the actual plugin before calling the device setup fully accepted.
- Legacy-format fixture checks are not a real authenticated upgrade from the
  old image. Verify that upgrade with a disposable enrolled vault.
- Publish new image digests and a new catalog version only after the release
  block is resolved. Older immutable catalog versions/images remain unchanged.
- `data.backup: excluded` needs the corresponding core release before this app
  candidate is installable. A live application backup/restore of the candidate
  is still an acceptance gate, distinct from the real generic archive tests.
- Managed-hosting licence permission remains unresolved. No maintainers contacted.
