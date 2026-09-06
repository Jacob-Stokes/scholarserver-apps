# Logseq development notes

Recorded 6 September 2026 against the Logseq 2.0.1 candidate, source passes
`edb8401` and `cbd0c55`. This records reasoning and difficulties, not completion.
See [verification](VERIFICATION.md) for proof and [release gates](RELEASE_BLOCKED.md)
for remaining acceptance work. Do not connect a real graph for these tests.

## Findings and decisions

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
password again; a fresh browser edit then reached MCP. However, the current helper
does not automatically start sync. Production lifecycle ownership must implement
explicit, resumable enrollment and opt-in sync startup, and health must distinguish
an available local notebook from current remote sync. Do not mark that gate passed.

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
Inspect exact-version help and exercise each operation. The API exposes six
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

## Next evidence to obtain

1. Turn the manual headless enrollment proof into safe remote-server setup and automatic sync resume.
2. Extend same-graph browser/headless proof to a physical device and native ARM64 sync.
3. Attachments, network interruption/reconnect and consistent backup/restore.
4. Shared ScholarServer setup/access UI, including the no-browser choice.
5. Compatible version matrix, complete upstream notices and final release images.

Update these notes as findings change. Keep current runtime addresses and secret
login links out of this document; they are not durable architectural knowledge.
