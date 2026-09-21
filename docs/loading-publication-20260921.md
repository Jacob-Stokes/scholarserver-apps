# Loading-model native image publication

## Deployment checkpoint — 21 September 2026

Core commit `62e6d5c650a3b663eede67772e3123f19d74df71` is deployed and accepted.
The package metadata/source snapshot at `d2d40fc` is pushed, and all six eligible
package imports completed with immutable versions ending `.20260921.1`.

| Instance | Imported version | Current live status |
| --- | --- | --- |
| `personal/freshrss` rev5 | `0.1.0-beta.9.launch.20260921.1` | Applied and verified; Ready |
| `personal/logseq` rev4 | `0.1.0-beta.4.editorial.20260921.1` | Applied and verified; Setup Needed |
| `personal/n8n` rev8 | `0.1.0-guided.20260921.1` | Applied and verified |
| `personal/obsidian` rev19 | `0.5.0-guided.20260921.1` | Applied; Recovery Needed limitation |
| `personal/obsidian-dev` rev4 | `0.5.0-guided.20260921.1` | Applied and verified; Connected/server running |
| `personal/zotero-sync-test` rev4 | `0.5.10-guided.20260921.1` | Applied; Setup Needed/local API unavailable |

Docling and personal Zotero remain blocked by the shared writable-folder recovery
gate. No bypass, grant, or permission change was used. These six live updates
are complete; the two held instances were not updated.

The latest project-vault read returned `Authentication required`. No vault notes
or index entries were written. Vault documentation updates remain pending for
all six app notes and this ledger until authenticated access is restored.

n8n's verified browser state retains the original two workflows, with the PDF
workflow enabled every minute and the diagnostic workflow paused with a six-hour schedule.
Personal Obsidian's browser acceptance remains limited to the Recovery Needed
state: its saved official enrollment default has no profile, the installed
variant stayed self-hosted LiveSync, and the restore mismatch guard is unchanged
between older qualified source `3b90bb773159202103b989cd43d9642eb226a1b6` and
current source `378305b3d5eaf23bde4eddcf6b1fe5f6957333dc`. This identifies an
older configuration mismatch rather than a repair or migration. The pre-update
enrollment mtime was `1787940277`. Obsidian-dev was ready with a LiveSync
profile before its update and now reports Connected and server running.

The six post-update checks confirmed healthy exact images and preservation of
data bindings, grants and unrelated state. FreshRSS is Ready; Logseq remains
Setup Needed; n8n retains its original two workflows, with the PDF workflow on
every minute and diagnostics paused with a six-hour schedule; Obsidian-dev is Connected and
server running but retains `gateway-integration-failed`; and Zotero-sync-test's
screen loads but remains Setup Needed because its local API is unavailable, so
no fresh setup acceptance is claimed and its same warning remains. Source tests
and runtime preservation checks do not erase these browser limitations.

Helper postchecks remain narrowly bounded to clearing the old warning and
confirming the exact pre-existing legacy `zotero-mcp` restart-cycle container
identity `8f588c2496c11f746b67670717995b9cf44fe51083c1671f63f6185191ef9ce4`;
its configuration and images must remain unchanged. No secrets are recorded.

Native source: `378305b3d5eaf23bde4eddcf6b1fe5f6957333dc`.
Successful [GitHub run 35591930384](https://github.com/Jacob-Stokes/scholarserver-apps/actions/runs/35591930384)
built, tested and published both AMD64 and ARM64 images and their combined indexes.
The earlier run `35585588901` passed native tests but failed during ARM64 registry
publication; it was not treated as a complete release.

The new publication script permits three total attempts for classified transient
push failures. It rechecks the remote immutable tag, source receipt and local
image identity before retrying; an already-published matching tag is accepted
without replay. Permanent errors and mismatched content stop the operation.
Focused pipeline regressions and the complete apps test suite passed.

Only seven source fingerprints changed: Docling's controller, both FreshRSS
images, Logseq helper, n8n integration, Obsidian sync controller and Zotero
controller. Their package pins and source-lock records now use the checked
published indexes. Six new immutable package versions end in `.20260921.1`;
other images, architectures, permissions, data, endpoints and variants remain
unchanged. Independent read resources, draft ownership and access denial remain
the existing shared loading contract, not a new app-specific loading engine.

Private receipts and raw registry verification evidence are retained by the
operator under `/private/tmp/scholarserver-loading-release.UC9pON`.
Remote per-instance evidence is under
`/var/lib/scholarserver-upgrades/loading-package-import-20260921/before/<instance>/checkpoint.json`
and `after/<instance>/verified.json` in the same stage. Local build/package
evidence and operator helpers are under
`.dev/loading-resolution-20260921/app-package-rollout`; runtime snapshots remain
on Freelove.
The core deployment map records exact retained-host identities and checkpoints.
Freelove's Manager loading update is deployed separately from these app packages.
Docling and personal Zotero retain an image-update block for writable shared
folders without qualified shared-data recovery; publication does not remove it.

Package import, authenticated review/Apply, retained-host browser acceptance and
project-vault notes are separate subsequent records. This is not an official
signed catalog release, a fresh installation or a new research/sync acceptance.
