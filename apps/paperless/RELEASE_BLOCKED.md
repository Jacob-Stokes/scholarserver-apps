# Paperless draft — RELEASE BLOCKED

Unpublished candidate, not Manager-installable or production-ready. The opt-in
native probe has separate evidence in REVIEW.md; it is not a production installer.
No catalog entry and no `package/` directory. Development images are intentionally
invalid `UNRESOLVED_*_DO_NOT_RUN` values, never invented approved digests.

Required gates:

- Select maintained stable Paperless, Postgres and Valkey releases; inspect immutable
  native architecture manifests, image licences, vulnerabilities and writable paths.
- Extend the passing two-account ownership checks to shared/group permissions,
  revoked credentials and actual Gateway callers. Current identity is one
  restricted account per app, not per-user federation. Do not share it beyond
  that account's intended readers.
- Implement credential onboarding via supported private files; never use admin
  credentials as fallback. No current screen provisions credentials or accounts.
- Serve the independently built UI and prove native login, path prefix/cookies,
  generic Access route and actual authenticated Gateway discovery/calls.
- Write real package schema and the setup/controller serving path. A separate MCP
  image recipe and non-root/read-only native probe now exist, but neither completes
  the Manager installation. Build-stage dependency advisories were resolved in
  the follow-up; upstream image security/licence review remains outstanding.
- Upload is intentionally unavailable. Ingest state transitions are a pure design
  model, NOT persistent job handling. Add durable intent/task ownership, explicit
  consent, bounded synthetic intake, unknown-outcome reconciliation without replay
  and native task ACL tests before exposing upload or task-status tools.
- Test consistent backup/restore of DB, media/original bytes, OCR/index, pending
  intake, broker and secrets; preserve restricted permissions after restoration.
- Native startup, real synthetic PDF upload/processing and MCP reads have candidate
  evidence. Fresh Manager installation, upgrade/rollback, realistic scanned OCR
  quality and Manager restore remain untested; check REVIEW.md for exact evidence.

Native Docker/SSH testing is limited to disposable synthetic projects on existing
development infrastructure. No paid servers, live research accounts, email intake,
external embeddings, arbitrary file/URL fetches or destructive MCP tools.
