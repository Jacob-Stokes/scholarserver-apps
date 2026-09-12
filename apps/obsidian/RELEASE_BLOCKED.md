# Packaging candidate — not ready for catalog publication

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
