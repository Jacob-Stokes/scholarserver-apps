# App image refresh — 12 September 2026

This follows the [initial source audit](package-build-audit-20260912.md).
Source, image publication, package publication, installation and account-level
acceptance are separate checkpoints. Freelove is not changed by this pass.

## Corrections

The n8n integration now presents its reviewed templates as a responsive card grid,
with multiword search, an application filter, template-owned tags, name sorting,
result counts and a clear empty state. Setup is shown after choosing a card;
returning preserves the filters. Desktop and mobile checks use the built image.

The audit found later UI/runtime source missing from ten other custom images:
FreshRSS reader/integration, Docling controller, Obsidian sync controller, all five
Zotero services and Logseq helper. Eight unchanged custom wrappers were also
rebuilt to establish an explicit source record for all nineteen recipes. Upstream
Docling Serve and Logseq browser editor references are unchanged.

Native tests exposed two additional defects:

- Zotero's local API bridge omitted modules imported by its controller. Its
  Dockerfile now includes those dependencies. Both architectures start the real
  desktop, authenticate the bridge and recover after restart.
- CouchDB can return 401 while bootstrapping its administrator. Obsidian's initial
  authenticated `GET /_up` now retries that transient state within its existing
  bounded wait. Other authentication errors still fail immediately. Five HTTP
  regressions cover successful bootstrap, exhaustion and the restricted retry.

The first failed Zotero bridge and Obsidian sync images are not package pins.
No existing credentials, accounts or libraries were used to diagnose these defects.

## Build provenance

All nineteen custom recipes were built natively on AMD64 and ARM64, without
emulation, from immutable exported source snapshots. UI/controller changes use
`71d9ce4`; unchanged wrappers use `434b57a`; the final Zotero controller and bridge
use `3f8fc87`; the corrected Obsidian sync controller uses `987206e`.

Before publication, each snapshot's reviewed source-input fingerprint is compared
with the current checkout. Published native manifests are then checked against
the built image's filesystem layer identities, runtime configuration,
architecture and source-revision label. Each multi-architecture index must contain
exactly the two checked native children. A matching tag name alone is not proof.

`catalog/image-source-lock.json` records the resulting immutable image references
and source fingerprints. Both app release assembly and core catalog assembly
reject missing/stale records or differing manifest/Compose pins before packaging.
This is an engineering source record, not a cryptographic build attestation or a
replacement for account, install, recovery or redistribution review.

A clean export test exposed a release-checker entry-point bug: Node canonicalizes
its module path, but the CLI argument can retain `/tmp` or another directory
symlink. The initial comparison then skipped the check. Both paths now resolve
to real files; a CLI regression proves accepted and stale-source behavior through
a directory alias. The changed source-checker is build tooling, not an app runtime
input, so it does not require republishing the already verified app images.

## New source package candidates

| Application | Package version | Refreshed custom images |
| --- | --- | --- |
| n8n | `0.1.0-beta.6` | 2 |
| Files | `0.1.0-beta.4` | 1 |
| FreshRSS | `0.1.0-beta.6` | 2 |
| Docling | `0.3.5-beta.3` | 1 |
| Obsidian | `0.5.0-beta.3` | 5 |
| Zotero | `0.5.10-beta.3` | 5 |
| Logseq | `0.1.0-beta.3` | 3 |

All nineteen multi-architecture candidate indexes are published under
`candidate-20260912.1` (with distinct CouchDB/worker suffixes). The checked source
packages select their immutable digests, not these tags. Both native n8n runs
also pull the final package-selected digests and repeat browser, workflow and
restart acceptance. No official catalog release is published in this pass.

## Acceptance scope

| Application | Native acceptance performed | Not established by these checks |
| --- | --- | --- |
| n8n | Password-only setup and Manager-service input; built desktop/mobile catalog; filtering and sorting; configured copies, enable/disable, execution history and restart; three research templates execute against synthetic app services | Real library grants, final signed Manager installation, Manager-driven credential restore or optional editor hostname lifecycle |
| FreshRSS | Setup, six MCP tools, rejected unauthenticated requests, reader failure/recovery, restart and stopped-filesystem backup restore | A user's real feeds/account or cross-host Manager restore |
| Files | Native file/authentication checks and restart | A user's shared folders or fresh signed Manager installation |
| Zotero | Five-container startup, real disposable desktop profile, authenticated desktop bridge, UI and credential-preserving restart | Zotero account/library sync or the withheld research-items action against a real library |
| Docling | Built UI, saved defaults, expiring toast, invalid input and restart on both architectures; actual pinned AMD64 engine converts a synthetic PDF to Markdown | ARM64 conversion-engine execution, OCR/table fidelity or a real research library |
| Logseq | Fourteen MCP tools on a disposable local graph, two sessions, rejected input, graph restart; fresh setup UI; sync-service startup, invalid-address rejection and restart on both architectures | Account enrollment, encrypted device sync, physical-device or public OAuth acceptance |
| Obsidian | Both architectures: explicit-consent client download and integrity, non-root native CLI/SQLite, restart and legacy-layout preservation, MCP write/edit/read, real independent two-peer LiveSync replication and worker restart | Authenticated account migration, official account sync, an actual desktop LiveSync plugin or live Manager backup/restore |

All image layers were checked for prohibited bundled Obsidian Headless content.
New containerd Zstandard exports are decoded and checked, not skipped. Logseq's
existing notices and upstream source-delivery obligations remain in force.

The ARM64 Obsidian check runs the unchanged Python harness inside a native Linux
coordinator, with a disposable fixture volume and the test Docker socket. It
uses no existing Mac vault. Both anonymous volumes created by the upstream
worker images were captured and explicitly removed; the harness now removes
owned containers with their anonymous volumes in future runs.

## Release boundary

The existing n8n and Obsidian release gates remain. Compiling the research actions
does not authorize adding them to package grants: Zotero `research-items` and
Obsidian `create-research-note` remain withheld pending compatible real-app
acceptance. No existing immutable package is overwritten and no stable channel
is promoted by these image builds.

## Final source and assembly checks

The full apps `npm test` and `npm run lint` pass after the final pins and
canonical-entry-point correction. All thirteen source-record regressions pass.
Core `pnpm check` passes; its Linux-only release fixture remains a declared skip
on this Mac, not a native Linux result.

Core catalog assembly was also run against a clean Git export of apps `db094de`,
without that export having `node_modules`. It executed all nineteen source checks
using core's locked YAML dependency, copied seven versioned packages, and passed
the core schema/Compose validator for every package. A separate exported fixture
then changed the Obsidian controller source: assembly exited 1 for a stale record
and did not create its output directory. The pre-fix skipped-check result is
retained as failed evidence, not counted as final verification.

This assembled local catalog is validation output, not a published release.
The seven app project notes and their index in Jacob's Obsidian vault were updated
and read back with matching hashes. They retain the account/device and deployment
limits rather than presenting image publication as live acceptance.

Core's Home/navigation/search/toast changes already had a private signed AMD64
build and fresh-host acceptance at `bc80fcb` (`0.1.0-e2e.20260911.2`). Comparing
that source to the pre-refresh core checkpoint `d3060f4` finds no later runtime
change. That private build was not the public `rc.20260911.2` release or a
Freelove upgrade. The prior trace report's sign-in-heading and slow-settings-
reload findings are separate from this app-image refresh.

## Evidence and temporary resources

Native build inspections, layer scans, registry comparisons, browser screenshots
and test logs are retained locally under `.dev/package-refresh-20260912/` in the
apps repository. n8n browser screenshots are under the same relative directory
in the core repository. Failed fixture attempts are retained separately from
successful final runs; they are not silently relabelled as passes.

AMD64 checks use the disposable DigitalOcean host `599780940`, with firewall
`460b2fb6-d1b6-4cb8-95d7-755092d9ef57`; ARM64 checks use local Mac Docker.
No public app ports or Tailscale identity were created. The final cleanup result
was verified against fresh DigitalOcean inventories: both exact resource IDs
were absent at **01:35:21 UTC, 12 September 2026**. The fallback timer is stopped
and inactive, and the publishing SSH tunnel is closed. Resolution's source runner
is active. Local Mac Docker was returned to its previous stopped state; unrelated
stored containers and data were retained. No paid preview server remains.
