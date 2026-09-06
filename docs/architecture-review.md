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

## Readability follow-up

The [coverage checklist](readability-coverage.md) records this separate pass;
most files still await an end-to-end readability read. Contributor instructions
now explicitly prefer readable branches and visible ownership over fewer lines.

Zotero status probes now feed pure online/desktop status builders, with a single
status-file write. Tests cover account/storage/authorization precedence and
disagreeing health probes. A local comparison against the previous implementation
matched 364 status combinations. The new module is copied into the controller image.

Obsidian had an unused TypeScript API alongside its active JavaScript API. The
obsolete implementation and its unused compiler configuration were removed after
checking entry points; Git retains them. The active API image recipe also omitted
its imported frontmatter helper. The recipe is fixed, with a regression test that
starts exactly its copied source files and reads a synthetic note over authenticated
HTTP. It also verifies unauthenticated access is rejected.

Apps lint, tests and every workspace build passed. This follow-up's startup test
runs native Node locally, not a Docker image or a real user's vault. The earlier
container evidence above applies to the earlier pass, not these new source changes.
New native images and immutable package versions remain necessary before release.

## Consistent application screens

All current app-owned main screens use `@scholarserver/ui/application-screen`.
The shared primitive renders the header, heading, section navigation and feedback;
each app retains its requests, routes, credentials and state. The canonical source
is core `packages/ui/application-screen.tsx`; the vendor file is its build snapshot.
The existing shared setup pipeline and endpoint selector remain the setup building
blocks. A package contract test prevents future app main screens from copying
their own platform header instead.

Zotero's account and storage panels are now separate, stateless components.
Storage editing has one parent-owned draft; status polling does not replace it.
Pure setup rules explicitly preserve resume and desktop-choice precedence.

`npm test` now includes every app UI's type check and the setup decision tests.
`npm run test:ui:browser` builds the three screens and checks four viewport widths,
shared navigation, failed-status recovery and Zotero setup regressions against
synthetic APIs. Supply `SCHOLARSERVER_BROWSER_MODULES` when using an external
Playwright installation. Chrome is the default browser channel. No account or
running ScholarServer is required; the script blocks external browser requests
and closes its local test server. Screenshots go under ignored `.dev/app-screens`.
This does not replace external-account or fresh-container acceptance testing.
