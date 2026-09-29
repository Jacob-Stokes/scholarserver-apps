# Catalog tags

Use one tag for an app's primary purpose. These app-owned package labels filter
Applications and Catalog; they do not describe every capability. Keep features
such as sync, PDF conversion and graph structure in app descriptions.

| App | Tag |
| --- | --- |
| Docling | Documents |
| Files | Files |
| FreshRSS | News & feeds |
| Logseq | Notes |
| n8n | Automation |
| Obsidian | Notes |
| Zotero | References |

The first-party vocabulary is Automation, Documents, Files, News & feeds, Notes
and References. Reuse these categories; introduce another only for a genuinely
different primary purpose. Package contract checks require one category per app.
Do not add implementation, deployment or audience labels such as Vaults, Sync,
Knowledge graphs, AI, Self-hosted or Research.

## Source checkpoint — 29 September 2026

Obsidian, Logseq, Zotero and Docling reserve new `manager.20260929.2` package
versions for this metadata change. Files, FreshRSS and n8n already use one primary
category and retain their package identities. Published package versions are
immutable. This source pass does not change installed tags or publish packages;
the pending qualified-image/package batch must carry the updated metadata.

Paperless is an unpackaged draft and has no catalog tag to change yet. Its primary
category should be Documents when it becomes installable. The 11 September
multi-tag taxonomy is superseded by this primary-purpose rule.
