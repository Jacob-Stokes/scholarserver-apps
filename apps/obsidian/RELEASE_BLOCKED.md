# Multi-vault retained development candidate — 1 October 2026

Package `0.6.0-multivault.20260930.1` now selects receipt-qualified native images
from `2401873bcce6497f12f2162ddf34d372c722612d`, publication run
[36776366852](https://github.com/Jacob-Stokes/scholarserver-apps/actions/runs/36776366852).
Both native jobs and all manifest jobs passed. Registry indexes, platform configs
and RootFS layer identities match the downloaded publication receipts. Manifest,
Compose and the five Obsidian source-lock records select those same images.
The original retained installation adopted this package at revision 9 on
30 September. The old official replica remains disabled and preserved; the new
official connection awaits owner setup. Core `fea08a3` deployed on 1 October;
real Gateway discovery and single-vault note/binary checks pass. Full two-vault
sync/device acceptance remains open. This is a retained development candidate,
not an unrestricted catalog release or a completed retained migration.

Development delivery requires paired core
`5bc7ed5f59d7e9cdda491b3da55f62bb7eed47bb`, deployed and accepted on Freelove.
It includes workspace installation limits, selected-context configuration,
guarded authoritative dataset addition, identical inactive-exclusion activation
and explicit no-variant planning. The broad compatibility range is not an
old-core guarantee. Existing
installed variants need an explicit reviewed transition to no variant, preserving
every installed dataset and excluded client directory. Two retained installations
must be consolidated only through a checkpointed, runtime-qualified migration.
Do not remove either installation, replace its data, edit upstream SQLite state,
or reset a LiveSync database to satisfy the new model.

Source/API/MCP tests and synthetic Manager acceptance are separate from native
container qualification, image publication, package publication, retained migration,
real Gateway calls and authenticated sync/device acceptance. See
[development notes](DEVELOPMENT_NOTES.md) for the current evidence and open gates.
The previous dated candidate records below are historical.

# Current Manager development candidate — 29 September 2026

Package `0.5.2-manager.20260929.1` now selects receipt-verified native AMD64/ARM64 images
from source `f881ada53a14cf706b237484a4165c9635a9d377`, run
[36557464955](https://github.com/Jacob-Stokes/scholarserver-apps/actions/runs/36557464955).
All seven source packages use that same image build. Manifest, Compose and source
records agree. This closes the stale-image-source gate for this candidate.

This is ready for the paired development qualification/update workflow, not an
unrestricted official catalog publication. Final paired-core compatibility,
fresh-install and authenticated retained-host acceptance remain separate gates.
App-specific account, data and recovery limits are recorded in
[the current report](../../docs/manager-configuration-20260929.md).
Earlier entries below describe historical candidates and do not identify the
currently selected source version or installed package.

# Packaging candidate — not ready for catalog publication

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

## Isolated-instance repair candidate — 15 September 2026

`.4` supersedes the failed private-origin `.3` development install. Only sync
is rebuilt, from `d8bce37f78ad33b90e910a6cd80faf8a55c97226` on native ARM64.
Published manifest `b105d4073909f50a00c0fc8de6bbeaf56cd93a6b7893fa6692a033554a5508e7`
selects config `e1502a6cdd3e54a8e0f6166edf632e57dee696800243e8d340c593d642712da1`.
The other four image pins are unchanged. Full source tests, package validation,
image-content checks and two-instance startup/restart with a conflicting edge
alias passed. See `scripts/check-obsidian-instance-isolation.py`.
This scoped regression is not a new full replication/desktop qualification.
Live installation, private endpoint and actual desktop connection remain gates.

## Guided research candidate — 15 September 2026

`0.5.0-guided.20260915.2` is an **ARM64 development candidate**, not an official
release. It supersedes the unqualified `.1` source candidate. All five services
now select immutable images built from `2a8cde7cd7a81193891a993bad74eb9adff4a03e`;
manifest, Compose and current source-lock records agree. The new sync image
contains the per-vault folder reader. AMD64 is deliberately not advertised by
this candidate; it has not been rebuilt and qualified for this source.

The exact ARM64 native suite passed consent/integrity-controlled official-client
download, native CLI/SQLite, restart and legacy-layout preservation, API/MCP note
operations, and independent two-peer LiveSync replication. These are isolated
synthetic-data checks, not official account or actual desktop/plugin acceptance.
See `docs/native-research-candidates-20260915.md` for receipts and limits.

Development deployment is restricted to qualified core
`18c69580d71052a72f32288d5d2c07328371a271`, which contains generic variant mount
projection in planner/validation and executor. Both variant source contracts
preserve their declared datasets; a live plan must separately prove preservation
of all six installed LiveSync roots. Select a compatible released platform
minimum before official release; the broad minimum is not an old-core guarantee.
New n8n vault-folder access still requires a separate per-vault approval.

## Editorial candidate — 14 September 2026

Source package `0.5.0-beta.4.editorial.20260914.1` is not published or qualified for a live
catalog update. It preserves the prior image pins; they do not claim to contain
this pass's UI changes. See [editorial icons and release gates](../../docs/editorial-icons.md).
Before publication, qualify the new package with a core release that supports
`presentation.editorialIcon`, select its verified platform minimum, and complete
native/image-source and authenticated browser acceptance for changed UI images.
Never inject these assets into an installed or published old package version.
Existing app-specific release gates below, where present, remain in force.

The `0.5.0-beta.3` source package selects refreshed native AMD64/ARM64 images:
sync controller `987206e`, API/MCP/CouchDB/worker `434b57a`. Both architectures
pass explicit client download and integrity, native CLI/SQLite, restart and
legacy-layout preservation, MCP note operations and independent two-peer
LiveSync replication. A CouchDB administrator-bootstrap race is fixed without
retrying ordinary authentication failures. See the
[refresh report](../../docs/package-refresh-20260912.md).

These are published candidate images, not an official package or live upgrade.
Before removing this gate, verify authenticated migration, official account
sync, actual desktop/plugin LiveSync setup and live application backup/restore.
The target platform must
support `data.backup: excluded`; select a compatible released platform minimum
before publication rather than relying on the current broad `>=0.1.0` range.
Older published versions are immutable and still refer to their old images.
# Private development origin candidate — 15 September 2026

`0.5.0-guided.20260915.3` retains all qualified image digests and adds an opt-in,
private-only platform origin for LiveSync. CouchDB no longer joins the shared
edge network or advertises a shared database alias; the instance-specific router
joins its private network. Existing installed packages are unchanged. The full
app test suite and core package-schema validation pass. Fresh development install,
private-route and desktop synchronization acceptance remain pending. This is not
a general release or an update of Freelove's existing notes.
