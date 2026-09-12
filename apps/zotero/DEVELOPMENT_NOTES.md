# Zotero development notes

## Image refresh checkpoint — 12 September 2026

Candidate `0.5.10-beta.3` selects five refreshed immutable AMD64/ARM64 images.
The local API bridge now packages all modules imported by its controller. Both
native runs start a real disposable Zotero desktop profile, verify bridge token
permissions and missing/wrong-token rejection, load the UI and retain bridge
identity through restart. The unconnected profile is deliberate. Account/library
sync is not claimed; `research-items` remains withheld from package grants pending
real-library acceptance.

Image publication does not publish the official catalog package or upgrade
Freelove. Exact source revisions, nineteen native image records, test scope and
cleanup are in [the refresh report](../../docs/package-refresh-20260912.md).
Earlier dated entries below describe their own checkpoints.


## 12 September 2026 — bridge image dependency closure

The first rebuilt local API bridge exited before listening with
`ERR_MODULE_NOT_FOUND` for `@scholarserver/controller-runtime`. Its Dockerfile
still copied only `controller.mjs`, although that file now imports the shared
atomic-file helpers, status model and bounded research metadata reader. The
controller image already copied those dependencies; the bridge recipe did not.

The bridge now includes the same imported modules without changing its command,
user, API boundary or data mounts. A recipe regression covers both entry points.
New native image and startup results belong to the package-build audit; the
first failed image is not qualified or published as the package update.

## Read-only research metadata — 9 September 2026

The controller has a candidate `research-items` action for n8n reading notes and
digests. It uses the existing authenticated personal-library API, not a database
reader. It bounds the date window to eight days and scans at most 1,000 recent
top-level items; an incomplete result fails rather than silently truncating.
Only keys, titles, creators, dates, DOI and Zotero links are returned. Notes,
attachment content, paths and credentials are not exported by this action.

Source tests verify filtering, bounds and field selection. Native n8n tests use
synthetic responses; the actual local/Web API action still needs acceptance.
Its package declaration is intentionally withheld until a new compatible
controller image/version is published. See `apps/n8n/RESEARCH_WORKFLOWS.md`.
Live 0.4.2 remains connected in linked-folder mode and was not upgraded. The old
automation worker, settings, schedules and history are unchanged.

## Catalog tags — 11 September 2026

The package manifest now declares the app-owned `References`, `Notes`,
`Documents` and `Files` tags under `presentation.details.tags`. The metadata-only
source candidate is `0.5.10-beta.2`; existing images, requirements and
runtime/security settings are unchanged. No package was published or deployed.
The Obsidian project-vault note was updated through Jacob Gateway on 11
September 2026; this repository's catalog-tags document remains authoritative
for the exact vocabulary.
