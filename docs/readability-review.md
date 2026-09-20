# Readability review notes

## Docling and Logseq loading — 20 September 2026

Docling keeps queue, settings and file-read lifetimes explicit in its app owner.
Each has local feedback; authentication invalidates all private observations at
one boundary. Logseq extends its existing observer rather than adding a second
cache or polling owner. Shared feedback remains presentation-only. No workflow
rules moved into Manager or the shared UI package.

Deferred: Docling's screen is large and still owns both request coordination and
tab rendering. A later extraction should separate complete panels without moving
their drafts into competing owners. Logseq's private-address discovery and deeper
Obsidian/Zotero/n8n reads remain separate review items. Browser checks of selected
flows are not a completed architectural or application-wide review.

## FreshRSS observation and feedback — 20 September 2026

One app-owned status observer bounds and serialises status reads. It contains no
route registry, cross-app cache or form state. Appearance and reader-address
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
