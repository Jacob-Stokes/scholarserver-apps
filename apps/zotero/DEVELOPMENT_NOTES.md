# Zotero development notes

## Native Manager configuration source — 25 September 2026

The existing controller now serves one native configuration section for both the
complete workspace and online-library variants. Online API-key setup and the
desktop's persisted account-link session remain separate. The login URL is an
explicit no-store output, and Zotero's own approval stays in Zotero. Non-secret
storage-mode evaluation reveals WebDAV fields without changing saved state or
requiring a hidden wizard token; the app revalidates the selected mode on action.
Ready summarizes the reported library mode and attachment setting without
claiming initial sync, group-library WebDAV storage or AI-grant acceptance.
Unavailable saved desktops lead to recovery rather than another account start.
The standalone UI and routes remain available. A failed status read after an
action receipt was saved cannot turn confirmed work into a retryable rejection.

Focused configuration/helper tests and the full apps source suite pass with local
loopback permission. Synthetic descriptors pass the core parser/manifest checker.
No image, installed-package update, real-account approval, attachment delivery or
browser acceptance was performed; image pins are untouched here. The project-vault
app note/index update remains pending because no vault connector was used.

## Completed setup presentation — 24 September 2026

Ready Configuration now summarizes the current account, attachment access,
connection/API and applicable permissions or file settings, with connection
check, supported attachment-settings edit and sync actions. Saving an edit
returns to the ready view rather than advancing through authorization again;
failed saves retain the existing form state. Incomplete setup keeps its existing
guided flow and completion feedback. UI typecheck, build, focused source tests and
synthetic Chrome ready/setup/recovery scenarios pass. The project-vault app
note/index update is pending and was not attempted here.

## Loading deployment and vault-documentation checkpoint — 21 September 2026

The core at commit `62e6d5c650a3b663eede67772e3123f19d74df71` is deployed and
accepted. The imported package `0.5.10-guided.20260921.1` for
`personal/zotero-sync-test` revision 4 was applied and runtime checks passed.
Exact images were healthy; data bindings, grants and unrelated state were
preserved. The screen loads but remains Setup Needed because the local API is
unavailable; no fresh setup acceptance is claimed. Its retained
`gateway-integration-failed` warning remains. Personal Zotero remains blocked by
the shared writable-folder recovery gate, with no bypass or permission change.

Remote rollout evidence is retained under
`/var/lib/scholarserver-upgrades/loading-package-import-20260921/` and the
local build/package evidence and operator helpers are under
`.dev/loading-resolution-20260921/app-package-rollout`.

The latest project-vault read returned `Authentication required`. No vault note
or index was written; the project-vault documentation update remains pending.

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

## Shared loading migration — 20 September 2026

Status, desktop access, account progress and the existing automation list now use
the shared read lifecycle and independent feedback. Accepted content survives
transient refresh errors; old reads cannot replace completed actions or form
drafts. Access denial clears related data and private forms; explicit retry starts
a fresh app session. Status uses an allowlist. Account handoff URLs stay outside
retained progress snapshots; storage passwords and API keys remain form-owned.
No controller API, permission, storage setting or schedule changed.

See `docs/read-lifecycle-migration.md` for batch checks and remaining native-image
qualification. No image pins or live installation changed in this source pass.
Project-vault app note/index updates are pending; no vault connector was used.

## Retained development-instance update — 18 September 2026

Only `zotero-sync-test` received `0.5.10-guided.20260918.1` (revision 3).
Its encrypted checkpoint and Apply succeeded. Read-only reconciliation confirmed
the reviewed images, plan, generated Compose and healthy runtime. The operator
stopped before acceptance on its existing `gateway-integration-failed` warning;
no credentials or grants were provisioned to hide it. Personal Zotero remains
unchanged because image-changing updates with its shared folder need a supported
recovery path. See [the deployment record](../../docs/native-candidates-20260918.md#retained-freelove-updates--18-september-2026).
Project-vault documentation remains pending.

## Published image refresh — 18 September 2026

Source candidate `0.5.10-guided.20260918.1` selects changed recipe images
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

## Metadata-only research capability candidate — 15 September 2026

`0.5.10-guided.20260915.1` adds only the missing `research-items` onboarding
declaration (runtime mailbox, 120 seconds, required non-secret `since`/`until`
strings) and the new package identity. Images, Compose, runtime source, data,
variants, permissions and existing actions are unchanged. The recorded installed
editorial package remains revision 22 per core `docs/deployments.md`; this
candidate is not published or deployed.

The existing controller already dispatches `research-items` to the bounded
metadata reader through its authenticated local API (or Web API for the online
variant). It performs GETs on `/users/<id>/items/top`, limits windows to eight
days and scanning to 1,000 recent items, and returns selected bibliographic
fields only. It excludes note/attachment/annotation records and does not return
private note contents, file paths or credentials. It does not invoke attachment
mutation, download, login or sync actions. The action mailbox still has normal
request/response/status bookkeeping; read-only means no research-library writes,
not a promise that the controller never writes runtime files.

n8n already declares this exact grant. Manager discovery intersects that grant
with the target package's declared actions; the missing Zotero declaration,
not absent reader source or a new permission requirement, blocked the reports.
No new n8n grant or token rotation is needed for this metadata declaration.
Obsidian folder access is a separate permission decision.

The prior 9 September instruction to withhold the action until compatible
controller publication is not a claim that every older pin must be rebuilt.
The current selected controller already contains this implementation according
to the source audit. Before deploying this metadata-only update, run the
new isolated pinned-image qualification in
[`qualification/README.md`](qualification/README.md). It requires image/source
byte matches and exercises the actual controller mailbox/API adapter with
synthetic data, including restart, filtering, bounds and GET-only requests.
No image is rebuilt, pulled or replaced by this harness. A mismatch/failure
blocks the metadata-only route; do not relabel it as qualified or change pins
without separate review. The harness has not yet run against Docker in this
pass. It is not real-library, online-Web-API, Manager service-grant, sync or
browser acceptance.

The new source test reuses the same seven synthetic cases as the image harness
and passes locally. `package/research-action.test.mjs` also passes, checking the
precise declaration and both-variant runtime availability; the parent has added
it to the root pretest. The controller source test is picked up by the existing
controller test glob. Harness syntax and focused formatting checks pass, but
the Docker harness has not executed. Source tests are separate from pinned-image
evidence. The parent reports the final full `npm test` passing and has updated
the Zotero project-vault note and app index through Jacob Gateway, retaining
the source-only evidence and pending deployment/approval boundaries. No commit,
publication or deployment occurred in this source pass.

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
“Organise your references and research papers.” Existing tags, unpublished candidate
version and image pins are unchanged. This describes purpose, not setup or new
capabilities. The two canonical font files were also mirrored into vendor.
Vault-note follow-up is pending under this pass's no-remote-changes boundary.

New unpublished source identity `0.5.10-guided.20260913.2.editorial.20260914.1` adds an app-owned
`artwork/editorial.svg` and a locked transparent PNG declaration under
`presentation.editorialIcon`, with separate ScholarServer CC BY 4.0 attribution.
The prior `0.5.10-guided.20260913.1` package identity is not rewritten. Original
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

## Corrected controller image — 13 September 2026

AMD64-only candidate `0.5.10-guided.20260913.1` selects the corrected controller
image `sha256:0ed9f3cd05ec458ab612dee695245d8da6e931a7a1c46cc2bbd075bacaa630b2`,
built natively on Resolution from `eb86267`. Registry configuration, layers,
architecture and source labels match the qualified build. Other images are
unchanged. Actual image HTTP tests verified JS/CSS MIME types and exact bytes,
HEAD, nested routes, health and missing-asset 404s, using an isolated online-mode
runtime. This is not five-service or real-account/sync acceptance: the full
packaging harness lacked the unchanged desktop image locally. Earlier failed
trials were harness file-permission/network errors. No personal profile was used.
Evidence: `/var/lib/scholar-ci-builds/guided-20260913-1/apps-evidence` on Resolution.
Full `npm test` passed on Resolution after installing both the root workspace
and the independently locked Obsidian sync-controller dependencies. The earlier
missing-`tar` failure was an incomplete test workspace, not an image defect.
Official catalog publication, signed installation and account acceptance remain
separate. Project-vault documentation remains pending; no personal vault access.

## Disposable-host correction — 12 September 2026

The user-installed instance on disposable host `599936240` initially had an
`online-library` revision-1 plan. This establishes the saved choice, not what the
user clicked. After explicit approval, Manager changed that existing instance
to `complete-workspace` revision 2 with the same data directories; all five
services are healthy. No personal native profile was used.

The static-handler fix is running as a reversible controller-only read-only
source bind mount on the existing immutable image, not as a newly published app
package. Both Overview and Configuration render through the actual Manager
proxy in fresh Chrome, with no page errors or writes. The configuration screen
offers Connect Zotero account; account connection, sync and MCP acceptance remain
pending. Core `docs/deployments.md` records exact image/source hashes, override
paths, checkpoint and rollback limits. Evidence is locally retained in core
`.dev/zotero-ui-fix-20260912`. The package still needs a new immutable image and
version before this correction is qualified for release. The project-vault note
update remains pending; this pass did not access the personal Obsidian profile.

Full `npm test` passed on Resolution as `scholar-ci` with a 512 MiB JavaScript
heap at 20:18:40–20:19:18 UTC (38 seconds), against `cb393fe` plus the controller
fix and HTTP tests. An earlier harness attempt used `umask 077` and failed a
permission-mode assertion; the unchanged suite passed with normal `022`.
Both attempts remain in the private
`/home/scholar-ci/guided-20260912-1/zotero-static-fulltest.sDfvow` evidence directory.

## Static UI response correction — 12 September 2026

The controller called `stat()` without importing it. Its broad fallback caught
that error and returned `index.html` with HTTP 200 for JavaScript and CSS requests.
The HTML shell could load while the browser rejected its module scripts.

The source now imports `stat`, restricts SPA fallback to extensionless navigation
outside asset paths, and returns 404 for missing asset files and directories.
Other filesystem failures return 503 instead of successful HTML. Relative asset
URLs still resolve from nested app routes. The HTTP handler can be imported for
tests without starting the worker or accessing `/runtime`; direct execution keeps
the existing controller entry point. No additional runtime file is required.

`controller/static-http.test.mjs` runs the production handler on loopback with
disposable HTML/JS/CSS fixtures. It checks MIME types, exact asset bytes, HEAD,
deep routes, missing assets and a missing entry document. This is local HTTP
source evidence, not a built-image, live browser or publication result. The
existing health endpoint checks the setup bridge (or online mode), not UI asset
delivery; a healthy container alone remains insufficient evidence of a usable UI.

Retained/disposable-host qualification and image publication are separate work.
Published manifests and image pins were not changed. The personal-vault note
update remains pending because vault access is outside this task's scope.

## Guided candidate — 12 September 2026

The new controller and relay are now built and native-startup/restart qualified
on Resolution, with new immutable image references selected by AMD64-only package
`0.5.10-guided.20260912.1`. ARM64 is deliberately not advertised by this candidate.
The previous setup checkpoint's source-only publication gate is superseded for
AMD64 image publication, not for browser, account, sync or Gateway acceptance.
See [the candidate record](../../docs/guided-candidate-20260912.md) for exact
provenance and limits. Mac Docker and personal profiles remain untouched.

## Setup boundary checkpoint — 12 September 2026

Both install variants retain a Zotero MCP service. Normal tool requests go from
Gateway through MCP to either the protected Desktop API relay or Zotero's Web
API. The setup controller is not the normal MCP request path.

The relay now has its own minimal entry point instead of importing the entire
controller. The controller image explicitly ships the account-link coordinator
and separated library-action module; source fingerprint inputs cover these files.
Existing attachment/Docling action contracts, worker settings and schedules are
preserved. The plugin's legacy Docling importer has not yet been migrated to
HTTP uploads or n8n; see the focused readability review.

Website login now has a controller-owned persisted session and background
observer. Reloading the page observes the same request. Cancellation cannot
produce a connected message, interrupted starts are not silently replayed, and
public status omits login tokens and URLs. The protected session endpoint can
return the official login URL to resume a pending flow. Internal Zotero login
functions remain a pinned-version compatibility dependency, not a stable public
setup API. Online mode still uses a manually created Web API key; OAuth app
registration and client-credential ownership require a separate decision.

Local approval uses the shared setup panel, with a same-origin desktop view and
separate-tab fallback. No CORS or frame restrictions were weakened. Ongoing
access requires Zotero's remembered grant rather than a single-use Allow. A
failed Desktop/setup probe can no longer be hidden by a stored local key. Setup
completion copy distinguishes saved connection settings from initial sync,
attachment delivery and Gateway acceptance. Reauthorization after revocation
and interrupted authorization still need real-client testing.

Checks: full `npm test` passed (including its explicit platform skips), focused
Zotero/relay tests passed, and all nineteen image recipes validate. A single
isolated browser against source UI and synthetic APIs passed login resume,
cancellation, continuation, denied permission, retry, panel dismissal and
cross-origin fallback. Screenshots are in `.dev/zotero-setup-boundary`; run
`scripts/check-zotero-setup.mjs` with the existing browser-module path to repeat.
These are source and mocked-browser checks, not fresh installation or actual
account/attachment/Gateway acceptance.

Mac Docker stayed stopped. The full suite ran as one command with a 512 MiB
per-process JavaScript heap limit; it includes small TypeScript builds, not
Docker image builds. Swap remained unused in the before/after samples. No
personal native profile, retained server or paid resource was changed.

Publication gate: controller and relay images must be rebuilt, qualified on
native architectures, and selected in a new immutable package version with new
source-lock records. Existing image digests and candidate metadata were not
rewritten to imply that they contain this source. Freelove is unchanged.
The source-lock check was run for both changed recipes and rejected their old
records as stale, as expected. Those records were not regenerated without builds.
The project-vault note update is pending: this pass deliberately did not access
the personal Obsidian profile or vault. The repository guide
`docs/install-options.md` beside this app is authoritative for this checkpoint.

## Image refresh checkpoint — 12 September 2026

Candidate `0.5.10-beta.3` selects five refreshed immutable AMD64/ARM64 images.
The local API bridge now packages all modules imported by its controller. Both
native runs start a real disposable Zotero desktop profile, verify bridge token
permissions and missing/wrong-token rejection, load the UI and retain bridge
identity through restart. The unconnected profile is deliberate. Account/library
sync is not claimed; `research-items` remains withheld from package grants pending
real-library acceptance.

Image publication does not publish the official catalog package or upgrade
Freelove. Exact source revisions, nineteen native image records, test scope and
cleanup are in [the refresh report](../../docs/package-refresh-20260912.md).
Earlier dated entries below describe their own checkpoints.


## 12 September 2026 — bridge image dependency closure

The first rebuilt local API bridge exited before listening with
`ERR_MODULE_NOT_FOUND` for `@scholarserver/controller-runtime`. Its Dockerfile
still copied only `controller.mjs`, although that file now imports the shared
atomic-file helpers, status model and bounded research metadata reader. The
controller image already copied those dependencies; the bridge recipe did not.

The bridge now includes the same imported modules without changing its command,
user, API boundary or data mounts. A recipe regression covers both entry points.
New native image and startup results belong to the package-build audit; the
first failed image is not qualified or published as the package update.

## Read-only research metadata — 9 September 2026

The controller has a candidate `research-items` action for n8n reading notes and
digests. It uses the existing authenticated personal-library API, not a database
reader. It bounds the date window to eight days and scans at most 1,000 recent
top-level items; an incomplete result fails rather than silently truncating.
Only keys, titles, creators, dates, DOI and Zotero links are returned. Notes,
attachment content, paths and credentials are not exported by this action.

Source tests verify filtering, bounds and field selection. Native n8n tests use
synthetic responses; the actual local/Web API action still needs acceptance.
Its package declaration is intentionally withheld until a new compatible
controller image/version is published. See `apps/n8n/RESEARCH_WORKFLOWS.md`.
Live 0.4.2 remains connected in linked-folder mode and was not upgraded. The old
automation worker, settings, schedules and history are unchanged.

## Catalog tags — 11 September 2026

The package manifest now declares the app-owned `References`, `Notes`,
`Documents` and `Files` tags under `presentation.details.tags`. The metadata-only
source candidate is `0.5.10-beta.2`; existing images, requirements and
runtime/security settings are unchanged. No package was published or deployed.
The Obsidian project-vault note was updated through Jacob Gateway on 11
September 2026; this repository's catalog-tags document remains authoritative
for the exact vocabulary.
