# Paperless draft — RELEASE BLOCKED

Source-only first slice. Not installable, published, deployed or production-ready.
No catalog entry and no `package/` directory. Development images are intentionally
invalid `UNRESOLVED_*_DO_NOT_RUN` values, never invented approved digests.

Required gates:

- Select maintained stable Paperless, Postgres and Valkey releases; inspect immutable
  native architecture manifests, image licences, vulnerabilities and writable paths.
- Verify least-privilege upstream token and native document ACLs against two real
  synthetic accounts. Current gateway identity is one restricted account per app,
  not per-user federation. Do not share it beyond that account's intended readers.
- Implement credential onboarding via supported private files; never use admin
  credentials as fallback. No current screen provisions credentials or accounts.
- Serve the independently built UI and prove native login, path prefix/cookies,
  generic Access route and actual authenticated Gateway discovery/calls.
- Write real package schema, non-shell health checks, non-root/read-only startup
  and controller image recipe only after selecting tested image inputs.
- Upload is intentionally unavailable. Ingest state transitions are a pure design
  model, NOT persistent job handling. Add durable intent/task ownership, explicit
  consent, bounded synthetic intake, unknown-outcome reconciliation without replay
  and native task ACL tests before exposing upload or task-status tools.
- Test consistent backup/restore of DB, media/original bytes, OCR/index, pending
  intake, broker and secrets; preserve restricted permissions after restoration.
- Native container startup, fresh installation, restart, upgrade/rollback,
  synthetic OCR/search round trip and restore remain entirely untested.

No Docker builds, paid infrastructure, SSH, live accounts, email consumption,
external embeddings, host shell, arbitrary file/URL fetches or destructive tools.
