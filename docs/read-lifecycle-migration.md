# Read lifecycle: adoption and resume checklist

## Current checkpoint — 20 September 2026

Core owns `packages/ui/read-resource.ts` and `use-read-resource.ts`; the vendor
snapshot contains their exact bytes. Manager, FreshRSS status and Logseq status
use that same implementation. Docling's queue, defaults and PDF discovery now
also use it, with one app-owned access scope. The previous app-specific observer loops were
removed. `ApplicationScreen` and `SectionFeedback` continue to own presentation
only. No release manifest, image, permission or installed application changes.

The contract and worked example are in core `packages/ui/README.md`. A new app
supplies its read function and polling cadence, creates a stable resource, renders
its snapshot, and uses shared feedback. It does not copy an AbortController loop,
timer, stale-response guard or a second set of loading/status state variables.

| Read surface | Current state | Next bounded work |
| --- | --- | --- |
| Manager informational reads | Shared implementation; reviewed registry remains Manager-owned | Maintain canonical unit and React/browser contracts |
| FreshRSS status | Migrated; app owns preparation/idle cadence and parser | Retest with the next native app candidate |
| Logseq status | Migrated; drafts/discovery clear on access loss; setup responses remain component-local | Retest with the next native app candidate |
| FreshRSS address/appearance | Existing bounded readers and individual feedback | Adopt resource per panel; propagate access loss to sibling readers; keep appearance draft separate |
| Docling queue/defaults/PDF discovery | Migrated; app-owned access scope, retained files, separate OCR drafts and canonical saved defaults | Qualify the next native app candidate; conversion commands remain outside read resources |
| Logseq private address | Existing app-owned endpoint workflow | Separate informational route discovery from provisioning and partial-write recovery |
| Obsidian setup/status | Existing app-owned polling and draft guards | Classify status first: LiveSync onboarding includes a setup URI/passphrase; never cache the entire response in a retained owner |
| Zotero setup/status | Existing app-owned polling and draft guards | Separate informational status from account/session/storage credential state before adoption |
| n8n configuration/setup | Existing app-owned workflows; Manager collections already independent | Inventory read sections; retain per-vault consent and uncertain-workflow reconciliation, not cached approval tokens |

## How to resume

1. Check both worktrees and this ledger. Preserve unrelated root package/lockfile
   edits; they currently reference an absent Paperless integration workspace.
2. Take the next row's **one independent read section**, not an entire app rewrite.
   List its payload fields, owner lifetime, authentication scope and action guards.
   Exclude passwords, one-time credentials, review tokens and editable drafts.
3. Reuse `ReadResource` / `useReadResource` and the existing feedback slot. Remove
   the old read owner/timer once all its callers move; do not leave both running.
   Keep requests, validation, cadence and write reconciliation in the app.
4. Exercise cold load, retained refresh, genuine empty result, failed refresh,
   unmount/return, superseded response, hidden/visible, sign-in expiry and explicit
   retry. Then exercise the app's failed save and unsaved-draft behaviour. Never
   replay a mutation to make a read test pass.
5. Update this row, relevant development notes and evidence. Run focused checks,
   full available source gates, then commit/push a coherent checkpoint. Only after
   the batch is ready qualify changed native images and request deployment.

## Repeatable checks (no Docker)

From core:

```sh
pnpm check
node scripts/check-read-resource.mjs
```

From this repository:

```sh
node scripts/check-shared-ui.mjs --core-ui /path/to/academic-system/packages/ui
npm run test:ui
node --test apps/freshrss/ui/test/reader-status.test.mjs
npm test -w apps/docling/ui
npm test
```

For compiled browser checks, run the relevant UI builds first, then
`node scripts/check-app-screens.mjs` and
`node apps/freshrss/ui/test/loading-browser.mjs`. These scripts accept
`SCHOLARSERVER_BROWSER_MODULES` for an external Playwright installation. They use
synthetic APIs and isolated loopback/browser resources, not installed apps.
Check the core development disk budget before builds. UI builds are not Docker
builds and do not publish packages.

The full `npm test` gate is currently blocked by the unrelated missing Paperless
workspace. Do not silently remove that workspace or report a full suite pass.
Keep source tests, compiled synthetic browser checks, native-image qualification,
publication and Freelove acceptance separate in every checkpoint.

## Verified source checkpoint

Core `pnpm check`, the shared React browser contract, the Manager UI build, apps
`npm run test:ui`, FreshRSS parser/cadence tests, Logseq/FreshRSS UI builds and
both compiled app browser suites pass. The shared snapshot check confirms 70
runtime/font files match core byte-for-byte. Full apps `npm test` was attempted
and stops at the existing missing Paperless workspace. These results use synthetic
responses; no images or installed services were changed.

## What resumable means here

A retained, reviewed resource can be observed again without rebuilding its state;
stale reads refresh and obsolete responses cannot replace newer data. Reload
still asks the server for status. This does not persist drafts/passwords, resume
an interrupted server process, or replay an uncertain save. Those are separate
app-owned contracts. Existing installed packages do not hot-update themselves
when shared source changes.

Project-vault app notes/index remain pending; no vault connector was used for
this local source pass. Repository notes remain the implementation record.

## Docling continuation checkpoint

The app-local `docling-reads.ts` contains payload types, requests, queue cadence
and the three-reader access scope. Lifecycle mechanics come from shared UI; no
new timer/cache framework was introduced. The UI derives snapshots directly and
keeps conversion-default/job drafts separate. After access denial, explicit retry
creates a fresh scope; late completions keep the retired, blocked owner.

Verification: eight focused Docling tests, UI typecheck/build, the full compiled
app-screen browser script, apps `test:ui`, core `pnpm check` and shared snapshot
parity pass. Docling's tests now run inside `test:ui` as well as through its own
workspace test command. Browser checks include defaults retained through tab
changes and an actual background settings refresh, accepted defaults after
reload, and clearing attachment drafts on access recovery. Full apps `npm test`
still stops at the existing absent Paperless workspace; no unrelated root
manifest/lockfile edits were included in the checkpoint.

Next: adopt shared resources in FreshRSS's address/appearance panels, including
app-wide denial propagation. Then review Logseq private-address discovery and
classify sensitive Obsidian/Zotero setup responses before retaining any data.
