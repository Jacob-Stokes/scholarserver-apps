# Paperless draft review

## Native follow-up — 7 September 2026

Added an independently locked, non-root MCP image and an opt-in disposable native
probe (`development/README.md`). On Resolution AMD64, Paperless 3.1.3 plus
PostgreSQL/Valkey started without root/capabilities; Paperless and MCP used read-only
root filesystems. Real MCP document reads and indexed search respected two synthetic
accounts' ownership; anonymous MCP was rejected. Fixtures use native Django models
and the upstream indexer, not actual PDF ingestion. The complete probe passed on
7 September (project `ss-paperless-probe-54066fb4`): the same reads/search/ACL tests
passed again after Paperless/MCP restart. Its containers and volumes were removed
and absence verified. No upload/OCR, browser installer, Manager/Gateway or restore
acceptance is implied. Images were built locally, not published. The final tested
integration image ID was
`sha256:2d23f118fd3629093ff4a4ab2894e2ad5d45ce3c6ab226b3ae908dd19a6c185d`;
its non-shell health check also reported healthy.

Probe corrections included explicitly indexing fixtures, re-reading dynamically
allocated host ports after restart, and waiting for readiness instead of sleeping
for ten seconds. The host fixture directory is private (0700); native secret files
have container-compatible ownership. PostgreSQL and broker never publish ports.

The build-stage shared dependency lock reported seven advisories (including three
high); the separately locked final integration installation reported zero at build
time. This is not a full image vulnerability audit. Resolve build-stage advisories
and inspect upstream image advisories/SBOMs before release.

The sections below describe the earlier source-only checkpoint, not the native
follow-up's evidence level.

## Implemented

- Three exact read-only MCP tools with strict validation, fixed internal origin,
  native token authorization, bounded JSON/text, no redirect or retry, redacted errors.
- Shared app-screen/setup UI with generic same-origin Access lookup, explicit
  draft/read-only/privacy/recovery copy. No fake account connection state.
- Ingest state design model covering interruption/unknown outcome and no replay.
- Deliberately unusable maintained-upstream topology outside release discovery.

## Verification

- `npm run test:paperless`: passed; nine source/mock tests, UI TypeScript check
  and production UI build. Includes actual local shared MCP HTTP authentication
  and tool discovery with a synthetic bearer, not the installed Gateway.
- `npm test`: passed after installing the existing separately locked Obsidian
  sync dependencies using the same prefix step as CI. Initial run stopped on
  missing `tar` in that separate package; no baseline source defect was found.
- `npx biome check apps/paperless` and `git diff --check`: passed.
- No browser screenshot/interaction test, Docker build or live runtime was used.

## Remaining evidence and review limits

See RELEASE_BLOCKED.md. This is an implementation slice, not a full integration:
the UI and MCP build independently but no combined container/controller serves
both yet. No native ACL, Gateway, OCR, upload, durable journal, restart, backup,
installer, native health/hardening or image provenance verification is claimed.
Native app identity differs from Gateway identity; restricted account sharing is
an explicit risk requiring review before installable packaging. No source scan
constitutes a complete security/readability review.
