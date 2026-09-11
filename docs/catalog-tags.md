# Catalog tags

The catalog tags are application-owned metadata in each package manifest under
`presentation.details.tags`. They are short, task-oriented labels for filtering
the Applications and Catalog views. Tags do not change an app's capabilities,
permissions, setup requirements or runtime configuration.

## Controlled vocabulary

| Tag | Use when the app helps a researcher… |
| --- | --- |
| Automation | configure or run repeatable workflows |
| Documents | convert or work with document content |
| Files | read, write or move general files |
| Knowledge graphs | work with structured Logseq database graphs |
| News & feeds | subscribe to or read feed content |
| Notes | create, search or manage notes |
| PDF conversion | turn PDF files into Markdown derivatives |
| References | manage citations, collections or a reference library |
| Sync | keep app data aligned across devices or services |
| Vaults | manage an Obsidian vault |

The current package mapping is deliberately small:

| App | Tags |
| --- | --- |
| Docling | Documents, PDF conversion |
| Files | Files |
| FreshRSS | News & feeds |
| Logseq | Notes, Knowledge graphs, Sync |
| n8n | Automation |
| Obsidian | Notes, Vaults, Sync |
| Zotero | References, Notes, Documents, Files |

Generic deployment or audience labels such as `Self-hosted`, `Research`,
`Beta` and `AI` are intentionally not part of this vocabulary. The tags
describe usable tasks supported by the app rather than packaging status,
hosting, or broad audience claims.

## Metadata release inputs

Adding catalog metadata changes the package archive, so the source candidates
use new immutable prerelease identities rather than changing a published
package in place:

| App | Previous source version | New source version |
| --- | --- | --- |
| Docling | `0.3.5-beta.1` | `0.3.5-beta.2` |
| Files | `0.1.0-beta.2` | `0.1.0-beta.3` |
| FreshRSS | `0.1.0-beta.4` | `0.1.0-beta.5` |
| Logseq | `0.1.0-beta.1` | `0.1.0-beta.2` |
| n8n | `0.1.0-beta.4` | `0.1.0-beta.5` |
| Obsidian | `0.5.0-beta.1` | `0.5.0-beta.2` |
| Zotero | `0.5.10-beta.1` | `0.5.10-beta.2` |

These are unreleased source inputs. No catalog index, package archive, image,
release signing material, installation or deployment was changed. The existing
image digests and compatibility requirement remain unchanged. A future release
must publish and validate each new package version through the normal release
gates before the tags appear in a published catalog.

The corresponding Obsidian project-vault notes were updated through Jacob
Gateway on 11 September 2026. The repository development notes record the
same source-only status; no vault data is stored here.
