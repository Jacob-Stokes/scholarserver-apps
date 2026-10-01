# Retained multi-vault consolidation gate

The guarded package adoption completed on 30 September 2026; full retained
multi-vault acceptance is still open. The qualified development package is
`0.6.0-multivault.20260930.1`, metadata source `39f1702` and native runtime
source `2401873`. Both native architectures and immutable image publication
passed. Core `fea08a3` deployed on 1 October corrects generic Gateway inventory
refresh; it exposes the app-owned discovery tool and explicit vault selection.

The original `personal/obsidian` is revision 9 with five healthy shared services.
`personal/obsidian-2` is disabled at revision 5, with its encrypted backup,
enrollment and 352-file frozen inventory retained. Five original identity files
restored from the original LiveSync target's pre-update encrypted backup match live hashes; this is
a limited restore comparison, not a complete vault restore or device test.

Fresh authenticated Gateway checks pass 20 Obsidian tools, selection on all 19
content tools, note/binary creation and read-back in the existing LiveSync vault,
and refusal of missing selection, an unknown vault and path traversal. The new
official slot remains at client consent, awaiting owner reconnection. These
observations do not qualify two-vault isolation, source-file comparison,
retained encrypted device roundtrip or enrolled restart.

Keep the original LiveSync installation as the target. Its legacy `/vault`,
CouchDB data, administrator record, database member account and private endpoint
remain in place. The new supervisor adopts that existing connection. Devices
continue using their existing URL and database; do not reset or replace either.

Add the official Sync vault as a new managed connection in Configuration using
upstream's supported sign-in/setup/download flow. Its new empty directory gets
its own HOME and enrollment. Do not relocate the old official enrollment, edit
its SQLite database or run `sync-setup` over existing local vault data. The owner
must enter their account and encryption password in the new connection when
required. This is an explicit credential step, not an automatic transfer.
Reference: [official Headless commands](https://github.com/obsidianmd/obsidian-headless).

Required cutover sequence:

1. Guard both installed revisions, exact services/images and all data paths.
   Obtain executor-created encrypted application backups and package/Compose
   checkpoints. Check projected peak space for the retained copies and new
   download; preserve excluded official-client directories and protected images.
2. Verify the old official replica has no unacknowledged local changes using
   upstream status and narrowly scoped state checks. Stop if this is unknown.
   Stop that redundant installation through Manager/executor, preserving all
   data and credentials. Its original enrollment remains available for rollback.
3. Update the original LiveSync installation through the reviewed executor package
   update, explicitly replacing its installation-wide variant with no variant.
   Use the backup-required transaction. Verify all older data paths remain,
   the new authoritative root starts absent and the full old package declares
   the identical excluded client directory, including an inactive variant.
   The executor retains a local working/original copy without exporting it. No manual SSH copy or host database edits form part of this flow.
4. Prove legacy LiveSync adoption, unchanged endpoint/database/member identities,
   encrypted note delivery in both directions and restart. Then add and connect
   the official vault inside Configuration, with immediate progress and safe
   retry/reconciliation behavior. Never replay an uncertain setup request.
5. Compare the new official replica's private inventory and file digests with the
   stopped source. Confirm the preserved synthetic test note, attachment bytes,
   upstream upload acknowledgement, reverse delivery and restart. If source-only
   files or unacknowledged changes exist, stop acceptance and restore the old
   installation; do not silently omit them from consolidation.
6. Call the retained Gateway's single tool inventory with explicit vault IDs for
   both vaults. Prove same-path isolation, saved folder scope and per-vault AI
   revocation. Do not equate private API calls with Gateway acceptance.
7. Keep the redundant instance disabled and its data/checkpoints retained until
   the owner accepts the cutover. Do not remove its data merely to meet the
   single-install rule. Existing copies remain manageable; new copies are refused.

Still open: owner sign-in/encryption input, all frozen source-file comparisons,
real two-vault Gateway isolation/scope/revocation and retained sync/device/restart
acceptance. The initial source checkpoint adding this design changed no retained
files, credentials or endpoints; the adoption described above is a later operation. The package updater preserves an installation; it does not merge
vault data or transfer account credentials automatically.
