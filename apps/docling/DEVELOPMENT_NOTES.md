# Docling development notes

## Editorial icon source candidate — 14 September 2026

Purpose-copy follow-up: `presentation.details.description` now reads
“Convert PDFs into Markdown for your research.” Existing tags, unpublished candidate
version and image pins are unchanged. This describes purpose, not setup or new
capabilities. The two canonical font files were also mirrored into vendor.
Vault-note follow-up is pending under this pass's no-remote-changes boundary.

New unpublished source identity `0.3.5-beta.4.editorial.20260914.1` adds an app-owned
`artwork/editorial.svg` and a locked transparent PNG declaration under
`presentation.editorialIcon`, with separate ScholarServer CC BY 4.0 attribution.
The prior `0.3.5-beta.3` package identity is not rewritten. Original
icon bytes, image pins, Compose, app capabilities, grants and data/setup contracts
are preserved. The explicit release block remains until compatible-core/package
and changed native-image/browser acceptance are qualified; no publication or
retained-host update is implied. See [artwork, source versions, checks and deployment
options](../../docs/editorial-icons.md).

The shared vendor snapshot now matches main's reviewed canonical runtime files,
including editorial typography/themes and the browser-local icon preference.
Any image incorporating the changed shared UI must be rebuilt and qualified;
the preserved pin must not be described as containing these source changes.

Bounded asset/package and n8n UI checks pass; the seven packages also pass the
current core loader/schema check. Full `npm test`, final-image and authenticated
browser acceptance remain main-owned gates. All six app UI typechecks and the
n8n UI build pass; the build emits original/editorial rasters as separate files.
This checkpoint was appended to the existing project-vault app note through
Jacob Gateway; the app index was updated with the same source-only boundaries.

## Image refresh checkpoint — 12 September 2026

Candidate `0.3.5-beta.3` selects the rebuilt immutable AMD64/ARM64 controller;
the upstream conversion engine pin is unchanged. Both architectures pass built-UI
save, expiring toast, invalid-input rejection and settings preservation after
restart. On AMD64 the real pinned engine also converts a synthetic PDF to
Markdown with its source text verified. ARM64 engine execution, OCR/table fidelity
and a real research-library workflow remain outside this check.

Image publication does not publish the official catalog package or upgrade
Freelove. Exact source revisions, nineteen native image records, test scope and
cleanup are in [the refresh report](../../docs/package-refresh-20260912.md).
Earlier dated entries below describe their own checkpoints.


## n8n PDF watcher acceptance — 10 September 2026

The installed Docling engine/controller images passed a real n8n-triggered PDF
conversion in an isolated installation. Zotero and Docling shared one local
rclone test storage location. The generated Markdown was imported by Zotero and
its text verified. Repeated and deliberately overlapping n8n scans retained one
conversion job with one attempt. Scheduling and retries remained in n8n; Docling
owned conversion execution and its existing source-hash/profile deduplication.
See [test chronology and limits](../n8n/PDF_WATCH_ACCEPTANCE.md). No production
Docling installation or immutable package was changed. OCR was off; this does
not establish scanned-PDF or complex-table fidelity.

## Setup read ownership — 7 September 2026

The conversion-defaults form previously allowed saving its initial false value
before the server settings had arrived. The same delayed read could replace a
user's OCR choice for a new job. The browser regression failed on the original
build because Save defaults was enabled while that response was held.

The form now requires successfully loaded defaults before editing or saving them.
Settings reads have a timeout, explicit retry and cancellation on unmount; late
defaults do not replace a job choice the user has edited. Failed reads no longer
silently display a saveable default. This does not retry writes automatically.

Status reads now have one current owner: an action's refresh supersedes an older
poll, routine polls do not overlap, and unmount cancels in-flight status reads.
An empty/unreadable successful HTTP body is treated as an error, not success.

Verification uses the apps test suite and synthetic browser responses for delayed
defaults, failed-read retry, draft preservation and an older poll completing after
queue pause. These are UI/source checks, not a new container conversion or published
package. File discovery and remaining operation lifetimes still need review.

## Catalog tags — 11 September 2026

The package manifest now declares the app-owned `Documents` and `PDF conversion`
tags under `presentation.details.tags`. The metadata-only source candidate is
`0.3.5-beta.2`; existing images, requirements and runtime/security settings are
unchanged. No package was published or deployed. The Obsidian project-vault
note was updated through Jacob Gateway on 11 September 2026; this repository's
catalog-tags document remains authoritative for the exact vocabulary.
