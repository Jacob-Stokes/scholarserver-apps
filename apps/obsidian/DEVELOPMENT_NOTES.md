# Obsidian development notes

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
