# Logseq API boundary — 6 September 2026

## Decision

Retain the unmodified official 2.0.1 CLI behind our narrow private HTTP helper.
It discovers and reuses one headless worker. Do not replace it with direct worker
calls or install a full desktop solely to use a different MCP. This is a deliberate
maintenance/correctness trade-off, not a claim that subprocess overhead is free.

The path remains MCP → authenticated helper → official CLI → loopback worker
HTTP → Logseq graph and encrypted sync. No direct SQLite writes, patched upstream
runtime, Electron renderer, desktop API emulation or public worker endpoint.

## Alternatives reviewed

| Option | Benefit | Cost / finding | Decision |
| --- | --- | --- | --- |
| Official CLI | Upstream owns selection, validation, task semantics, graph lifecycle and output conversion | Per-request process startup | Keep for this candidate |
| Direct worker HTTP | Avoids the per-request CLI process | Own Transit serialization, typed lookups, outliner operations, task resolution, result shaping and revision/owner checks | Not justified by this benchmark |
| `ergut/mcp-logseq` + desktop HTTP | Existing MIT MCP, broader tools | Its `/api` requires application/plugin APIs; our pinned headless worker has no compatible endpoint | Not a drop-in replacement |
| Emulate desktop API for that MCP | Reuse its tool definitions | Own a substantial compatibility layer as well as another service | Reject unless a small, independently useful adapter emerges |

The community MCP was reviewed at `2202586962eaf36e07eda3aef3242f6007c7cd1b`.
Its DB-mode option does not make the desktop and worker protocols interchangeable.
No full desktop deployment or comparative desktop RAM benchmark was performed.

## Evidence and limits

On the native AMD64 disposable encrypted graph, ten warmed page-list samples:

- CLI: 303–330 ms; mean 313.6 ms.
- Direct worker HTTP: 9–14 ms; mean 11.5 ms.
- Worker PID unchanged across all calls; desktop `/api` returned 404.

A second run after restart measured 296–313 ms through CLI and 10–21 ms through
HTTP, again with one worker and no desktop API. The HTTP probe is a latency floor,
not an equivalent implementation: it skips CLI lifecycle discovery, validation and
output conversion. This small, quiet graph does not establish large-graph throughput,
concurrent load or memory cost. The CLI queue still serializes operations;
high-volume use may justify revisiting this.

`development/benchmark-transport.mjs` reproduces the read-only comparison without
printing notes or credentials. The raw worker endpoint is loopback-only and is
not safe to expose as our authenticated, allowlisted application API.

The CLI is not merely a transport wrapper: page/task operations resolve entities
and status properties, apply outliner operations, and shape results. The official
documentation also assigns daemon discovery, revision matching and ownership to
the CLI. Copying this logic would expand our maintenance boundary.

## What we built

Fourteen focused MCP operations cover metadata, page listing/search/reading,
page creation, block-text search/reading/editing, nested/appended notes, and task
creation/listing/status discovery/status changes. The fixed status query is
upstream-provided; arbitrary queries, CLI flags, paths and commands are not exposed.
IDs returned by these tools are local to this replica, not transferable device IDs.

This is not full community-MCP parity. Page rename/delete, standalone backlinks
tools, general property/namespace/query operations and semantic indexing remain
outside this pass. Page reads already include upstream linked-reference data.
Use the same upstream boundary for additions; do not quietly add a second
database implementation to fill gaps.

Revisit when an upstream supported headless application API/MCP becomes available,
or representative workloads show this boundary is a bottleneck. A dedicated
upstream headless artifact could also remove the desktop-archive packaging
exception. No such improvement is assumed to exist in this pinned build.

## Primary sources

- [CLI lifecycle and commands](https://github.com/logseq/logseq/blob/2.0.1/docs/cli/logseq-cli.md)
- [Worker HTTP routes](https://github.com/logseq/logseq/blob/2.0.1/src/main/frontend/worker/db_worker_node.cljs)
- [Desktop API renderer dispatch](https://github.com/logseq/logseq/blob/2.0.1/src/electron/electron/server.cljs)
- [CLI worker transport](https://github.com/logseq/logseq/blob/2.0.1/cli/lib/transport.ml)
- [Upstream editing semantics](https://github.com/logseq/logseq/blob/2.0.1/cli/lib/upsert.ml)
- [Community MCP](https://github.com/ergut/mcp-logseq/tree/2202586962eaf36e07eda3aef3242f6007c7cd1b)
