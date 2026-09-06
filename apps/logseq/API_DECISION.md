# Logseq API boundary — 6 September 2026

## Decision

Use direct **headless worker HTTP for all fourteen research operations**. Keep the
unmodified official CLI for graph initialization, worker discovery, account/sync
setup and shutdown. This supersedes the earlier decision to use the CLI on every
request: startup overhead is material, while the worker still owns transactions,
graph locking and encrypted sync.

The path is MCP → authenticated, allowlisted helper → loopback worker → graph
and sync. No direct SQLite writes, desktop renderer, patched upstream runtime,
public worker endpoint or desktop API emulation. Graph operations never silently
fall back to the CLI.

## What we maintain

- `worker-http.mjs`: bounded HTTP transport and maintained Cognitect Transit codec;
  typed keywords/UUIDs and plain JSON conversion, not a home-grown wire codec.
- `http-operations.mjs`: fourteen fixed operations using upstream pull/query,
  list and outliner methods; validation, queue and deadline bounds.
- `references.mjs`: display page links ↔ canonical UUID references. Repeated edits
  retain backlinks; unknown references stay intact. Not a full Markdown parser
  or a replacement for Logseq's graph engine.
- `runner.mjs`: official CLI lifecycle and a reproducible benchmark baseline.

The address is discovered once at startup. Loopback address, graph, root, revision
and PID are verified; identity is checked before every operation. Supported worker
revision is pinned to `b09316a` from Logseq 2.0.1. A changed worker fails closed
and requires helper restart; uncertain writes are never automatically retried.
The helper remains non-root and read-only except graph/runtime volumes, with no
Docker socket. MCP cannot mount graph or account data.

## Why not the existing desktop MCP?

`ergut/mcp-logseq` at `2202586962eaf36e07eda3aef3242f6007c7cd1b` expects the
desktop/plugin `/api`, which returned 404 on this headless worker. Both use HTTP
but are not interchangeable. A full desktop solely for this API or an emulation
layer would expand the integration unnecessarily.

Fourteen focused tools are retained, not all community-MCP capabilities. General
queries, arbitrary properties, page deletion/rename, namespaces and semantic
indexing remain outside this pass. Reads retain linked references and nested
blocks; numeric IDs are local to this replica. Records can include additional UUID
metadata: equivalence means graph behaviour, not byte-identical CLI presentation.

## Evidence and maintenance limits

See `VERIFICATION.md` for measurements, native builds, real MCP calls, encrypted
browser round trips and failure/restart checks. The benchmark exercises actual
operations including identity checks and output conversion—not a raw HTTP ping.
`development/benchmark-operations.mjs` alternates CLI/HTTP order on the same graph,
checks equivalent useful results and confirms one unchanged worker. It verifies
persisted edits, task state and the exact number of appended blocks.

Small-graph timings are not large-graph throughput guarantees. Lists/searches are
collected by the worker before helper pagination; oversized results fail with a
bounded error. Deep/nested reference rendering, uncommon Markdown constructs and
large graphs need broader coverage. The internal worker protocol is version-specific:
repeat these tests when updating Logseq, rather than assuming compatibility.

The app remains a development candidate. Installer enrollment, opt-in automatic
sync resume, physical-device/ARM64 encrypted sync, attachments and backup/restore
are separate release gates, not completed by this transport change.

## Primary sources

- [CLI lifecycle](https://github.com/logseq/logseq/blob/2.0.1/docs/cli/logseq-cli.md)
- [Worker routes](https://github.com/logseq/logseq/blob/2.0.1/src/main/frontend/worker/db_worker_node.cljs)
- [Worker operations](https://github.com/logseq/logseq/blob/2.0.1/src/main/frontend/worker/db_core.cljs)
- [Outliner transactions](https://github.com/logseq/logseq/blob/2.0.1/deps/outliner/src/logseq/outliner/op.cljs)
- [Canonical references](https://github.com/logseq/logseq/blob/2.0.1/deps/db/src/logseq/db/frontend/content.cljs)
- [CLI editing](https://github.com/logseq/logseq/blob/2.0.1/cli/lib/upsert.ml)
- [Cognitect Transit](https://github.com/cognitect/transit-js)
