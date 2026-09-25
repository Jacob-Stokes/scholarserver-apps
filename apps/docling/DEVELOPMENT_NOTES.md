# Docling development notes

## Manage navigation candidate — 24 September 2026

The package declares `/configuration` independently of its `/queue` main UI.
Shared UI returns to the exact installation's Manage page. This is source work;
new image/package qualification and compatible Manager/executor schemas are
required before installation. The existing shared writable-folder recovery
gate remains in force. The project-vault note remains pending.

## Loading deployment and vault-documentation checkpoint — 21 September 2026

The core at commit `62e6d5c650a3b663eede67772e3123f19d74df71` is deployed and
accepted. Docling was not live-updated: its shared writable-folder recovery gate
remains blocked, and no bypass or permission change was used. The loading image
publication and `.20260921.1` metadata are therefore not evidence of a Docling
installation update.

The latest project-vault read returned `Authentication required`. No vault note
or index was written; the project-vault documentation update remains pending.

Docling remains held and was not part of the six live package updates. The
shared writable-folder recovery gate remains unresolved; no bypass, grant or
permission change was used. Remote rollout evidence is retained under
`/var/lib/scholarserver-upgrades/loading-package-import-20260921/` and local
build/package evidence and operator helpers are under
`.dev/loading-resolution-20260921/app-package-rollout`.

## Qualified loading image refresh — 21 September 2026

The loading candidate now selects immutable images from native source
`378305b3d5eaf23bde4eddcf6b1fe5f6957333dc`. GitHub run
`35591930384` passed both architectures' native and browser gates and published
the combined image indexes. Registry configs, source labels and rootfs identities
match the downloaded qualification receipts. The package version advances to
its `.20260921.1` candidate; permissions, storage and variants are unchanged.
See `docs/loading-publication-20260921.md` for the coordinated batch.

This records publication and metadata preparation, not an installed update.
Retained Freelove application and project-vault acceptance are being recorded
separately; no new research execution or desktop sync is claimed.

## Shared access-scope adoption — 20 September 2026

The app still chooses its queue, settings and file readers, but common sibling
denial/retirement now comes from canonical `ReadScope` rather than an app-specific
loop. Request validation, drafts and conversion operations are unchanged. The
existing focused and compiled browser regressions remain the acceptance checks;
this source change does not publish or deploy an image. Vault notes/index pending.

## Shared read resource adoption — 20 September 2026

Queue, defaults and PDF discovery now consume the canonical shared read resource
and observation hook. `docling-reads.ts` owns payload types, same-origin requests,
idle/active cadence and the three readers' common access boundary. The image
recipe already copies the entire UI source tree, including this module.

The UI no longer keeps duplicate snapshot/pending/error state or app-specific
poll timers. Known file results (including empty lists) survive tab changes;
failed refreshes retain selection. Conversion defaults are a saved snapshot plus
a separate draft, so a background read cannot undo editing. Accepted saves seed
the canonical resource and retire older reads; job OCR edits stay independent.

Access expiry clears all three resources and private document/attachment drafts.
Explicit retry creates a new scope, leaving old reads and mutation callbacks with
their retired blocked owner. Ordinary failures do not clear drafts. No writes
are automatically replayed. This is UI/source work, not a claim of server-job
restart recovery, container qualification, package publication or deployment.

Run `npm test -w apps/docling/ui` for focused access-scope/cadence tests and
`scripts/check-app-screens.mjs` after a UI build for compiled delayed/error/draft
and setup-resume checks. See the [migration ledger](../../docs/read-lifecycle-migration.md).
Project-vault note/index updates remain pending; this pass uses no vault connection.

Verification: eight focused tests, UI typecheck/build, `npm run test:ui`, shared
snapshot parity and the compiled multi-app browser checks pass. Defaults editing
survives tab changes and a real background GET; an accepted value survives reload.
The Docling tests are included in the normal `test:ui` command. Full `npm test`
was attempted and remains blocked by the existing absent Paperless workspace.

## Independent loading follow-up — 20 September 2026

Queue observation, conversion defaults and PDF discovery now have separate
pending/error feedback in the shared reserved rows. Defaults and processing
forms do not wait for queue health; queue mutations still require known engine
availability. Unknown counts and file results are not rendered as zero/empty.
File requests are bounded, cancellable and superseded by newer discovery. Empty
successful results are retained when switching tabs, rather than fetched again.
Refresh failure preserves the selected PDF and form draft. If a selected file
disappears, it is labelled as no longer listed and cannot be queued; the UI does
not silently choose a different document.

Idle queue checks run every 30 seconds, with three-second checks when jobs are
queued/running. Hidden documents do not issue polling reads. Status, settings
and file responses denied by the Manager session clear private observations and
cancel sibling reads; automatic polling cannot recover that block. Explicit retry
starts fresh observations. No mutations are automatically replayed.

The compiled synthetic-browser suite covers delayed queue/default/file reads,
failure/retry and draft preservation, successful empty discovery, a disappeared
selection, idle cadence, authentication loss and a late sibling response. Existing
post-pause stale-status and delayed-default tests remain. This is local UI/source
verification, not a container, conversion, published-package or Freelove update.
Full `npm test` was attempted and remains blocked by unrelated root manifest
changes referencing the absent Paperless integration workspace. The vault note
and index update is pending; no project-vault connection was used in this pass.

## Main-interface shortcut — 18 September 2026

Candidate `0.3.5-beta.5.launch.20260918.1` explicitly labels the standalone
document queue as its main interface using `launchLabel: Documents`. This needs
the matching Manager launch resolver, which accepts labelled platform-session
standalone interfaces without provisioning a separate access route. Existing
image pins, permissions and data declarations are unchanged. This source
candidate is not published or deployed. Full apps tests and paired core checks
pass; the project-vault note and index are updated.

## Published image refresh — 18 September 2026

Source candidate `0.3.5-beta.4.editorial.20260918.1` selects changed recipe images
from GitHub run 35332927221,
source 3b90bb773159202103b989cd43d9642eb226a1b6. Both native architectures passed
the workflow gates and were published. Registry indexes, platform configs and
source fingerprints were checked against the downloaded receipts. Only changed
recipe pins and a new package identity change; other image pins, permissions,
storage, variants and declared package architectures are unchanged.

This is image publication and source consolidation, not an official catalog
release or deployment. Existing release gates remain. See
[the refresh record](../../docs/native-candidates-20260918.md). Project-vault
documentation is pending; this pass does not access research data.

## Finalized native candidate pins — 14 September 2026

The current unpublished editorial candidate now selects its exact verified
images from successful dual-native run 34878253357, source 2917a0a. This supersedes
the earlier source-only/old-pin limitation, not the package release block.
Version, descriptions, tags, icons, variants, permissions and data/setup remain
unchanged; n8n and Zotero now advertise qualified ARM64 as well as AMD64.
No runtime input or vendor bytes changed. Full npm tests, lint and all 19 source
locks pass. See [native evidence, snapshot ownership and remaining gates](../../docs/native-candidates-20260914.md).
Development archives are not an official release or a deployment.
The project-vault note/index update is pending under this apps-only scope.

## Editorial icon source candidate — 14 September 2026

Purpose-copy follow-up: `presentation.details.description` now reads
“Convert PDFs into Markdown for your research.” Existing tags, unpublished candidate
version and image pins are unchanged. This describes purpose, not setup or new
capabilities. The two canonical font files were also mirrored into vendor.
Vault-note follow-up is pending under this pass's no-remote-changes boundary.

New unpublished source identity `0.3.5-beta.4.editorial.20260914.1` adds an app-owned
`artwork/editorial.svg` and a locked transparent PNG declaration under
`presentation.editorialIcon`, with separate ScholarServer CC BY 4.0 attribution.
The prior `0.3.5-beta.3` package identity is not rewritten. Original
icon bytes, image pins, Compose, app capabilities, grants and data/setup contracts
are preserved. The explicit release block remains until compatible-core/package
and changed native-image/browser acceptance are qualified; no publication or
retained-host update is implied. See [artwork, source versions, checks and deployment
options](../../docs/editorial-icons.md).

The shared vendor snapshot now matches main's reviewed canonical runtime files,
including editorial typography/themes and the browser-local icon preference.
Any image incorporating the changed shared UI must be rebuilt and qualified;
the preserved pin must not be described as containing these source changes.

Bounded asset/package and n8n UI checks pass; the seven packages also pass the
current core loader/schema check. Full `npm test`, final-image and authenticated
browser acceptance remain main-owned gates. All six app UI typechecks and the
n8n UI build pass; the build emits original/editorial rasters as separate files.
This checkpoint was appended to the existing project-vault app note through
Jacob Gateway; the app index was updated with the same source-only boundaries.

## Image refresh checkpoint — 12 September 2026

Candidate `0.3.5-beta.3` selects the rebuilt immutable AMD64/ARM64 controller;
the upstream conversion engine pin is unchanged. Both architectures pass built-UI
save, expiring toast, invalid-input rejection and settings preservation after
restart. On AMD64 the real pinned engine also converts a synthetic PDF to
Markdown with its source text verified. ARM64 engine execution, OCR/table fidelity
and a real research-library workflow remain outside this check.

Image publication does not publish the official catalog package or upgrade
Freelove. Exact source revisions, nineteen native image records, test scope and
cleanup are in [the refresh report](../../docs/package-refresh-20260912.md).
Earlier dated entries below describe their own checkpoints.


## n8n PDF watcher acceptance — 10 September 2026

The installed Docling engine/controller images passed a real n8n-triggered PDF
conversion in an isolated installation. Zotero and Docling shared one local
rclone test storage location. The generated Markdown was imported by Zotero and
its text verified. Repeated and deliberately overlapping n8n scans retained one
conversion job with one attempt. Scheduling and retries remained in n8n; Docling
owned conversion execution and its existing source-hash/profile deduplication.
See [test chronology and limits](../n8n/PDF_WATCH_ACCEPTANCE.md). No production
Docling installation or immutable package was changed. OCR was off; this does
not establish scanned-PDF or complex-table fidelity.

## Setup read ownership — 7 September 2026

The conversion-defaults form previously allowed saving its initial false value
before the server settings had arrived. The same delayed read could replace a
user's OCR choice for a new job. The browser regression failed on the original
build because Save defaults was enabled while that response was held.

The form now requires successfully loaded defaults before editing or saving them.
Settings reads have a timeout, explicit retry and cancellation on unmount; late
defaults do not replace a job choice the user has edited. Failed reads no longer
silently display a saveable default. This does not retry writes automatically.

Status reads now have one current owner: an action's refresh supersedes an older
poll, routine polls do not overlap, and unmount cancels in-flight status reads.
An empty/unreadable successful HTTP body is treated as an error, not success.

Verification uses the apps test suite and synthetic browser responses for delayed
defaults, failed-read retry, draft preservation and an older poll completing after
queue pause. These are UI/source checks, not a new container conversion or published
package. File discovery and remaining operation lifetimes still need review.

## Catalog tags — 11 September 2026

The package manifest now declares the app-owned `Documents` and `PDF conversion`
tags under `presentation.details.tags`. The metadata-only source candidate is
`0.3.5-beta.2`; existing images, requirements and runtime/security settings are
unchanged. No package was published or deployed. The Obsidian project-vault
note was updated through Jacob Gateway on 11 September 2026; this repository's
catalog-tags document remains authoritative for the exact vocabulary.
## Folder action queue correction — 15 September 2026

Candidate `0.3.5-beta.4.editorial.20260915.1` changes only package version and the
`browse-folders` action's request directory from `documents` to `runtime`. Its
controller already implements folder browsing, but listens for executor requests
under `/runtime/requests`; the old declaration caused a timeout. The declared
`data` field identifies the action mailbox, not the filesystem being browsed.
A cross-app regression checks this contract. Container image pins, permissions
and persistent datasets are unchanged; no image rebuild is needed for this fix.

On Freelove, the approved `research-shared` local storage supplies Docling's
documents and Zotero's linked files. The new empty `Papers` subfolder is shared;
old per-app local directories remain intact and Drive remains disabled. No PDF
conversion or automation execution is claimed. Exact deployment and browser
acceptance are recorded in core `docs/deployments.md`. The package is installed at
revision 17; the live n8n picker selected Papers and enabled Add automation without
submitting. The project-vault note and index were updated through Jacob Gateway.

## Native Manager configuration source candidate — 25 September 2026

The new `ui.configuration` candidate exposes conversion defaults, queue control
and service details through fixed app routes. Default OCR and pause/resume writes
commit with request receipts in one SQLite transaction; a lost HTTP response can
be reconciled by reading the receipt. The existing standalone interface and
older package metadata remain in place. Handler tests cover authorization
markers, invalid input before a receipt, stale revisions, duplicate requests and
receipt reads. This is source-level evidence only: no new image, package,
deployment or browser acceptance is claimed. The project-vault note update for
this candidate remains pending.
