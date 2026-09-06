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
images start, but the browser currently opens its own Demo graph. **That graph is
not the MCP graph.** No bidirectional device/browser/server sync has been proved.

Keep the candidate unpublished until all participants join the same graph and
edits are verified both ways. Browser availability must remain an optional,
recommended installation choice, not an unrelated notebook presented as working.

### Authentication and E2EE are the next architectural gate

The selected community Node sync adapter uses Logseq account authentication by
default. The alternative sync-worker's semantic MCP supports only non-E2EE
graphs, so it is not an acceptable shortcut that silently removes encryption.

The proposed route is a locally authorized headless replica, with Logseq owning
decryption and database access. Actual account enrollment and encrypted sync are
unverified. The CLI's localhost OAuth callback also needs a supported remote-server
onboarding flow; do not claim that problem is solved or introduce an unreviewed
credential broker. A disposable graph/account test is still needed.

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

1. Supported account enrollment and encrypted setup on a disposable graph.
2. Same graph across browser, headless replica and device; verify edits both ways.
3. Attachments, network interruption/reconnect and consistent backup/restore.
4. Shared ScholarServer setup/access UI, including the no-browser choice.
5. Compatible version matrix, complete upstream notices and final release images.

Update these notes as findings change. Keep current runtime addresses and secret
login links out of this document; they are not durable architectural knowledge.
