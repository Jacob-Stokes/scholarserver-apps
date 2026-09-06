# Logseq candidate proof — 6 September 2026

## Current result: direct worker HTTP

This follow-up supersedes the CLI-per-request decision described in the historical
sections below. All fourteen research operations now use worker HTTP; the CLI is
retained for lifecycle and explicit sync setup/resume.

### Speed, final candidate

Native AMD64, same small disposable encrypted graph and unchanged worker PID.
Twenty measured samples per path per operation after an initial comparison;
CLI/HTTP execution order alternated. Includes HTTP identity checking, validation,
Transit decoding and output shaping. No GUI process. Times are milliseconds.

| Operation | CLI median | HTTP median | CLI p95 | HTTP p95 | Median speedup |
| --- | ---: | ---: | ---: | ---: | ---: |
| List pages | 319.41 | 14.39 | 362.99 | 22.84 | 22.2× |
| Read page | 305.60 | 5.97 | 421.71 | 8.59 | 51.2× |
| Search blocks | 306.18 | 5.64 | 335.16 | 7.13 | 54.3× |
| Edit block | 324.35 | 15.08 | 342.56 | 24.81 | 21.5× |
| Append block | 328.96 | 26.23 | 353.62 | 32.52 | 12.5× |
| Set task status | 323.38 | 19.78 | 331.31 | 27.36 | 16.3× |

`development/benchmark-operations.mjs` checks equivalent useful outputs, persisted
edit/task state and exactly 42 added blocks (initial pair plus 20 per path).
Edits/status calls repeat fixed values; appends create real new blocks. These are
small-graph latency results, not large-graph throughput or whole AI-response speed.

Complete local MCP requests were also measured independently (20 samples after
warmup): list pages median **20.50 ms**, p95 **32.87 ms**; page reading median
**12.75 ms**, p95 **14.64 ms**. These include the SDK, MCP transport, helper and
worker, but exclude a cloud AI provider and internet latency. Reproduce using
`development/benchmark-mcp.mjs` inside the disposable MCP container.

### Functional and failure evidence

- Final images built and ran natively on AMD64 and ARM64, not emulation.
- All fourteen tools passed through real MCP: reads/search/pagination, creation,
  nested children, edits, task completion, invalid IDs/status rejection.
- Three successive edits retained backlinks. Reads render canonical UUID links
  as readable page references; Datascript entities become plain JSON.
- Existing encrypted AMD64 graph/credentials survived replacement of the old
  CLI-per-call helper. Graph UUID and E2EE flag remained unchanged.
- Final MCP-created notes, task and page reference appeared in the pinned browser.
  A browser child edit returned through MCP; a further fresh edit after helper
  restart returned too. No researcher data was used.
- Stopped the worker deliberately: a create request returned safe HTTP 503 without
  CLI fallback or replay. After helper restart and readiness, the requested page
  remained absent and existing notes/backlinks remained present.
- Native ARM64 fresh and restart protocol tests passed, including a further
  restart-phase backlink assertion. ARM64 encrypted/device sync was not tested.
- 23 helper unit tests cover bounds, identity mismatch, unsupported addresses and
  revisions, deadlines/queue admission, no retry after lost responses, Transit,
  references, authentication and non-destructive initialization. Full repository
  `npm test` and `npm run lint` passed.

Sync resume after restart is still explicit engineering setup, not automatic
installer behaviour. Stopped-worker health may remain marked ready until a graph
request detects the missing worker; requests fail closed and advise helper restart.
One early restart probe raced startup and received a not-ready response; rerunning
after readiness verified absence of the rejected write. This was a test-harness
timing issue, not evidence of a successful write.

Compatibility limits and remaining app release gates are in `API_DECISION.md` and
`RELEASE_BLOCKED.md`. No catalog release or image publication is claimed here.

## Initial native helper/MCP proof

Disposable graphs and native Docker containers: AMD64 on Resolution and ARM64 on
Freelove. No
researcher's notes, account, existing Logseq graph or existing service was used.
No host ports were published in that proof. The initial browser preview used a
loopback-only SSH tunnel. The subsequent account/sync test is recorded below.

- Official Logseq 2.0.1 Linux archive checksum verified at image build.
- CLI created a database graph, research page and block without a GUI/display server.
- Hardened helper and MCP containers start as UID 1000 with read-only roots,
  dropped capabilities and no Docker socket.
- Actual MCP protocol: all six tools work, including search, page/block/task
  creation and reading the resulting tree.
- Unicode and a synthetic DOI citation survived storage and retrieval.
- Two concurrent MCP clients worked (not the older npm CLI's MCP transport).
- Restarting both containers preserved the page, block, task and service identity.
- The graph API rejects unauthenticated requests.
- Unit tests exercise validation, command serialization, timeout outcomes,
  bounded queues/output, stdin transport and non-destructive graph initialization.
- Our own interrupted initialization is resumable. A pre-existing graph with a
  missing or empty database is rejected before the upstream CLI can recreate it.
- The maintained upstream sync and DB web images start under the development
  recipe's non-root/read-only constraints. Sync health returns 200; graph listing
  without credentials returns 401.
- The DB editor loads in the in-app browser. It starts with its own **Demo** graph.
  That is a rendering/startup proof, **not** evidence of shared-graph sync.
- Complete existing apps repository test suite and lint pass with the candidate.

## Account and encrypted browser sync proof — 6 September 2026

A new account was created and email-verified with the user's permission. No paid
subscription or existing research data was used. The pinned sync and browser
containers were reached through private Tailscale HTTPS test routes, not Funnel.

- Found and fixed missing public Cognito configuration in the development recipe.
  `/health` had returned 200 while authenticated graph requests returned 401.
  After configuration, signed-in graph/key requests succeeded and unauthenticated
  requests still require authorization. A recipe regression check was added.
- Stored encrypted user-key material on our self-hosted sync server using a
  separate generated encryption password, saved privately outside the repository.
- Created one disposable encrypted graph using the pinned self-hosted browser.
  The server's graph listing reported `graph-e2ee?` true.
- Created a synthetic research page/block with Unicode and a synthetic DOI.
- Joined the same graph from Logseq's public test browser on a different origin
  (independent browser storage). Its requests downloaded the snapshot from our
  private sync server; the page and block identities/content matched.
- Edited the block in the second client and observed the edit in the first.
- Restarted the sync container. After reconnect, another edit from the first
  client reached the second. No manual reset or encryption downgrade was used.

This proves two-browser bidirectional encrypted sync through the self-hosted
server with a new unpaid account. It is not a physical-device test, cryptographic
audit, headless-replica enrollment proof or complete installer acceptance.

The public test site's initial encrypted graph creation stalled with an invisible
password-request timeout. The pinned browser successfully prompted for the
password and created the graph; the public site could then join and edit it.
That UI failure was not evidence of a subscription requirement.

## Manual encrypted headless/MCP proof — 6 September 2026

Native AMD64 on Resolution, using the same disposable encrypted browser graph
and existing unpaid test account. The official CLI and worker were not modified.

- Completed CLI OAuth/PKCE sign-in using a private engineering handoff of its
  localhost callback. The CLI exchanged the code and stored credentials itself.
- Separated OAuth endpoints from the custom sync URL and mapped the worker's
  fixed credential path to the same persistent storage used by the CLI.
- Downloaded the existing remote graph with the supplied encryption password
  through stdin. Exact graph UUID and `graph-e2ee?` matched the browser.
- Ran all six tools through the real MCP protocol against this graph, including
  concurrent clients and unauthenticated API rejection.
- Observed the MCP-created page, Unicode/citation block and task in the pinned
  browser. Edited the block there and read that edit through MCP. Appended an MCP
  reply and observed it in both independent browser origins.
- Restarted helper, MCP and sync containers. Graph identity, notes and credentials
  persisted. Manually ran `sync start` without resupplying the encryption password;
  the websocket opened with matching checksums and zero pending operations.
- Made a fresh edit in the second browser after restart and verified it through MCP.

The current helper still needs automatic opt-in sync resumption. Manual `sync
start` is **not** an automatic restart-recovery proof. Authentication enrollment
also needs a user-facing flow; this test did not require user interaction but
did require engineering work. No physical client, attachment or restore proof yet.

Manual acceptance artifacts: `development/sync-cli.example.edn` separates account
and data endpoints; `compose.encrypted-proof.yaml` adds persistent credential-path
alignment and account-service egress. Join the test graph before selecting it in
the helper. The MCP acceptance script requires `LOGSEQ_PROOF_GRAPH_ID` and a
browser-edited fixture; set `LOGSEQ_PROOF_PHASE=restart` for the fresh-edit check.
Run it in the MCP container, then inspect the independent browser: reading a
successful local write alone is not evidence of delivery.

## API review and expanded research proof — 6 September 2026

The [API decision](API_DECISION.md) records primary-source review and measured
CLI versus worker HTTP latency. The chosen implementation retains the official
CLI and expands the private helper/MCP from six to fourteen operations.

- Native AMD64 helper/MCP images rebuilt and deployed only to the existing
  disposable encrypted graph. No official Logseq runtime code was changed.
- Actual MCP calls exercised all fourteen tools: page pagination; block-content
  search; reading/editing a block; appending a nested child; listing tasks and
  graph-defined statuses; completing a task. Existing six-tool coverage remains.
- Editing the parent preserved its nested child. Unicode and DOI attribution
  survived. An invalid task status failed without replacing the completed status;
  malformed IDs were rejected through MCP.
- The pinned browser displayed the edited source and nested note. A browser edit
  of the child reached MCP. The second browser origin received the same content.
- Restarted helper and MCP. The new data and service authentication persisted.
  Explicitly resumed sync through the official CLI without another login/password.
  A fresh edit from the second browser after restart reached MCP; sync then had an
  open socket, matching checksums and zero pending local/server operations.
- On native ARM64, a separate fresh disposable graph passed both the baseline and
  expanded MCP proof, then restart/persistence checks. No account credentials were
  copied to ARM64; this is not ARM64 encrypted-sync acceptance.
- Complete repository `npm test`, lint and diff checks passed. Queue, timeout,
  unknown-write-outcome and input-boundary regression tests remain in place.

Repeatable artifacts: `development/check-research-mcp.mjs` runs through MCP,
requires a fresh synthetic page for its write phase, and has a read-only restart
phase. The optional exact graph UUID and browser-marker assertions distinguish
encrypted browser proof from a separate local graph. The native candidate script
now runs both MCP checks before and after restart. Transport benchmark results
are not a large-library or load test. Public test-site browser console diagnostics
were not audited as part of this API pass.

## Not yet verified / not yet implemented

- Final release-artifact repetition of the successful managed AMD64 enrollment below.
- A physical device using the same graph bidirectionally; native ARM64 encrypted sync.
- Broader compatibility beyond this exact pinned CLI/browser/sync combination.
- Attachments, reconnect after network loss and consistent backup/restore.
- Actual devices-only installation; the recommended browser choice is verified below.
- Final package manifest, release image digests and full redistribution/source notices.

This is not available in the published catalog. `RELEASE_BLOCKED.md` records the
acceptance gates. Existing Obsidian and Zotero installations are unchanged.

The new non-publishing GitHub workflow cannot be dispatched until its file exists
on the default branch (GitHub returned 404). Native proofs were run on the two
hosts above instead; neither host was reinstalled.

## Fresh-host catalog acceptance — 6 September 2026

On the disposable Ubuntu 24.04 AMD64 installation, core development-signed
`0.1.0-logseq-test.2` (`e9fc896`) plus native executor `fa24d93` supplied generic
private isolated origins. The browser installed acceptance package `.1` through
the real catalog wizard. A verified application backup preceded the normal
lifecycle API update to `0.1.0-acceptance.2`; addresses and data were retained.
This was an unpublished local candidate update, not the public update feed.

Exact `.2` images (test registry `localhost:5000`, never publicly published):

- helper: `sha256:6a6fa8d177c92fb7c1aebe1845031f0cfc160f3709e6023a835e13da263fc466` (`3b490bb`).
- MCP: `sha256:0ca37c1fc9d80bf1a5e3a3dcc1b8833028452c6ffca2480e628d745017f464ca`.
- sync adapter: `sha256:29e45c431149fc683bea8d0f81bb283399b1892672b3daf98e3878f6c1943828`.
- browser: upstream `ghcr.io/yshalsager/logseq-selfhost-web@sha256:46d425b4eafdf5552b22ecefb58ed37d547460f47bec7f25ab77f75520ac4a1d`.

The browser completed account authorization and created a new disposable,
encrypted `FreshInstallAcceptance` notebook. Upload confirmation made it visible
to discovery; the helper enrolled through the UI and downloaded that exact remote
UUID with encryption enabled. The upstream runtime's internal download transport
worked despite Tailscale running in a separate userspace container.

`check-research-mcp.mjs` passed all fourteen tools against this graph, using the
synthetic `FreshCatalogAcceptance` page. The independent browser displayed the
MCP-created notes, task and nested edits. A browser change reached MCP. After
restarting helper, sync and MCP together, a fresh browser edit reached MCP again,
without re-entering account credentials or the encryption password. Persisted
notes, completed task and backlinks passed the read-only restart assertions.
The setup screen reported Connected and sync up to date.

Complete apps tests, lint and shared production browser UI checks passed. The
source instructions were then clarified to name the upstream settings path and
upload confirmation; that text-only follow-up is not part of the `.2` image.
No real graph, physical device or account from another user was used. The backup
preceded graph enrollment: do not call it an encrypted-graph restore proof.
Remaining gates are listed in `RELEASE_BLOCKED.md`.

## Reproduce

From a fresh disposable repository checkout on a native Linux Docker host:

```sh
npm ci --ignore-scripts
npm run test:logseq
sh scripts/check-logseq-candidate.sh
```

The native script refuses existing test data and does not publish images. It stops
its own containers afterward; the disposable graph remains in the checkout for
inspection. The optional upstream preview is separate and is not a sync test.
