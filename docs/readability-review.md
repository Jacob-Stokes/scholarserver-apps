# Readability review notes

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

The shared read resource/hook now bounds and serialises status reads. The
app supplies its parser and cadence, not a route registry or cross-app cache. Appearance and reader-address
forms keep their own drafts; their reads can fail independently. Shared UI owns
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
