# Application architecture review — 6 September 2026

Applications remain independently packaged Compose projects. Their controllers
own account flows, app-specific state and meaningful activity; ScholarServer core
owns generic installation, routing, storage bindings and lifecycle operations.

## Simplification made

Four controllers/workers repeated a temporary-file writer based only on process
ID. Overlapping writes could share a temporary filename and race at rename.
`packages/controller-runtime/files.mjs` now owns atomic file/JSON replacement:
unique exclusively-created temporary files, per-file in-process ordering,
private permissions by default and cleanup/recovery after failure.

This is a dependency-free file utility, not a controller framework, durable queue
or cross-process transaction manager. Each consuming image explicitly copies
the package. Application state machines and account semantics stay in the app.
Tests cover concurrent ordered writes, permissions and recovery after an error.

## YAML judgment

The current manifest is verbose but mostly declares safety boundaries: services,
immutable images, data ownership, retention, endpoints and allowed setup actions.
Keep that information explicit. Compose describes containers; the manifest says
what the platform may do with them. They are related but not interchangeable.

- Keep setup choices only when they change the installed service/data set, such
  as Zotero desktop versus online library or Obsidian's synchronization method.
- Keep optional presentation/UI/MCP sections absent when unused. Do not require
  every app to imitate the largest package.
- Do not add YAML inheritance, templates, a new workflow language or an extra
  generated manifest format merely to reduce line count.
- Prefer small modules within existing controllers for future app-specific work.
  Do not move app logic into Manager to make a controller file shorter.

## Remaining limits

Per-file atomic replacement does not serialize a whole account workflow or
read/modify/write transaction across processes. Existing domain-specific queues
remain necessary. Full Zotero and Obsidian controllers still have larger
app-specific sections; extract these when changing their behaviour, backed by
actual account-flow tests. The Zotero MCP test script currently compiles its
TypeScript; it is not a live Zotero Web API integration test.

Existing released manifest versions and image digests are unchanged. These source
changes need new native images and new package versions before distribution.

## Verification

`npm test` and the full workspace build passed. All four changed images built
natively on AMD64 Linux. Read-only/capability-dropped startup checks passed for
the Zotero online controller and automation service, Obsidian sync with its real
pinned CouchDB dependency, and the LiveSync worker in its expected waiting state.
The isolated Docker daemon, containers, volumes and images were removed afterward.
These are packaging/startup checks, not new Zotero account authorization or
two-device LiveSync acceptance tests. No published manifest was changed.
