# Packaging candidate — not ready for catalog publication

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
