# Docling development notes

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
