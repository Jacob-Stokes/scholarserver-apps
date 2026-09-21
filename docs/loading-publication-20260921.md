# Loading-model native image publication

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
The core deployment map records exact retained-host identities and checkpoints.
Freelove's Manager loading update is deployed separately from these app packages.
Docling and personal Zotero retain an image-update block for writable shared
folders without qualified shared-data recovery; publication does not remove it.

Package import, authenticated review/Apply, retained-host browser acceptance and
project-vault notes are separate subsequent records. This is not an official
signed catalog release, a fresh installation or a new research/sync acceptance.
