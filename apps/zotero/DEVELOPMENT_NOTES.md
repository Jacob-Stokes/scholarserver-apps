# Zotero development notes

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
