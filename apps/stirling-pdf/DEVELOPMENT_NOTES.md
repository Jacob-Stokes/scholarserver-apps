# Stirling PDF — first source draft, 7 September 2026

## Decision and scope

Reuse the selected release's native MCP behind the existing authenticated
`mcp-common` Gateway transport. Do not copy the proprietary implementation or build
a duplicate REST-to-PDF MCP. Native Stirling remains the complete PDF web UI;
our shared ApplicationScreen/SetupPanel preview is a review screen, not a second
PDF editor or an implemented account wizard. Core owns access routing. No core,
shared UI, CI, catalog or published-package edits are needed.

The adapter supports five strictly named tools: `stirling_upload`,
`stirling_inspect`, `stirling_rotate`, `stirling_download`, `stirling_status`.
It maps inspect to native `stirling_security/get-info-on-pdf` and rotation to
`stirling_pages/rotate-pdf` with only 90/180/270 degrees. It does not expose the
general native security category, describe arbitrary operations, remote fetch,
paths, scripts, arbitrary API proxying, deletion, OCR, AI or host administration.
Merge/split are deferred: the selected native executor constructs one `fileInput`;
multi-file merge must not be invented from category documentation.

## Selected-release evidence

Read-only GitHub API/source inspection selected **v2.14.3**, published
2026-08-06T18:48:12Z, tag commit
`e556eba8326c8349aa0318034cfdb5c442dca21c`. This is release-source evidence, not
proof that a particular registry image contains or enables the capability.

- [Release](https://github.com/Stirling-Tools/Stirling-PDF/releases/tag/v2.14.3)
- [MCP controller](https://github.com/Stirling-Tools/Stirling-PDF/blob/v2.14.3/app/proprietary/src/main/java/stirling/software/proprietary/mcp/McpServerController.java)
- [Operation catalog](https://github.com/Stirling-Tools/Stirling-PDF/blob/v2.14.3/app/proprietary/src/main/java/stirling/software/proprietary/mcp/catalog/McpToolCatalog.java): nonempty allowlist filters discovery and dispatch; category-only filtering is insufficient.
- [Native executor](https://github.com/Stirling-Tools/Stirling-PDF/blob/v2.14.3/app/proprietary/src/main/java/stirling/software/proprietary/mcp/tools/McpOperationExecutor.java): inline input or native fileId, fixed operation endpoint, one multipart input, new output storage.
- [Rotation API](https://github.com/Stirling-Tools/Stirling-PDF/blob/v2.14.3/app/core/src/main/java/stirling/software/SPDF/controller/api/RotationController.java) and [parameters](https://github.com/Stirling-Tools/Stirling-PDF/blob/v2.14.3/app/core/src/main/java/stirling/software/SPDF/model/api/general/RotatePDFRequest.java).
- [Inspection API](https://github.com/Stirling-Tools/Stirling-PDF/blob/v2.14.3/app/core/src/main/java/stirling/software/SPDF/controller/api/security/GetInfoOnPDF.java): `get-info-on-pdf`, JSON report, security category despite read-style purpose.
- [Download tool](https://github.com/Stirling-Tools/Stirling-PDF/blob/v2.14.3/app/proprietary/src/main/java/stirling/software/proprietary/mcp/tools/StirlingDownloadTool.java): outputs above inline limit cannot be downloaded through this tool; never promise unlimited retrieval.
- [File storage](https://github.com/Stirling-Tools/Stirling-PDF/blob/v2.14.3/app/common/src/main/java/stirling/software/common/service/FileStorage.java): ownership checks are conditional on ownership service/current user/owner. Cross-account isolation still needs actual tests.
- [Current MCP documentation](https://docs.stirlingpdf.com/Configuration/Automation/MCP%20Server/): Streamable HTTP, opt-in MCP, API-key or OAuth auth; self-hosted cloud AI capability is unavailable. These live docs are not an image certification.

## Licence and notices — release blocked

Stirling PDF Inc. copyright notices must remain intact. No upstream code is
vendored or modified by this draft. Use the maintained official native image,
not a reassembled engine, once its edition and usage rights are approved.

The selected [root licence](https://github.com/Stirling-Tools/Stirling-PDF/blob/v2.14.3/LICENSE)
is MIT **with explicit subtree exclusions**. The actual native MCP lives in
`app/proprietary`, governed by the
[Stirling PDF User License](https://github.com/Stirling-Tools/Stirling-PDF/blob/v2.14.3/app/proprietary/LICENSE).
That text restricts production use and distribution; internal trial/minimal use
has conditions. Do not infer production, redistribution or hosted-service rights
from the image's MIT label. Applicable subscription/edition entitlement, full
frontend and bundled dependency obligations need review before use. No licence
approval is claimed and no commercial account was accessed. No enterprise SSO,
cloud AI or paid capability is promised by this draft.

## Data, credentials and failure behaviour

One trusted workspace per instance, with its own `/artifacts` and private
`/runtime/service-token` and `/runtime/stirling-api-key` files. No key is placed
in browser state, environment, CLI arguments, saved job content or error output.
The separate Gateway credential does not become the native Stirling API key.
Manual key provisioning is a deployment gate; no setup endpoint currently exists.

App-owned UUID artifacts keep original bytes separately from rotated results.
Native requests use bytes from those artifacts, not user paths, URLs or native
file IDs. Inputs/outputs are capped at 1 MB. This deliberately avoids depending
on upstream temporary-file retention or parsing textual file-ID summaries.
Successful inspect reports are untrusted bounded text. PDF header checks are
only input shape validation, not a parser security or PDF validity proof.

There is one in-process operation slot and no waiting queue. Native requests have
a 30-second deadline, no redirect and a 3 MB response cap. Storage refuses new
writes at 256 directory entries (an in-flight operation can finish above that
threshold). Status returns the ten newest jobs and total count. Native parser
resource/page limits and multiple-process locking remain release gates.

A private started record is written before dispatch; a separate completion record
is written only after a usable result is saved. Timeout, upstream errors or invalid
output remain unknown; restart reads records but never replays the native call.
No automatic retry, cancellation, resume or native-job reconciliation is claimed.
The draft uses ordinary file writes: sudden power-loss durability/fsync and
partial journal repair still need design/proof. Browser disconnection does not
intentionally cancel the handler, but actual Gateway disconnect behaviour has
not been tested. Operators must reconcile unknown outcomes before manual retry.

Preserve originals, outputs and journals for backup. `/configs` includes native
account/config state; other native storage/DB/log paths must be mapped from the
approved image before final data declarations. No retention cleanup/delete tool
is present. Files need a paused-writer consistent backup and tested restore;
this draft is not backup certification. No local desktop installation is needed.
Official setup reference: [Docker guide](https://docs.stirlingpdf.com/Installation/Docker%20Install/).

## Evidence and acceptance

`npm run test:stirling` exercises source/mock validation, preservation, restart
observation, unknown outcomes, queue refusal, fixed native transport and exclusion
from release discovery, then typechecks/builds the review UI. Mock PDF strings
are explicitly not real parsing or visual-quality tests. `npm test` is the full
repository source suite; see REVIEW.md for the final run outcome.

No image pulls/builds, Docker/native startup, live MCP, real PDF transformations,
browser screenshots, install, Gateway authentication, restore, server deployment
or catalog publication were performed. Image references are intentionally invalid
`UNRESOLVED_DIGEST_DO_NOT_RUN` values, not pretend pins. Development YAML is a
non-runnable topology/contract sketch, not schema-conformance evidence; health
checks, paths, runtime dependencies and generic Gateway networking remain open.

Release gates: licensed-edition/image provenance and native digests; non-shell
health checks; non-root/read-only startup; isolated credentials/duplicate instances;
protocol initialization and real Gateway calls; per-operation allowlist and network
isolation; permitted real-PDF corpus (signed/encrypted/malformed/oversized); originals
unchanged; unknown outcome reconciliation; verified restore; native UI same-origin
route and session handling. A source push satisfies none of these runtime gates.

## CI and source publication boundary

Inspected check.yml (PR/main), images.yml (main/manual), release.yml (v* tags),
and logseq-candidate.yml (manual). Push only `codex/stirling-draft`; do not open a
PR, merge, tag, release, trigger workflows or modify CI. Release discovery uses
`apps/*/package/scholarserver-app.yaml`, so this development manifest is excluded.
