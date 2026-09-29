# Manager configuration source pass — 29 September 2026

This source candidate makes native Manager configuration the canonical setup
route for the six packaged app UIs. It is not a package publication, installed
version inventory, native-image qualification or fresh-install result.

## Changes

- All six UI entry points and their Configuration navigation return to the exact
  installation's Manager Configuration. Obsidian, Logseq, FreshRSS and Zotero
  overview bookmarks return to Manage. n8n's catalog and automation bookmarks
  retain their engine identity in Manager Automations; its explicit embedded
  setup route remains available. Docling queue/process and Zotero attachment and
  legacy automation workspaces retain their operational routes.
- Obsidian's pending first-device step now supports its existing non-destructive
  private-address repair. Only an explicit repair draft exposes the action;
  normal status carries the saved URL, never the URI or passphrase. Repair changes
  the revision, hides stale setup outputs and clears old device confirmation.
- Zotero's connected library now offers attachment setting edits and Sync now.
  The existing save/sync operations remain the mutation owners. Saved download
  and group-file settings participate in revision checks. WebDAV conditional
  fields and selected storage mode agree; account setup is not replayed.
- Completed Obsidian, Logseq, Zotero and FreshRSS connections omit setup counters.
  Independent Docling defaults/queue/service, FreshRSS appearance and n8n settings
  no longer pretend to be sequential setup steps. n8n recovery wording points to
  restoration instead of sign-in. Logseq explains how to copy the full sign-in
  return address. Security and recovery warnings remain visible.

## Verification

- `npm test`, `npm run lint` and the complete `npm run build` passed in the native
  local checkout. The test command now includes twelve navigation regressions,
  including duplicate installation IDs, preserved workspaces and n8n embedding.
- New controller tests cover Obsidian address-repair confirmation, rejected unsafe
  addresses, stale revisions and receipt deduplication; Zotero tests cover ready
  storage edits, sync availability, stale settings and unavailable desktops.
- A loaded-host test run exposed a pre-existing 10 ms real-clock assumption in
  Logseq's timeout test. It now admits the child before advancing a mocked clock,
  proving an unknown execution outcome rather than accidental queue expiry.
  No runner behavior changed. The full suite passed after this correction.
- The paired core parser accepted all 43 app-generated sections. Codex's in-app
  browser inspected all 43 at desktop width, with phone reviews for each app and
  all Zotero variants. The preview renders the real Manager form component with
  synthetic app-generated state; its mutations are blocked and evaluation is a
  fixed snapshot. This does not prove app state transitions or real account setup.
- The separate shared-form fault fixture retained edited choices after a rejected
  save and prevented replay of a persisted unconfirmed request after reload.
  Endpoint read-back failure kept recovery visible and removed its unconfirmed
  address from automatic field defaults. These are mocked browser checks.

Local logs are in the paired core checkout at
`.dev/manager-configuration-20260929/`. The core rollout checklist owns the
remaining build, publication, deployment and live acceptance work.

## Remaining work

Published manifest versions and image digests have not been rewritten. New
immutable versions, source-lock records and native image qualification are needed
before publication/deployment. Keep the final core/apps revisions together.

The standalone setup code remains available to independent source previews and
n8n's supported embedded setup. Remove obsolete panels deliberately once each
remaining operational workspace and embedded consumer is accounted for; do not
infer removal safety from the route tests alone. Zotero's legacy automation
workspace still has its own scheduling forms and needs a separate integration
review before claiming every automation workflow lives in Manager.

Files uses Manager's existing folder and AI controls; its runtime acceptance is
still to do. Paperless is an unreleased draft without an installable package.
No retained server, personal desktop profile, account or research dataset was
changed in this source pass.
