# Retained multi-vault consolidation gate

This is the development migration design, not an implemented or qualified
operator procedure. Do not apply the source candidate to retained data yet.
Fresh multi-vault qualification and retained consolidation are separate gates.

The retained target must keep the original LiveSync installation identity,
private endpoint, CouchDB data, administrator record and each existing database
member account. Existing devices must continue to use the same URL and database;
a new database, recreated member credentials or repaired device link is not a
substitute for preservation.

The official Sync connection must keep its enrolled `/vault` path and its HOME
configuration paths. Upstream's documented `--path` selects an enrolled path;
it does not establish that a stored enrollment can be relocated. Do not edit its
SQLite database or run `sync-setup` over the enrolled copy to force relocation.
Reference: [official Headless commands](https://github.com/obsidianmd/obsidian-headless).

Required app-owned handoff:

1. Obtain executor-created encrypted backups and exact package/service/data
   checkpoints for both installations, plus a reviewed disk budget for original,
   staging and recovery copies. Guard both installed revisions before changes.
2. Qualify a migration intent journal, worker quiescence and bounded authenticated
   transfer between explicitly selected source and target instances. Manager
   may broker declared app requests; host file mutations remain behind executor
   operations. A manual SSH copy into an app dataset is not an implementation.
3. Preserve the target's legacy LiveSync replica and local worker database in a
   managed connection directory. Prove stopped-worker cache/path relocation
   against an independent encrypted peer, without resetting the database or
   importing a fresh empty replica. Keep the original files until verified.
4. Import the stopped official replica and sign-in/configuration state into the
   preserved legacy paths. Verify file inventories and digests before promoting
   registry records or starting a worker. Do not expose transferred credentials
   in logs, browser storage, MCP responses or public artifacts.
5. Commit one authoritative registry only after all referenced data exists and
   all digests match. Persist phase/outcome before side effects; reconcile lost
   responses and restart without blindly repeating transfer or sync enrollment.
6. Resume both connections, verify exact synthetic test-note hashes in each
   direction, attachments and restart, and call the real Gateway's single tool
   inventory with explicit vault IDs. Prove same-path isolation, saved scope and
   per-vault AI revocation. Account data alone does not qualify another device.
7. Disable and unregister the redundant stack only after target acceptance;
   preserve source data and rollback checkpoints. A failure must stop promotion,
   leave recoverable data in place and report the last proven migration phase.

Still missing: the app-owned transfer/quiescence/promotion implementation and its
crash/restart tests. No retained files, credentials or endpoints have been changed
by the source checkpoint that adds this document. The ordinary package updater
preserves each installation; it does not itself consolidate two vaults.
