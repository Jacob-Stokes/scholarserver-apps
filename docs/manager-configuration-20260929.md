# Manager configuration source pass — 29 September 2026

This is the chronological record of the first qualified development batch. The
subsequent [standalone form cleanup](manager-workspace-cleanup-20260929.md) has
source and synthetic UI evidence only; it needs replacement native images and
new immutable package versions. The paired core rollout report owns the current
installed inventory. Earlier source-only statements below describe those stages.

This source candidate makes native Manager configuration the canonical setup
route for the six packaged app UIs. It is not a package publication, installed
version inventory, native-image qualification or fresh-install result.

## Changes

- All six UI entry points and their Configuration navigation return to the exact
  installation's Manager Configuration. Obsidian, Logseq, FreshRSS and Zotero
  overview bookmarks return to Manage. n8n's catalog and automation bookmarks
  retain their engine identity in Manager Automations; its explicit embedded
  setup route remains available. Docling queue/process and Zotero attachment workspaces retain their operational
  routes. Zotero automation bookmarks now open native PDF-processing settings.
- Obsidian's pending first-device step now supports its existing non-destructive
  private-address repair. Only an explicit repair draft exposes the action;
  normal status carries the saved URL, never the URI or passphrase. Repair changes
  the revision, hides stale setup outputs and clears old device confirmation.
- Zotero's connected library now offers attachment setting edits and Sync now.
  The existing save/sync operations remain the mutation owners. Saved download
  and group-file settings participate in revision checks. WebDAV conditional
  fields and selected storage mode agree; account setup is not replayed.
- Completed Obsidian, Logseq, Zotero and FreshRSS connections omit setup counters.
  Independent Docling defaults/queue/service, FreshRSS appearance and n8n settings
  no longer pretend to be sequential setup steps. n8n recovery wording points to
  restoration instead of sign-in. Logseq explains how to copy the full sign-in
  return address. Security and recovery warnings remain visible.

## Verification

- `npm test`, `npm run lint` and the complete `npm run build` passed in the native
  local checkout. The test command now includes twelve navigation regressions,
  including duplicate installation IDs, preserved workspaces and n8n embedding.
- New controller tests cover Obsidian address-repair confirmation, rejected unsafe
  addresses, stale revisions and receipt deduplication; Zotero tests cover ready
  storage edits, sync availability, stale settings and unavailable desktops.
- A loaded-host test run exposed a pre-existing 10 ms real-clock assumption in
  Logseq's timeout test. It now admits the child before advancing a mocked clock,
  proving an unknown execution outcome rather than accidental queue expiry.
  No runner behavior changed. The full suite passed after this correction.
- The paired core parser accepted all 43 app-generated sections. Codex's in-app
  browser inspected all 43 at desktop width, with phone reviews for each app and
  all Zotero variants. The preview renders the real Manager form component with
  synthetic app-generated state; its mutations are blocked and evaluation is a
  fixed snapshot. This does not prove app state transitions or real account setup.
- The separate shared-form fault fixture retained edited choices after a rejected
  save and prevented replay of a persisted unconfirmed request after reload.
  Endpoint read-back failure kept recovery visible and removed its unconfirmed
  address from automatic field defaults. These are mocked browser checks.

Local logs are in the paired core checkout at
`.dev/manager-configuration-20260929/`. The core rollout checklist owns the
remaining build, publication, deployment and live acceptance work.

## Remaining work

Published manifest versions and image digests have not been rewritten. New
immutable versions, source-lock records and native image qualification are needed
before publication/deployment. Keep the final core/apps revisions together.

The subsequent standalone-form cleanup removes the obsolete forms after their
remaining consumers were reviewed. n8n's explicit supported embed remains. Its
new source checkpoint still needs native image/package qualification; do not
infer that gate from route or synthetic UI checks. Zotero's separate scheduling form
has now been retired in favour of native Manager PDF-processing settings and run
history. Its existing worker-to-Manager authentication needs a separate repair
before end-to-end processing can be qualified.

Files uses Manager's existing folder and AI controls; its runtime acceptance is
still to do. Paperless is an unreleased draft without an installable package.
No retained server, personal desktop profile, account or research dataset was
changed in this source pass.

## Failure-state parity follow-up

A direct comparison with the old panels found omitted errors in the native
sections. Obsidian now reports the active worker/client errors, deduplicates the
same reported failure, and shows official-client download/verification progress
with a disabled second-install action. It retains the upstream terms link and
reviewed client version. FreshRSS retains worker errors alongside its setup
instructions. Zotero retains the linked-folder automation warning.

The app-generated preview set now has 48 sections. Targeted failure regressions,
the complete `npm test` command and `npm run lint` passed. The paired core parser
accepted all 48 sections, and all five added states were inspected in Codex's
in-app browser. The remaining runtime and deployment gates are unchanged.

Six new unpublished package candidates now use the suffix
`manager.20260929.1`: Obsidian 0.5.2, Zotero 0.5.12, Logseq/FreshRSS/n8n 0.1.2,
and Docling 0.3.7. Obsidian declares the official terms link origin required by
the native form contract. Existing image references are still pending replacement
and source-lock qualification; these candidates must not be installed or published
until that gate passes. Previously published package versions remain immutable.

## PDF processing and complete-page follow-up

Zotero's PDF-processing settings, folder browsing and run history now use the
native configuration contract and existing worker. The standalone scheduling form
was removed. Seven new descriptor states cover inactive/scheduled/editing/running,
failure history, missing dependencies and the online-library variant. A real-worker
test with a synthetic Manager and empty discovery proves settings/history survive
restart and a repeated request does not run twice. It does not prove authenticated
Manager/Docling/Zotero conversion. The legacy worker currently uses browser APIs
without a scoped service credential; this remains an explicit acceptance gap.

Complete-page fixtures group coherent states for every app with multiple sections.
The paired preview now checks these layouts alongside individual sections, with
all mutation requests blocked. Desktop and phone reviews preserve the pending
setup, disabled action, selected advanced option and failure information.

## Native image publication and coherent package records

Run [36557464955](https://github.com/Jacob-Stokes/scholarserver-apps/actions/runs/36557464955)
completed successfully on native AMD64 and ARM64 from
`f881ada53a14cf706b237484a4165c9635a9d377`. Both publication jobs and all 17 manifest
jobs passed, producing 19 immutable indexes including the two LiveSync subimages.
The branch build did not move `edge`.

Downloaded build and named-gate receipts were verified with
`native-image-receipt.mjs verify-qualification` against the clean source commit.
Each development-gate summary matched the SHA-256 of its architecture's build
receipt. Every published index was then inspected by immutable digest: both
platform config digests and layer counts matched its tested native receipt.
The 19 verified references now appear consistently in all seven package manifests,
Compose files and `catalog/image-source-lock.json`; the complete source-lock gate
passes. Files receives new immutable candidate `0.1.1-manager.20260929.1` for its
newly qualified image. Obsidian and n8n again declare both architectures, now
that both native candidate images have passed their named gates.

These are new development package candidates. No published old package was
modified, and no retained instance has been updated in this pass. The matching
core source still needs its final apps pin, native build and guarded deployment.

What the native gates establish:

- Files container operations and restart.
- Obsidian startup, consent-controlled client download and independent two-peer
  LiveSync, including the existing native note/API checks.
- FreshRSS setup, MCP operations, restart and restore.
- n8n password setup and controller restart.
- Docling controller UI, validation and restart.
- Logseq unsynced graph/MCP, restart and managed setup UI.
- Zotero disposable desktop, protected bridge, Manager processing settings,
  UI and controller/worker restart.

Limits remain: this is not authenticated retained-host or full fresh-install
acceptance; it does not establish real account/library access, Logseq encrypted
sync, the Docling conversion engine, or Zotero's worker-to-Manager service
connection. The latter remains a known pre-existing repair. Original Obsidian
first-device setup is still a separate live task. Official catalog release gates
and minimum-platform compatibility are not waived by these image receipts.

Local evidence: `.dev/manager-configuration-20260929/verified-registry.json`,
`registry-verification.log`, `native-run-36557464955.log` and each architecture's
native receipt, qualification and development-summary directory. GitHub artifacts
expire after 14 days; the downloaded copies retain the reviewed evidence.
