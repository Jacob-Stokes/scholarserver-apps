# Paperless draft review

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
