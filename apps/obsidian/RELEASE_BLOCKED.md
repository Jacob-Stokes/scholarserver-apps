# Packaging candidate — not ready for catalog publication

## Guided research candidate — 15 September 2026

`0.5.0-guided.20260915.1` is a pending source candidate, **not for deployment**.
It declares the two research actions and removes official-client from LiveSync's
variant selection only. All images remain at their old pins by explicit request;
the sync pin does not contain the new folder reader. Build/qualify the new sync
image and update both pins before use. Native source filesystem tests are not
final-image acceptance.

The package also depends on the parent-owned generic core dataset-mount
projection in both planner/validation and executor rendering. Qualify both
variants, preserve all six existing LiveSync datasets and official Sync's
excluded client cache, and select the compatible platform minimum before release.
The existing broad minimum is not evidence that old core can render this package.
New n8n vault-folder access needs explicit user approval separately.

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
