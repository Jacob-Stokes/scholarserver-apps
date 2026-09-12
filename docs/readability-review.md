# Readability review notes

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
