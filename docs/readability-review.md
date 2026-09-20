# Readability review notes

## Obsidian informational reads — 20 September 2026

The app-specific read module names payload projection and polling cadence;
canonical shared UI owns lifecycle, stale response rejection and access retirement.
The controller's public-status allowlist and separate device-detail reader make
the credential boundary explicit. The mounted device setup panel deliberately
does not use a retained read resource for its passphrase/link. This is a scoped
review of status and credential lifetime, not all Obsidian workflows. The large
screen still owns several forms; future panel extraction must preserve one draft
owner rather than introduce a generic setup engine. Zotero/n8n remain deferred.

## Shared access lifetime and Logseq addresses — 20 September 2026

`ReadScope` in canonical shared UI replaces repeated sibling-denial loops in
Docling and FreshRSS and supplies the same mechanism to Logseq. It holds related
resources and an access-cancellation signal; it has no routes, app names, schemas
or mutation workflow. The app selects related readers and creates a new scope on
explicit recovery. This keeps late operations confined to their original owner.

Logseq's private-address panel derives two independent snapshots, not another
fetch effect or loading-state owner. Provisioning remains an explicit, bounded
app-owned sequence with cancellation between steps and read-only reconciliation
after completion/failure. No provisioning occurs during discovery. Confirmed
absence of an available private route has guidance rather than an unexplained
disabled button. Status still includes account-handoff information with a
component-local lifetime; it must not become a persistent/shared registry cache.
Deeper Obsidian/Zotero setup payload classification remains unfinished.

## Docling and Logseq loading — 20 September 2026

Docling now creates shared read resources for queue, settings and file discovery
in `docling-reads.ts`. That app-owned module declares requests, cadence and their
common authentication boundary; shared code owns cancellation, freshness and
observation. The UI derives snapshots and owns only its editable drafts and
actions. Logseq and FreshRSS status also use the shared resource/hook instead of
their former observers. No workflow rules moved into Manager or shared UI.

Deferred: Docling's screen still combines forms and tab rendering. A later
extraction should separate complete panels without moving
their drafts into competing owners. Logseq's private-address discovery and deeper
Obsidian/Zotero/n8n reads remain separate review items. Browser checks of selected
flows are not a completed architectural or application-wide review.

## FreshRSS observation and feedback — 20 September 2026

The shared read resource/hook now bounds and serialises all three informational
reads. `reader-reads.ts` declares their routes and common access-denial boundary,
not a route registry or cross-app cache. Appearance and reader-address forms keep
their own drafts; their reads can fail independently. Explicit sign-in recovery
remounts the app owner, keeping retired writes away from new state. Shared UI owns
only frame/feedback presentation. Delayed-response browser checks cover the
actual compiled components, not just source patterns. Deep loading behaviour in
other apps and real Manager-to-FreshRSS latency remain separate work; the shared
snapshot update does not qualify those paths or deploy installed packages.

## Zotero setup boundary — 12 September 2026

Reviewed the setup controller, login adapter, local API relay, setup panels and
their image entry points. The relay now has its own entry point rather than
loading the controller, UI configuration and library-action dependencies.
Account-link persistence and observation have one server-side owner. Attachment
actions have a named module with their existing external contracts preserved.

This is not a completed review of all Zotero code. Deferred work:

- The legacy Docling importer remains in the Zotero plugin and behind compatible
  controller routes. Qualify supported local HTTP uploads with real attachments
  before replacing that route or migrating existing schedules to n8n.
- The attachment-index/cache and streaming download limits deserve a separate
  correctness review; extracting the module did not change those behaviours.
- Stored local authorization is not live validation of a revoked key. Test
  reauthorization after revocation and interrupted authorization on real Zotero.
- Classify expired upstream login sessions using the pinned Zotero response
  contract; transient observation errors currently retain and recheck the same
  session rather than risking a second account-link mutation.
- Initial sync, attachment-byte availability and Gateway activation are separate
  checks. Do not infer them from the controller's setup-state label.
