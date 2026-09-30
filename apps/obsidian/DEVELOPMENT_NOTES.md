# Obsidian development notes

## Paid Sync account progress after restart — 30 September 2026

Updating the retained paid Sync instance reproduced a return to Account even
though the downloaded client, saved account configuration and a read-only remote
vault listing still worked. Startup restored completed enrollment but discarded
the completed account step before enrollment. The native configuration route
then displayed that reset state without invoking the legacy status reconciler.

Startup now resumes only a saved official `vault-selection-required` state when
the approved client is installed. It does not treat saved ready/initial-sync
labels as completed enrollment, replay credentials or discard the vault binding.
Remote vault reads have a 15-second deadline. A failed native configuration read
returns a failure so Manager keeps its accepted form/draft, and the status reader
does not reset account progress after an observation failure.

Source regression tests and the full apps suite/lint pass. The native final-image
harness now seeds synthetic completed-account progress in its own disposable
runtime, restarts the controller and verifies an unavailable vault listing does
not erase that step or manufacture enrollment. Native qualification is required
before selecting a new immutable image/package. The retained instance's supported
read-only status reconciliation restored Choose vault without submitting any
password or retrying vault setup. A real paid-account download/device roundtrip
still requires the owner to finish the encrypted vault connection. The project
vault note/index update remains pending; no vault connector was used.

## Manager LiveSync status parity — 27 September 2026

The isolated LiveSync installation's Manager Configuration tab reported
"Not confirmed running" while the app overview reported its LiveSync worker
running. The configuration summary read the official Sync worker flag, which
remains false for the LiveSync profile. It now selects the LiveSync worker's
reported running state for that profile and retains the official worker flag
for Obsidian Sync. Focused tests cover both running paths and a stopped
LiveSync worker. The full apps source suite passes. Native multi-platform
[run 36342991675](https://github.com/Jacob-Stokes/scholarserver-apps/actions/runs/36342991675)
passed for source `aa70ab6a09a8103bd2f4bd8ecfc7bf6d5251d032`. Its Obsidian
sync image index is
`sha256:c7c52f75a26eb9c30bb7176433eba0a37ded63dd1fbccb854bcf57c6cf99f772`;
the published AMD64 and ARM64 config digests match the native build receipts.
Package candidate `0.5.1-private-origin.20260927.3` selects that image and
includes the earlier explicit LiveSync mode fix. The other service images,
data, endpoints and permissions remain unchanged. Apps tests, lint, the selected
source lock and paired core check pass. The earlier `.2` candidate was imported
but never applied; installation and browser acceptance of `.3` remain separate.

## LiveSync 1.0 continuous mode — 27 September 2026

The isolated Docker Obsidian desktop joined the second Freelove instance from
the encrypted device link. LiveSync 1.0.32 imported the legacy event flags but
showed **On events** with every event trigger off. A server note reached the
desktop only after a manual sync. Selecting **LiveSync** mode in that test vault
then delivered a new server note automatically, and a desktop edit returned to
the server automatically. A synthetic PNG also replicated in both directions
with matching SHA-256 bytes. The original desktop vault and server instance were
not changed.

New setup links now declare `syncMode: "LIVESYNC"` explicitly. The upstream
codec round-trip test checks that the field survives in the device link, and the
full apps source suite passes with local loopback permission. The currently
installed immutable package predates this fix; the successful desktop test used
a manual mode correction. Package update and fresh-link browser acceptance
remain separate work. The project-vault note write is still pending.

Native [run 36338619912](https://github.com/Jacob-Stokes/scholarserver-apps/actions/runs/36338619912)
then passed both architectures' builds, named native and broader app gates, and
all multi-platform manifest jobs for source `16856b3785462ec6f9e4c58142d1f92d2c927c38`.
The Obsidian sync index is
`sha256:933f7ae2ab1f07799f6b9168be8cd4b1c3ef1d028c85c08312257567ec2f3de3`;
its ARM64 and AMD64 image config digests match the downloaded receipts and both
record source digest
`sha256:18777820ae82fa364750c265195e3bb649168de9ab992d7298a0e5375f05c4e1`.
Package candidate `0.5.1-private-origin.20260927.2` selects only the new sync
image; other service pins, permissions, variants and data declarations remain
unchanged. This candidate is not yet installed and does not qualify a fresh
desktop link by itself.

## Native Manager configuration source — 25 September 2026

The new optional `ui.configuration` section is implemented by the existing sync
controller; the standalone UI and routes remain available. It covers the installed
official Sync and self-hosted LiveSync setup states, including first-device setup
and recovery. The LiveSync section offers only the package-declared private
Tailscale endpoint; Manager's endpoint picker supplies its selected URL to an
untouched draft. The setup URI and passphrase remain separate explicit no-store
text outputs, not ordinary section values, receipts or clickable custom links.
The 27 September standalone fix now follows the same private-only endpoint
contract. Neither setup surface offers unsupported public CouchDB access. Existing public-backed
installations retain their saved state and ready summary without reconfiguration.
Connected status summarizes the reported vault and scope but does not claim a
supported in-place vault edit. A background observer reconciles the server-joining
step without relying on a browser tab. The app receipt is persisted before action
execution, and a failed post-action section read cannot change a confirmed result
into a rejected write.

Focused configuration/helper tests pass, including secret-free reload and no
replay, and the full apps source suite passes with local loopback permission.
Synthetic descriptors pass the core parser/manifest checker; this is not a rebuilt
image, installed-package update, first-device browser acceptance or a new desktop
sync roundtrip. Existing image pins were not changed here. The project-vault app
note/index update remains pending because no vault connector was used in this pass.

## Completed setup presentation — 24 September 2026

Configuration now shows the saved sync method, vault when reported, AI-accessible
folder and server-sync state instead of setup progress and a repeated success
banner. The existing LiveSync warning and reported errors remain visible, and a
connection check is available. The current app API does not provide a supported
post-setup vault/scope edit or reset action; none was added. UI typecheck, build,
focused source tests and synthetic Chrome ready/setup/recovery scenarios pass.
The project-vault app note/index update is pending and was not attempted here.
## Private LiveSync setup repair — 27 September 2026

The UI now obtains and saves the package-declared `livesync-couchdb` endpoint
through Manager's authenticated access-options API. It accepts only the saved
private origin, rejects Manager/path/public/stale addresses, and rechecks before
initial setup. The unsupported public choice and guessed port 8443 are removed.
Device credentials remain confined to the mounted step and are withheld when
the onboarding address differs from the saved route. The existing-server/join
instructions explicitly prohibit resetting the already-provisioned database.

Pending-device repair uses the upstream codec to reissue only the device link,
preserving the database, client credentials, vault encryption and disabled worker.
It checks the vault binding and rejects completed setup, active workers, missing
records and database mismatches. Same-address reconciliation does not rotate a
second password. Atomic onboarding then enrollment writes permit reconciliation
after a lost response; this is not native restart acceptance.

Full `npm test`, Obsidian UI typecheck/build and twelve focused checks passed on
the operator Mac. Codex's in-app browser exercised a synthetic private connection,
missing-route repair, corrected instructions and unchecked confirmation. No
separate Chrome session was opened. The native build workflow checks a 30 GiB
projected peak against a vendored copy of the core disk-budget guard before image
assembly. The first run stopped before builds because its job token could not
read the private core repository; the guard is now local to this repository.
Native-image, package and real-device acceptance remain separate gates. The first
core GitHub workflow did not start because GitHub reported failed account payments
or a spending limit; the established capped Resolution builder was used instead.

Live read-only checks found the installed `0.5.0-beta.1` endpoint is private-only
without `remoteAccess.routing: origin`; the executor rejects it with 422. Its
LiveSync variant also includes the excluded `official-client` dataset. Do not
edit that immutable package or bypass update recovery. The owner selected a second
isolated test instance, preserving the current instance and desktop profile.
Core also needs the installation-owned origin readiness fix: host Tailscale
reports a Serve conflict while installation Tailscale is ready.

## Private-origin image and package candidate — 27 September 2026

[Native workflow 36330019301](https://github.com/Jacob-Stokes/scholarserver-apps/actions/runs/36330019301)
passed both architecture builds, named native gates and immutable index publication
from source `d5b91a06975bd73b57471058a8d5d9c9934a16aa`. The Obsidian sync
index is `sha256:cefab4518ac4f5ca41bd33b73279bec81b0a94878703bc46676dfe0560de8870`;
its AMD64 and ARM64 config digests match the downloaded build receipts. The new
`0.5.1-private-origin.20260927.1` candidate changes only the sync image pin and
package version. Its Obsidian source-lock record matches the tested recipe;
six unrelated recipe locks remain stale and are outside this package candidate.

The full apps source suite, Obsidian package contract and selected recipe lock
passed. The currently installed `personal/obsidian` remains on `0.5.0-beta.1`;
the new package is intended for a second isolated instance, not an in-place
update of that excluded-dataset installation. Real private-origin provisioning,
desktop plugin setup, two-way note and attachment sync, restart recovery and AI
readback remain separate acceptance gates. No real setup credentials are in this
note.

Project-vault note and index writes were rejected by automatic approval review
because destination ownership and authorization were not established. The owner
has been asked to approve those exact notes; the documentation update is pending.
No real setup URI, password, vault content or credential is included in evidence.

## Loading deployment and vault-documentation checkpoint — 21 September 2026

The core at commit `62e6d5c650a3b663eede67772e3123f19d74df71` is deployed and
accepted. The imported package `0.5.0-guided.20260921.1` was applied to
`personal/obsidian` revision 19 and `personal/obsidian-dev` revision 4.
Automated exact-grants, runtime and private-data checks pass; exact images were
healthy and data bindings, grants and unrelated state were preserved. Browser
acceptance for `personal/obsidian` is limited: it reports
Recovery Needed. Saved enrollment remains the official default with no profile;
the installed variant is self-hosted LiveSync both before and after, and the
pre-update enrollment mtime was `1787940277`. The restore mismatch guard is
unchanged between the older qualified source
`3b90bb773159202103b989cd43d9642eb226a1b6` and current source
`378305b3d5eaf23bde4eddcf6b1fe5f6957333dc`; this is an older configuration
mismatch, not a repaired or migrated enrollment.

`personal/obsidian-dev` was ready before its update with a LiveSync profile and
now reports Connected and server running. Its retained
`gateway-integration-failed` warning remains; it was not hidden or repaired by
this package update. The existing shared writable-vault recovery boundary
remains in force.

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

## Image qualification preparation — 21 September 2026

The status-presentation helper is now included in the image source fingerprint.
A regression requires both fingerprint coverage and its Dockerfile copy.
The native packaging gate now checks the separate no-store device credential
endpoint across setup phases and rejects credential fields in ordinary responses.
Source tests pass; execution of these added container checks is pending the batch
workflow. No installed vault, package pin or permission was changed. Project-vault
documentation remains pending.

## Local read-lifecycle migration — 20 September 2026

Informational status now uses the canonical shared read lifecycle and reserved
feedback, retaining accepted data on ordinary refresh failure. Drafts remain
app-owned. Polling and writes no longer compete to replace current setup status;
access loss clears private forms and requires a fresh session on explicit retry.

LiveSync device credentials have a separate no-store browser read at
`/api/livesync/onboarding`. It checks the saved binding and device-setup phase,
and discards a result if state changes during the read. Status, action responses
and persisted public state exclude the onboarding credentials. The mounted
device panel requests them on demand, drops late responses after navigation and
does not retain them across configuration visits or in browser storage. Normal
status parsing also excludes legacy credential fields. Existing secret files,
vault binding, permissions and setup mutations are unchanged.

The controller and UI must ship together in a newly qualified native image.
The Dockerfile includes the new presentation helper. No existing package or
image pins were changed and Freelove is untouched. See the repository
`docs/read-lifecycle-migration.md` for verification and resume steps.
Project-vault app note/index update remains pending; no vault connector was used.

## Retained deployment — 18 September 2026

`0.5.0-guided.20260918.1` is installed on Freelove's personal instance (revision
18) and isolated development instance (revision 3). Personal-instance operator
runtime verification passed without reconfiguring its vault. The development
instance is healthy and its Configuration still reports Connected; automatic
acceptance stopped because updating it recreated its own existing private-access
proxy. A read-only comparison found unchanged actual proxy image, mounts,
HostConfig and networks; autogenerated hostname and Compose bookkeeping changed.
Its existing AI integration warning remains. Do not treat this as a clean automatic
acceptance or grant folder access to conceal the warning. No new live sync roundtrip
was performed. See [the deployment record](../../docs/native-candidates-20260918.md#retained-freelove-updates--18-september-2026).
Project-vault documentation remains pending.

## Published image refresh — 18 September 2026

Source candidate `0.5.0-guided.20260918.1` selects changed recipe images
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

## Native vault-binding candidate qualification — 17 September 2026

The owner-approved capped ARM64 build on Freelove produced sync candidate
`sha256:82fa290d68525f5ee9d5f5178098a5daa5a504e1b720bf68e00f63cf3e980f6b`
from exact apps source `c81a3bedce44243a6c4327fdc2d93abc99da3fb6`, with recipe
fingerprint `sha256:be7c7b91d543d041b5f2369323e8977385c914c29e8f0de356f0193f0d6a419e`.
It is a local image, not a published registry digest or live package update.
Other Obsidian services reused their unchanged qualified ARM64 images.

All 75 binding tests pass against the packaged module/controller. The first run
passed 74 but lacked the Dockerfile fixture for its source-inventory assertion;
mounting that build metadata read-only made the complete rerun pass. This did not
replace runtime files in the candidate. Full native checks passed official-client
consent/download/integrity, non-root native SQLite, restart, legacy enrollment
adoption and unchanged saved binding. API/MCP note operations also passed.

A separate disposable LiveSync installation rejected repeated setup without
changing enrollment or binding. Two independent LiveSync peers replicated a note
to the server and a server research note back to the peer; the worker resumed
after restart. This is real protocol replication with synthetic data, not a new
desktop/account test or acceptance against a personal vault.

The harness now accepts explicit image-ID overrides, avoiding global review-tag
changes. Full apps source tests passed on Resolution. Evidence is under Freelove's
`/var/lib/scholarserver-upgrades/connections-native-20260917/`, particularly
`packaged-vault-binding-tests-rerun.log` and `obsidian-native-tests.log`.
No live vault or grants were changed. Publication, new immutable package metadata,
selected-instance update and authenticated Manager acceptance remain pending.

## One vault per installation — 17 September 2026

The setup controller now reserves `/runtime/vault-binding.json` before either
sync method can select/provision a vault. This app-owned identity is separate
from Manager's source-instance/action approvals. It does not grant or revoke
access. Another vault requires a separate installation and permission review;
there is no in-place vault replacement operation in this candidate.

Existing valid enrollment is adopted without changing enrollment, sync settings,
credentials or vault contents. The record survives restart. Malformed, unreadable
or symlinked records, a changed identity and orphaned vault/LiveSync state fail
closed. A nonempty vault without enrollment is recovery-needed, not a fresh vault.
Folder browsing and research-note creation recheck the saved identity.
Only the worker's exact pristine waiting status is allowed before first setup;
a revision, previous start, error, worker configuration or onboarding record is
not evidence of an empty installation. Independent review caught this startup
distinction before image qualification.

Official setup accepts IDs from the current account's structured vault list and
may retry an incomplete pull only for its reserved ID. Completed setup cannot be
rerun. Interrupted LiveSync provisioning cannot be blindly replayed: it enters
recovery, retaining all records/data. Restore the original connection records and
restart to recover; there is no automatic reset or replacement-database fallback.
New initial setup requires an empty managed replica. Restoring/moving an existing
replica must keep its enrollment and binding, rather than repointing old data.

Focused filesystem tests include exclusive concurrent reservation, restart,
legacy adoption, missing/corrupt records, symlinks, permission errors and identity
replacement. A regression caught explicit null profile being mistaken for an
omitted legacy profile; only an omitted field now permits that compatibility.
The container acceptance script uses separate official/LiveSync installations
and checks repeated LiveSync setup is rejected with unchanged records. The UI
fixture covers the recovery panel on mobile and after reload. Those harnesses
must pass against the rebuilt image/UI before claiming runtime acceptance.

Source-image inventory and Dockerfile include the new module. Existing package
versions, image pins and source-lock records remain unchanged pending native
qualification. No live vault, grant or schedule is changed by this source pass.
All 75 focused checks and full apps tests pass on native Linux on Resolution;
all production app builds and the synthetic multi-app browser suite pass.
The new mobile recovery panel was visually inspected. These are not native
container or live-vault acceptance. Exact logs and build/deployment status are
recorded in core's `docs/testing/application-connections-20260917.md`.
The project-vault app note and index were updated through Jacob Gateway with
these source/browser results and the remaining image/deployment gates.

## Isolated LiveSync acceptance — 16 September 2026

`personal/obsidian-dev` on Freelove now reports ready, with the dedicated Mac
Docker desktop `scholarserver-dev` connected through the private Tailscale
endpoint. Actual server-created note delivery and desktop-edited return sync
passed. Owner folder browsing and create-only retry preservation also passed.
See `docs/desktop-testing-acceptance.md` and core `docs/deployments.md` for exact
evidence and retained test data. No personal vault, n8n approval or schedule was
changed; automation execution and full restart/restore recovery remain untested.

The upstream 1.0.28 first-device reset option attempts database DELETE even when
ScholarServer has already provisioned the database. The vault-scoped account
correctly received 401. Do not grant administrator rights to accommodate this
path. Recovery used the existing database: trash the test-only rebuild marker,
select LiveSync mode and reload the plugin. This recovered session is not a
clean beginner setup proof. Update the app-owned first-device guidance and test
the correct existing-server path before qualifying a new onboarding release.

Manager returned HTTP 500 after Configure LiveSync had already prepared the
connection. Its optional AI registration conflicts with the personal instance's
namespace; this is a suspected cause, not a captured exception. Reconcile the
app state before any retry. Keep app action completion distinct from optional
Gateway activation so the UI does not invite replay of a completed mutation.

The Obsidian project-vault note and app index were updated through Jacob Gateway
with these runtime results and remaining limits. No credentials or note contents
were included in that documentation update.

## Multiple LiveSync instances — 15 September 2026

Fresh `personal/obsidian-dev` installation of private-origin candidate `.3`
exposed a DNS collision. Its controller joins both its private instance network
and the shared edge; `livesync-couchdb` resolved the existing personal instance's
edge address, which correctly rejected the new credentials with HTTP 403.
A disposable dual-network Node probe reproduced the wrong generic address and
the correct instance-qualified container address. Existing data was untouched.

Candidate `.4` supplies workspace/instance identities and a matching private
database alias. The controller uses that address for bootstrap, provisioning and
worker configuration. Standalone fixtures without either identity retain their
private service name; partial/invalid identities fail closed. Authentication and
403 handling are unchanged. Tests cover address selection and package wiring.
The rebuilt ARM64 sync image and native two-instance startup/restart regression
passed; `.4` now selects its immutable published digest (see RELEASE_BLOCKED.md).
Freelove's original operation failed and rolled back its containers, preserving
data. A separately reviewed revision 2 succeeded with all five services healthy.
The existing personal instance and other container identities stayed unchanged.
At that checkpoint the new vault remained setup-required because managed
Tailscale was logged out. The 16 September acceptance above supersedes that
blocker and verifies the private endpoint and actual desktop sync. No new
per-vault n8n approval has been applied.

## Per-instance approval contract — 15 September 2026

The existing unpublished `0.5.0-guided.20260915.1` candidate now declares
`requireInstanceApproval: true` only on the app-owned `browse-folders` action.
Its runtime mailbox, input fields, other actions, version and image pins are
unchanged. The optional core manifest boolean defaults to false when omitted;
the declaration is not a grant or evidence of runtime enforcement. Manager
persisted approvals and enforcement remain a separate parent-owned change and
a release gate, alongside the existing image and mount-projection gates.
The package regression checks the exact action and that no other action opts in.
The project-vault documentation follow-up remains pending under this scoped pass.

## Guided package candidate — 15 September 2026

Unpublished `0.5.0-guided.20260915.1` declares `browse-folders` and
`create-research-note` and removes `official-client` **only** from the
`self-hosted-livesync` variant's data selection. The six existing LiveSync
datasets, global data declarations, official Sync variant, Compose mounts,
permissions and all image pins remain unchanged. The old sync pin does not
contain the new folder reader: this package is a pending source candidate,
not an installable/qualified update. Rebuild and qualify the sync image before
selecting its immutable digest in the manifest and Compose.

The parent is implementing generic core variant dataset-mount selection in a
separate pass. This candidate requires that change in both validation/planning
and executor rendering. `package/variants.test.mjs` checks the exact six-dataset
contract and official cache preservation, and specifies that only the
`sync:official-client` mount is inactive for LiveSync, while none are inactive
for official Sync. These are package-side regression expectations, not proof
of core projection or an installed update. The core worker must prove actual
both-variant render/update behaviour; select the supported platform minimum
once that change is qualified. No workaround weakens excluded-cache recovery.

Parent-reported native ARM64 source acceptance now passes all eight tests:
seven folder-reader checks and the existing create-only note test. The fixture
used a cached Node 24 integration image, network none, non-root/read-only,
no capabilities, a read-only temporary source mount and a 16 MiB tmpfs.
No user data was mounted; the container and exact temporary directory were
removed and absence verified. This supersedes the earlier macOS skips for
native filesystem source coverage only, not built Obsidian-image acceptance.
The parent has also added the reader to the source inventory and the reader
and package variant tests to the root pretest. All four package variant/action
checks pass locally; the parent independently reports all five new cross-app
package tests and the final full `npm test` passing. The parent updated the
Obsidian project-vault note and app index through Jacob Gateway with these
source/native-filesystem boundaries and pending deployment/approval gates.
No commit, publication or live update occurred in this source pass.

## Research folder browsing source — 15 September 2026

The sync controller now handles `browse-folders` through the existing protected
`runtime` action mailbox, only when the vault connection is ready. There is no
new HTTP route, credential, network permission or arbitrary filesystem root.
It browses the configured `/vault` mount, matching `create-research-note`; the
separate MCP `scopePath` is not the research-action root. User approval must
describe vault-folder visibility, not imply that this grant is MCP-scope-limited.
The reader returns only `{path,parent,folders:[{name,path}]}`. Root is `""` with
`parent: null`; a top-level folder has `parent: ""`. It never returns note files
or contents and does not create missing directories. Paths are at most 200
characters; hidden/control-character/backslash/parent paths are rejected, and
unselectable directory names are omitted. It streams one directory, failing
rather than returning a partial listing above 2,000 entries or 250 subfolders.
Linux `O_NOFOLLOW` directory descriptors prevent symlink replacement from
redirecting traversal/enumeration. Errors omit server filesystem paths and do
not replace persisted sync status. Queue request/response housekeeping remains
the existing controller-owned transport, not a vault write.

`sync/vault-folders.test.mjs` covers path validation, root/nested responses,
hidden files, symlink rejection/replacement, listing limits, unchanged vault
contents and image/mailbox wiring. On the operator Mac, validation/wiring and
existing CouchDB request checks passed (7 tests); the five new Linux filesystem
tests and existing Linux note-write test skipped. Controller syntax passed.
This is not native Linux, final-image, Manager discovery or sync acceptance.
Docker was stopped; no daemon, remote host or live app was changed. Run the
new test file and `sync/research-note.test.mjs` on native Linux before qualification.

The parent-owned reader source-inventory and root-test entries are now added,
as recorded above. The Dockerfile includes the new module. Do not refresh
image-source lock records without rebuilding/qualification.

Neither research action is added to the previously imported immutable package.
The new pending source candidate declares the following `onboarding.actions`;
these must be paired with a newly built and qualified sync image before use:

```yaml
- id: browse-folders
  data: runtime
  timeoutSeconds: 10
  requireInstanceApproval: true
  fields:
    - { id: path, type: string, secret: false, required: false }
- id: create-research-note
  data: runtime
  timeoutSeconds: 30
  fields:
    - { id: folder, type: string, secret: false, required: true }
    - { id: filename, type: string, secret: false, required: true }
    - { id: content, type: string, secret: true, required: true }
```

The parent's new n8n candidate adds `browse-folders` beside `create-research-note`
in `permissions.applicationActions` for `org.scholarserver.obsidian`.
That is **new access requiring explicit user approval**;
the previously approved Zotero `research-items` and Obsidian note-create grants
do not authorize folder enumeration. Existing Manager identities obtain grants
from the installed source package on each authentication, so a valid existing
identity does not need token rotation merely for this grant change. Installing
the target action declarations alone is not sufficient: Manager discovery uses
the intersection of n8n grants and target declarations in the same workspace.

### LiveSync update depends on core mount projection

Core `docs/deployments.md` records `personal/obsidian` at 0.4.6, revision 16;
the imported `0.5.0-beta.4.editorial.20260914.1` candidate did not apply. Its
LiveSync data selection unnecessarily includes the excluded `official-client`
cache. All six installed data directories must remain in place.

Removing that data entry alone is invalid on the recorded installed core:
shared Compose service `sync` still references
`${SCHOLARSERVER_DATA_OFFICIAL_CLIENT}`. Its `renderCompose` removes inactive
services, not inactive mounts, and rejects that unresolved placeholder.
Both variants must include the one service owning `ui.endpoint` (`sync`), so a
simple second variant-specific controller service cannot replace it under the
current contract. No speculative Compose condition or backup-policy change was
made. Do not relabel excluded cache data as reproducible, move it into another
dataset, or remove the official variant's persistent mount to bypass recovery.

The parent-owned mount-selection/platform change (including validation and
both-variant render/update tests) is required before deploying this candidate's
narrowed LiveSync selection. Qualify the new package against the unchanged
six-dataset installed layout and preserve official Sync cache/consent/recovery.
Only the source package version/declarations/selection have advanced; no image
digest, installed package or published artifact was changed.

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
“Connect your notes in a Markdown vault.” Existing tags, unpublished candidate
version and image pins are unchanged. This describes purpose, not setup or new
capabilities. The two canonical font files were also mirrored into vendor.
Vault-note follow-up is pending under this pass's no-remote-changes boundary.

New unpublished source identity `0.5.0-beta.4.editorial.20260914.1` adds an app-owned
`artwork/editorial.svg` and a locked transparent PNG declaration under
`presentation.editorialIcon`, with separate ScholarServer CC BY 4.0 attribution.
The prior `0.5.0-beta.3` package identity is not rewritten. Original
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

Candidate `0.5.0-beta.3` selects five refreshed immutable AMD64/ARM64 images.
The sync controller fixes a demonstrated CouchDB administrator-bootstrap race:
only initial authenticated `GET /_up` retries a transient 401, with a bounded
budget. Both architectures pass explicit-consent client download/integrity,
non-root CLI/native SQLite, restart and legacy-layout preservation, MCP note
write/edit/read and real independent two-peer LiveSync replication. This is not
an actual desktop-plugin or paid-account test. Authenticated migration, official
account sync, compatible platform minimum and Manager backup/restore remain gates.

Image publication does not publish the official catalog package or upgrade
Freelove. Exact source revisions, nineteen native image records, test scope and
cleanup are in [the refresh report](../../docs/package-refresh-20260912.md).
Earlier dated entries below describe their own checkpoints.


## Fresh CouchDB readiness — 12 September 2026

Native fresh-install testing reproduced an admin-bootstrap race: CouchDB briefly
returned 401 to authenticated `/_up`, then completed creation of its admin
account. The controller treated the first response as permanent and exited
before its setup UI could start. A delayed-controller fixture passed with the
same images and credentials, isolating startup ordering rather than the worker.

Only the initial authenticated GET `/_up` may now retry 401 within the existing
24-attempt window. It never falls back to unauthenticated access; persistent 401,
403, configuration failures and mutation failures retain their errors. Unit tests
cover transient and exhausted startup retries and immediate ordinary failures.
The HTTP helper is included explicitly in the image recipe and source inventory.
Native image/replication qualification is recorded in the package refresh report;
real-account and device acceptance remain separate gates.

## Completion feedback — 11 September 2026

The shared frame displays completion notices as dismissible, expiring toasts.
Clipboard copy clears the prior notice before the awaited write, allowing the
same successful copy to be announced again. Vault, sync and setup operations are
unchanged. Full apps tests and UI builds pass; shared-frame browser checks use
synthetic completions, not a new device-sync test. No package was published or
deployed. The project-vault documentation update remains pending.

## Create-only research notes — 9 September 2026

The controller has a candidate `create-research-note` action for the n8n research
templates. It requires a connected vault, limits filenames to stable Zotero keys
or dated digests, rejects hidden/parent paths, and writes at most 256 KiB. Linux
directory descriptors and an exclusive hard-link publication prevent symlink
redirection and overwriting existing notes, including concurrent creates.

Native Linux tests pass for duplicate/concurrent writes and symlink rejection.
Native n8n fixture execution created real notes through the same writer. This is
not official Sync/LiveSync propagation or a published controller image. The
currently pinned package deliberately does not advertise the action; add its
declaration only with a new compatible image/version. Exact declaration and gates
are in `apps/n8n/RESEARCH_WORKFLOWS.md`. Do not upgrade the live official-sync
installation to unrelated development setup changes without compatibility checks.

A crash can leave a hidden staging file; future cleanup should identify only
owned stale staging files and never treat them as complete notes. Failed folder
sync and queue interruption need additional live acceptance.

## Setup status ownership — 8 September 2026

A delayed pre-install status poll could replace the status returned after client
installation and reset an edited folder scope to `/`. The synthetic browser
regression reproduced that failure against the old build.

Only the current status request may update the screen. Explicit refresh supersedes
an older request, routine polls do not overlap, and unmount cancels pending reads.
Reads time out after 15 seconds. Edited folder scope remains a user-owned draft,
separate from polled server state. Installation now uses the operation wrapper's
single refresh rather than refreshing twice.

An unreadable successful HTTP response is an error rather than a successful null
result. These changes do not alter sync processes, stored credentials or vault
contents, and do not automatically retry writes.

Verification: source tests, production UI build and the four-app mock-browser suite
passed, including a held old poll released after installation and scope editing.
This is not device-to-server sync acceptance or a published package. Remaining
mutation lifetimes and the wider setup component still need separate review.

## Catalog tags — 11 September 2026

The package manifest now declares the app-owned `Notes`, `Vaults` and `Sync` tags
under `presentation.details.tags`. The metadata-only source candidate is
`0.5.0-beta.2`; existing images, requirements and runtime/security settings are
unchanged. No package was published or deployed. The Obsidian project-vault
note was updated through Jacob Gateway on 11 September 2026; this repository's
catalog-tags document remains authoritative for the exact vocabulary.
# ARM64 native research checkpoint — 15 September 2026

Development package `0.5.0-guided.20260915.2` now pins five native ARM64 images
from apps source `2a8cde7`, including the per-vault folder reader. Native official
client and LiveSync checks passed; AMD64, paid-account and actual desktop-plugin
acceptance are not claimed. See [the scoped report](../../docs/native-research-candidates-20260915.md)
and the remaining release gate in `RELEASE_BLOCKED.md`. The project vault note
update is pending because Jacob Gateway note reads timed out.


## Manager configuration source pass — 29 September 2026

Pending first-device address repair now has a native Manager draft/action. It preserves the existing database and encryption, invalidates old revealed outputs by revision, and requires fresh device confirmation. Setup URI/passphrase remain explicit sensitive reads. New installed UI routes return Configuration and obsolete Overview bookmarks to Manager.

Full apps tests, lint and all local builds passed. App-generated Manager previews
were inspected in Codex's in-app browser at desktop and phone widths. This is
source and synthetic-browser evidence, not publication, native container
qualification or live deployment. See [the paired pass and remaining gates](../../docs/manager-configuration-20260929.md).

Project-vault documentation update is pending this source checkpoint.

A subsequent parity review retained failure information previously visible only
on the standalone screen: active sync/download errors and download progress in
Obsidian, worker errors in FreshRSS, and linked-folder automation warnings in
Zotero. The five added synthetic states also exercise these in Manager.

## Standalone form removal — 29 September 2026

Removed the retired standalone overview, setup forms and their credential/status readers. Installed bookmarks hand off to Manager before React mounts; an unprefixed development URL has only a Manager link. The controller, LiveSync services and consent-controlled official-client setup remain unchanged.

Full source tests, lint and all local builds passed. The in-app browser checked configuration handoffs and retained workspace success/failure states using synthetic data. See [the cleanup scope and evidence](../../docs/manager-workspace-cleanup-20260929.md). Native replacement images and new immutable package versions are still required; this pass did not update installed packages. The project-vault note remains pending the existing external-write approval.

## Official Sync password failure and recovery — 29 September 2026

Manager-native setup previously converted every post-dispatch exception into an
unconfirmed receipt and discarded the classified error. A recognised wrong or
missing vault encryption password now persists a sanitised rejection that permits
a corrected request. Generic client/transport failures remain uncertain. Account
MFA copy explicitly separates the authenticator code from the later vault password.

Legacy unconfirmed connect-vault requests can be reconciled using read-only local
client inspection only while idle, with no enrollment, an empty replica and no
configured local vault. The durable same-vault reservation remains unchanged.
Incomplete pulls, existing configuration/data, failed observations and other sync
methods cannot use this recovery. No secrets or raw client output enter receipts.

Source tests cover password classification, unknown failure, restart, corrected
request, duplicate identity and blocked reconciliation cases. Manager's synthetic
browser test separately covers saved-step transitions and correction while retaining
the vault/folder. Native replacement qualification and real paid-account completion
remain required. The new rejected outcome requires the paired Manager update;
no immutable package version/digest was changed in this pass. Project-vault update
remains pending the previously requested external-write approval.


## Primary-purpose catalog tag — 29 September 2026

Reduced catalog tags to `Notes`. Feature and implementation labels belong
in the description, not catalog filters. Reserved a new `.20260929.2` source
package identity; published packages and installed instances remain unchanged.
Replacement image qualification and package publication remain separate gates.
Project-vault documentation remains pending the existing external-write approval.

## Official Sync account-step recovery after interrupted vault setup — 29 September 2026

On the retained `obsidian-2` installation, the approved `.2` package was installed,
but the earlier uncertain `connect-vault` receipt remained unresolved. The official
client's remote-vault listing returned setup to the account step after a restart.
The reconciler only admitted `vault-selection-required`, so Manager disabled the
account form and the user could not sign in again. Read-only host inspection found
no enrollment, an empty local replica and no local configured vaults; the prior
same-vault reservation remains. The reason the remote listing failed is not proven.

The controller now admits `setup-required` to the same read-only reconciliation
check. It still requires an idle controller, official profile, uncertain vault
receipt, no enrollment, empty replica and no local configured vaults. A terminal
rejection at that step instructs the user to sign in again and retry the reserved
vault. The retry path still checks the saved binding before another vault can be
selected. It does not replay the uncertain command or modify paid Sync data.

Source tests cover the account-step acceptance and the existing refusal cases.
The source fingerprint now includes `official-failure.mjs`, which the sync image
copies at runtime. Full source tests, lint and fixed-inventory validation passed
at `52c41d7`. Native run 36606496329 passed both architecture and development
gates, then published the multi-architecture sync index
`sha256:51a56d0a17739d5cedecf78c1305ccf2c408a0587c0acf7dce40630d9eb76a7b`.
Its AMD64 and ARM64 configuration digests, root filesystems, source revision and
source fingerprint match the native receipts. The `.3` package and Compose now
select this immutable image; all 19 current source-lock records pass. Full app
tests, lint and core catalog validation passed after the pin. Publication and
package-source qualification do not establish an installed update.

The retained `.2` instance recovered without this new image: a later supported
remote-vault read succeeded, and status returned to `vault-selection-required`.
Manager's existing Check request action then rejected the old uncertain receipt
without replaying the connection. The authenticated in-app browser showed
editable vault, encryption-password and folder fields. The user is completing
paid-account setup on that instance, so no package update should interrupt it.
This proves form recovery, not the cause of the earlier listing failure or paid
Sync completion. Project-vault documentation remains pending the existing
external-write approval.

## Qualified account-step restart correction — 30 September 2026

Native run 36649032006 at `d87c657a9533e5f05cb464ceb94e28c1319fbaea`
passed both architecture gates, including synthetic saved-account restart and
failed-read draft preservation. Registry config digests, root filesystem IDs,
source labels and fingerprints match the tested receipts for both platforms.
The new `.20260929.4` package pins the immutable sync index
`sha256:bb1bd5a90068bde583e13a18acc070d3495e59132cfbe611d8e2722b7edbeeef`.
Its guide names Install official client and states LiveSync's private Tailscale
requirement. This is development package source and native qualification;
retained update, encrypted paid Sync and fresh-install acceptance are separate.
The project-vault update remains pending the existing external-write approval.
