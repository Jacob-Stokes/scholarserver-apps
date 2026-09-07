# Paperless development notes

## Native follow-up — 7 September 2026

See `development/README.md` for the explicit opt-in probe and pinned candidates.
Native startup and real authenticated MCP read/search/ownership checks now have
AMD64 evidence. The fixture does not upload PDFs or test OCR. Real initialization
exposed s6's executable `/run` requirement, root-owned credential-file mismatch and
the distinction between ORM fixture creation and upstream search indexing. Fix
those boundaries rather than granting root or broad file access. Restart/cleanup
results must be read from the completed acceptance record, not inferred.

Maintain the Obsidian summary at
`Projects/AcademicSystem/Apps/paperless/paperless.md`. Repo details are authoritative;
source, native tests, publication and live deployment remain separate facts.

The remainder records the original source-only draft.

7 September 2026. Isolated source draft; upstream applications are not forked.

## Ownership and first slice

Maintained Paperless owns document storage, OCR, metadata, identity and ACLs.
PostgreSQL and Valkey own database and broker state. Our small JavaScript sidecar
uses existing `mcp-common` transport and exposes exactly search_documents,
get_document and get_document_text under the paperless namespace. It reads a
private restricted-account token file on each request, sends GET only to the
fixed internal Paperless origin, rejects redirects and caps response bytes/time,
query/page limits and emitted text. At most four reads run concurrently; overflow
fails without a deferred queue. No arbitrary URLs, file paths, SQL, shell,
email, embeddings, mutations, automatic retries or administrator fallback exist.
Errors do not include raw upstream bodies. Paperless text remains untrusted data.

Native ACLs apply to the single configured account. Gateway authorization is
separate and does not map each caller to a native user. This is not suitable for
mutually untrusted readers; token least privilege and instance sharing need proof.
No document or search cache is kept in the adapter. Shared UI primitives render
the draft and read the generic same-origin endpoint Access API; no core changes.
The screen neither provisions secrets nor claims readiness. Web remains complete
upstream; no local software is required. Optional device scanning/manual intake
uses the [official usage guide](https://docs.paperless-ngx.com/usage/), with explicit
user selection; this draft does not watch local folders or ingest email.

## Upstream and MCP investigation

Inspected 7 September 2026:

- [Paperless source](https://github.com/paperless-ngx/paperless-ngx), GPL-3.0;
  [API source](https://github.com/paperless-ngx/paperless-ngx/blob/main/docs/api.md)
  documents token authentication and upload consumption-task UUID, not completed
  document identity. Candidate image: ghcr.io/paperless-ngx/paperless-ngx.
- [Official Compose](https://github.com/paperless-ngx/paperless-ngx/blob/main/docker/compose/docker-compose.postgres.yml)
  currently references Postgres 18 and Valkey 9-alpine with latest Paperless.
  These are research candidates, NOT a tested stable compatibility matrix.
  Postgres uses its PostgreSQL licence; Valkey uses BSD-3-Clause. Image dependency
  notices and actual shipped versions still need inspection. Tika/Gotenberg Office
  conversion is excluded from this first slice.
- [tb1337/paperless-mcp](https://github.com/tb1337/paperless-mcp): read README,
  LICENSE.md (MIT) and server.py wiring. Offers bearer HTTP and read-only mode,
  but calls itself experimental, targets Paperless 3.0+, has a broad evolving
  tool surface and no proven selected stable-image/Gateway match. Not incorporated.
- [OrellBuehler/paperless-mcp](https://github.com/OrellBuehler/paperless-mcp): inspected
  README; larger tool surface, per-user upstream tokens and optional shared
  embedding index with admin/indexer identity. No licence/source/security audit
  or Gateway identity compatibility proof completed. Not incorporated.

Decision: a thin read-only adapter is the smaller reviewable first slice while
version and identity compatibility remain unresolved. This does not prove either
candidate unsafe or unmaintained. Reconsider tb1337 reuse when stable version,
allowlist, error redaction, file secrets and actual Gateway tests are established.
Our cost: maintain three API projections and validation tests across API updates.
No external MCP source copied; no upstream engine repackaged.

## Ingest and recovery boundaries

`ingest-state.mjs` records intended transitions for future work: explicit confirmed
prepared → submitting → processing(task UUID) → complete/failed. An interruption
in submitting becomes unknown and cannot resubmit. This is a pure model only;
there is no journal, upload transport, queue, job-status API or runtime restart
claim. Avoid exposing upstream global tasks until ownership/ACLs are verified.
Missing task results must never be taken as evidence that a write failed.
The source slice is deliberately read-only; synthetic upload remains a later gate.

## Checks

`npm run test:paperless` builds shared MCP, runs focused source tests, typechecks
and builds UI. `npm test` runs the required existing repository suite separately.
See REVIEW.md for observed results, not container or installed-runtime claims.
Root lockfile pins source dependencies; independent image installation remains
untested. No image recipe or Docker build is supplied before input selection.

CI inspection: Check/images push triggers target main; release requires v* tag;
Logseq candidate is manual only. Pushing codex/paperless-draft publishes nothing.
