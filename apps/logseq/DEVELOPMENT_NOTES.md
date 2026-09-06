# Logseq development notes

Recorded 6 September 2026 against the Logseq 2.0.1 candidate, source passes
`edb8401` and `cbd0c55`. This records reasoning and difficulties, not completion.
See [verification](VERIFICATION.md) for proof and [release gates](RELEASE_BLOCKED.md)
for remaining acceptance work. Do not connect a real graph for these tests.

## Findings and decisions

### HTTP is a transport, not a compatibility guarantee

The API review found two distinct interfaces in 2.0.1. The community MCP expects
desktop `/api`, which dispatches to Electron's renderer. The headless worker has
`/v1/invoke`, using Transit and lower-level graph operations. Our official CLI
already uses that HTTP route and reuses the worker; it does not start a GUI.

Measured warmed page listing was about 314 ms through CLI versus 12 ms through
raw worker HTTP on the disposable AMD64 graph. The later verified adapter uses
direct worker HTTP for fourteen research tools and keeps lifecycle in the CLI.
The exact decision, sources, limitations and
revisit triggers are in [API_DECISION.md](API_DECISION.md). Do not build a desktop
API compatibility shim just to claim reuse of an existing MCP.

### The old npm CLI is not the new database-graph CLI

`@logseq/cli@0.4.3` is not the runtime shipped with Logseq 2.0.1. The candidate
targets database graphs, not legacy Markdown-file graphs. The new CLI is packaged
inside the official desktop archive; we verify that archive's checksum and run
its unmodified runtime in Node mode, without a display server.

This still distributes desktop runtime bytes. It is an explicit packaging
exception with source/notice obligations, not merely our own MCP image. Prefer a
supported upstream headless artifact if one becomes available. Relevant upstream
references are linked in [README](README.md#sources-and-notices).

### Independent startup is not integrated sync

The helper/MCP works on native AMD64 and ARM64. The upstream browser and sync
images initially opened separate Demo graphs. The later account test proved
bidirectional sync between two browser origins through our server, using one
disposable encrypted graph. The subsequent manual enrollment pass connected the
helper/MCP to that same encrypted graph and verified both directions. Do not
mistake this proof for physical-device or installer acceptance.

Keep the candidate unpublished until all participants join the same graph and
edits are verified both ways. Browser availability must remain an optional,
recommended installation choice, not an unrelated notebook presented as working.

### Authentication and E2EE are the next architectural gate

The selected community Node sync adapter uses Logseq account authentication by
default. The alternative sync-worker's semantic MCP supports only non-E2EE
graphs, so it is not an acceptable shortcut that silently removes encryption.

The verified route is a locally authorized headless replica, with Logseq owning
decryption and database access. A newly created unpaid account now works for
encrypted browser/headless sync through our server. The CLI completed its normal
OAuth authorization-code/PKCE login. For this engineering proof, a temporary
browser opener captured its authorization URL and the browser's callback was
delivered privately to the CLI's own loopback listener. The CLI owned the state
check, code exchange and credential persistence; no tokens were copied from the
browser or sent through a central ScholarServer service. This manual handoff is
not a finished remote-server onboarding flow.

### The packaged CLI has different authentication assumptions from the worker

Read the actual shipped CLI and its `cli/lib/*.ml` sources, not only the older
`src/main/logseq/cli/*.cljs` implementation still present in the same release.
The packaged CLI uses a custom `http-base` for OAuth as well as sync by default.
Explicit `oauth-authorize-endpoint` and `oauth-token-endpoint` keep Logseq account
login separate from our sync service. Without them, login went to our sync URL.

The worker's encrypted-password persistence reads `~/logseq/auth.json`, ignoring
the CLI's custom `auth-path`. Login and graph listing succeeded, but downloading
reported a misleading missing-encryption-password error caused by a missing
refresh token at that fixed path. Mapping the same persistent directory at
`/graph` and `/home/node/logseq`, with the auth file in that directory, fixed it.
Do not maintain two credential copies or patch the upstream encryption code.

The upstream callback bound to IPv6 loopback in this container. A probe of `/`
terminated the login attempt with `login-callback-not-found`; do not use a
generic health probe on a one-shot authentication listener. Retry with a new
authorization request, not an old authorization code.

### Restart persistence is not automatic sync resumption

After restarting helper, MCP and sync containers, the graph and encrypted
credentials survived. An explicit `sync start` succeeded without entering the
password again; a fresh browser edit then reached MCP. The new managed-setup
candidate now starts sync automatically for a previously selected notebook. Its
isolated AMD64 browser test restarted helper, sync and MCP together, observed
matching checksums, then verified a fresh browser edit through MCP without
re-entering credentials. This is not yet a final catalog installation proof.

`development/check-synced-mcp.mjs` checks the exact remote identity, encrypted flag,
browser-originated data and return edits. `compose.encrypted-proof.yaml` and
`sync-cli.example.edn` record the manual test configuration, not a user installer.
The first failed download's empty local graph was preserved outside the graph
directory before retrying; no remote notebook or existing Research graph was reset.

### Healthy sync did not mean account verification was configured

The development container returned `/health` 200 without Cognito configuration,
but rejected the signed-in browser with 401. Explicit upstream issuer, public
client identifier and signing-key URL fixed this. These are public configuration,
not credentials. The recipe now also accepts the external base URL for asset links.
`tests/image-packaging.test.mjs` guards this configuration. Test both authenticated
success and unauthenticated rejection, not just health.

### Configure the destination before enrollment, and test the shipped browser

The public test site's create-graph dialog remained disabled after selecting
encrypted sync. Its console reported `ui-request-timeout` for an encryption
password prompt that was not visible. Do not call this a paid-account restriction
or bypass it by turning encryption off. The pinned self-hosted browser displayed
the password prompt and completed creation. The public site subsequently joined
and edited that same graph successfully.

Set the custom sync URL before login/encryption enrollment, then reload to ensure
it applies. Key records belong to the selected server. Verify actual request
destinations; the words "Use Logseq Sync?" also label self-hosted sync in the UI.
Use distinct browser origins or clean browser contexts for replication proofs:
two tabs sharing the same IndexedDB are not independent clients.

### A passing build hid a missing runtime dependency

The initial MCP image used `npm prune --omit=dev`; the local `file:` dependency on
`mcp-common` was not available correctly in the resulting image, producing
`ERR_MODULE_NOT_FOUND` despite successful compilation. The recipe now performs
the production install with the same explicit `--install-links` semantics.

Regression evidence: final-container MCP protocol checks on both native
architectures, not just TypeScript tests. See `mcp/Dockerfile` and
`development/check-mcp.mjs`.

### Verify actual CLI semantics and contain its output

The pinned CLI searches with `--content`, not the initially assumed `--query`.
Inspect exact-version help and exercise each operation. The API exposes fourteen
allowlisted research operations, not arbitrary CLI access or direct SQLite writes.

Note contents pass through stdin to a launcher, not OS arguments. User values are
bound to their flags; raw upstream errors are discarded. The runner bounds the
queue/output and includes queue waiting in its deadline. An expired write has an
unknown outcome and must not be automatically retried. UTF-8 output is decoded
after buffering bytes so split multibyte characters survive.

These behaviours are covered in `helper/operations.test.mjs`,
`helper/runner.test.mjs` and the native protocol proof.

### Missing data is not an invitation to reinitialize

The upstream CLI can create a database when its graph directory exists but the
database is missing. Calling it blindly during recovery risks concealing damage.
Our initialization marker records a first setup that we own. Without that marker,
an existing graph requires a nonempty regular, non-symlink database before the
CLI runs. We fail rather than silently recreate it.

`helper/server.test.mjs` covers interrupted initialization and missing/empty
database rejection. Native fresh/restart checks prove persistence; they do not
replace future sync interruption and restore drills.

### CI and version compatibility remain separate concerns

GitHub returned 404 when dispatching the new workflow because its file is not on
the default branch. We used isolated native Resolution/Freelove proofs instead;
neither host was reinstalled. Do not merge or modify shared infrastructure merely
to bypass that restriction.

Browser, sync adapter and official CLI are pinned independently. Their startup
does not prove protocol compatibility. Record a tested matrix after same-graph
sync succeeds. The development lock holds exact upstream image references;
Linux repository packages still prevent a claim of bit-for-bit reproducibility.

## HTTP transport follow-up

The API decision now uses direct worker HTTP for fourteen everyday operations;
the CLI owns lifecycle only. Do not confuse worker HTTP with desktop `/api`.
Use the maintained Transit library: retain keyword namespaces, convert lists and
Datascript entities to plain JSON, and preserve typed UUIDs on the wire. Verify
worker identity before dispatch and never replay uncertain writes.

Testing caught lexicographic block ordering (`Zz` precedes `a0`), descending ID
tie-breaking in lists, and canonical UUID references. Plain `[[Page]]` can look
correct yet lose backlinks after another edit/rebuild. Check repeated edits and
browser sync, not just one insertion. Keep upstream transactions authoritative;
do not repair reference handling with direct database writes.

The first latency probe skipped compatibility work. The final benchmark runs
actual adapters on one graph, alternates order and checks persisted results.
Native builds and live MCP tests caught issues that mock tests did not. Keep
these evidence layers separate and repeat them for runtime upgrades.

## Next evidence to obtain

1. Integrate the verified development enrollment/resume flow into the actual package and fresh-host installer.
2. Extend same-graph browser/headless proof to a physical device and native ARM64 sync.
3. Attachments, network interruption/reconnect and consistent backup/restore.
4. Shared ScholarServer setup/access UI, including the no-browser choice.
5. Compatible version matrix, complete upstream notices and final release images.

Update these notes as findings change. Keep current runtime addresses and secret
login links out of this document; they are not durable architectural knowledge.

## Browser enrollment and recovery follow-up

The managed candidate uses the upstream CLI's supported OAuth/PKCE configuration;
it does not exchange tokens itself or call a central ScholarServer service. The
upstream redirect is fixed to localhost. The user completes Logseq sign-in and
copies the failed tab's return address into a masked field. We validate the exact
destination, state and single code, then forward only to the CLI's fixed loopback
listener. Invalid, expired and replayed links are rejected. A cancelled attempt
stops its child and removes its private temporary verifier. Browser automation
completed this real flow using the existing authorized test account.

Account discovery needs a separate temporary graph root. Using the real default
notebook name created an empty graph before selection. Discovery now uses a
runtime-only Account graph and stops its worker after listing.

`DB_SYNC_BASE_URL` must be reachable from the browser **and** the helper. A
loopback address made the CLI report a successful download with empty graph
metadata. Check the persisted remote UUID and encryption flag before readiness,
not just command exit status. The failed first download was retained; retry moves
only our own uncompleted replica into a recovery folder after stopping its worker.
It never resets a remote notebook or replaces a connected local graph.

The shared application screen now has Overview and Configuration, a three-stage
setup flow, persistent download progress and retry. Mobile layout and navigation
are exercised with the other apps. The real isolated proof used a new encrypted
graph, exercised all fourteen MCP tools, saw those edits in the independent
browser, returned a browser edit to MCP, and repeated after a service restart.
The new setup image has not yet been tested on native ARM64 or installed through
the real catalog. Endpoint provisioning and the optional editor choice remain
package integration work, not verified features of this development compose file.

## Installer address configuration follow-up

Core checkpoint `e9fc896` adds generic private, cookie-free isolated origins;
it does not contain Logseq rules. The candidate setup now requests those routes
through the shared endpoint selector before starting account enrollment. Requests
can be retried if only one route was created. No public route is implied.

The pinned upstream sync process reads `DB_SYNC_BASE_URL` only at startup. Its
generated asset links must use the selected HTTPS origin. A small app-owned Node
launcher runs inside the unchanged upstream sync image, reading a public-only
configuration volume written by the helper. It stops the old process before
restarting with a changed address. The sync image never mounts helper credentials.
Raw upstream process output is suppressed; health and setup report failures.
This keeps runtime configuration in the app without adding arbitrary environment
mutation or application-specific behavior to the executor.

Source tests cover address validation, stop-before-restart and idempotent config
writes. The new setup is not yet a published package or a verified native
catalog-install proof. Initial internal-only startup exists solely to make setup
available; account/notebook enrollment is blocked until the private address is set.
