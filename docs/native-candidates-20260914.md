# Native development package checkpoint — 14 September 2026

These are the seven complete source candidates, not metadata-only derivatives of
installed packages. The candidates remain unpublished in the official catalog;
all `RELEASE_BLOCKED.md` files remain in force. No installation or deployment is
performed by this checkpoint.

## Image evidence

[Native workflow 34878253357](https://github.com/Jacob-Stokes/scholarserver-apps/actions/runs/34878253357)
completed successfully at apps source `2917a0a2566ae378cc0da1e26c019aa7c44f8029`.
Both native build/qualification/publication jobs and all 17 index jobs passed.
Read-only registry verification, repeated before applying pins, checked all 19
immutable indexes and 38 native manifests/configs against the downloaded original
receipts: content hashes, Linux architecture, OCI revision, sourceDigest labels,
rootfs diff IDs and layer counts. Both four-scope qualification receipts and
three-app development summaries were bound to the original build-receipt bytes.

Original receipt SHA-256:

- AMD64: `77aa139c55a4a0413f13ee2e483e7c6d431e1c504c8a28dc9c5bc6a51a4a1518`
- ARM64: `b626d131bae6e3fb1a1615af05d0c8d58e6759e2f1ec7499c7d38ec9b63230ec`

The manifest/Compose pairs now select those indexes; `catalog/image-source-lock.json`
records their verified runtime-source fingerprints. The package-only pin changes
do not change any runtime image input. No further image build is needed for this
checkpoint. Unbuilt upstream Docling engine and Logseq browser selections remain
unchanged. n8n and Zotero regain ARM64 support on the qualified new images.

| App | Unpublished candidate version | App-owned images |
| --- | --- | --- |
| Docling | `0.3.5-beta.4.editorial.20260914.1` | 1 |
| Files | `0.1.0-beta.5.editorial.20260914.1` | 1 |
| FreshRSS | `0.1.0-beta.7.editorial.20260914.1` | 2 |
| Logseq | `0.1.0-beta.4.editorial.20260914.1` | 3 |
| n8n | `0.1.0-guided.20260912.2.editorial.20260914.1` | 2 |
| Obsidian | `0.5.0-beta.4.editorial.20260914.1` | 5 |
| Zotero | `0.5.10-guided.20260913.2.editorial.20260914.1` | 5 |

The read-only GitHub release inventory contained 41 releases and no assets with
these editorial candidate identities. Retain these unpublished versions; never
replace an archive once that exact package identity is published or installed.

## Metadata and shared snapshot ownership

`apps/<app>/package/scholarserver-app.yaml` is authoritative for
`presentation.details.description`, `presentation.details.tags`,
`presentation.icon` and `presentation.editorialIcon`. Assets resolve beneath the
same package directory. Preview adapters must load and project these declarations,
not maintain a second app-name/tag/description/icon table. No preview metadata,
runtime catalog overlay or metadata-only parallel package was introduced here.
All presentation declarations, assets, variants, permissions, setup, data and
compatibility minimums are unchanged by pin finalization.

Core `packages/ui` owns shared UI; apps `vendor/scholarserver-ui` is its deliberate
build snapshot with app-only additions. All 65 canonical runtime/font files match
byte-for-byte, and exports/dependencies agree. Core's `sharedUiState` remains the
live parity check. The existing vendor README and `scholarserverSource` package
label identify a nominal `0.1.0` source, not a verified published npm checksum.
They were not edited because the entire vendor directory is an image input.

[The generated snapshot receipt](shared-ui-snapshot-20260914.json) records all 68
tracked vendor files, including vendor-only additions, at the exact image source.
Its tree SHA-256 is `09c83ca1b00b284d66a6c3769518e3577c4276376791fbb993d41de777a994f7`.
The receipt specifies its digest calculation; it is development source evidence,
not a package registry attestation. Future canonical/vendor runtime changes need
fresh source fingerprints and affected native builds before new pins are accepted.

## Checks, archive handoff and remaining gates

Full `npm test` with a 512 MiB JavaScript heap, `npm run lint`, all 19 source-lock
checks, four pin-helper regressions and shared snapshot parity pass. Detailed
local evidence is under `.dev/full-development-20260914/`; CI artifacts retain
the native receipts and named UI checks. Source checks do not prove migration.

Development archive preparation uses the exact committed package directories,
without metadata edits, plus deterministic portable tar/gzip headers. Its manifest
records the source commit, image build revision, package IDs/versions, archive
SHA-256 and byte sizes, and per-file hashes. It is a local handoff manifest, not
a catalog index or release publication. Output is kept outside `catalog/dist`;
the official release script and its release-block refusal are unchanged.

Native evidence excludes full installation/retained-host acceptance, account,
encrypted sync, Gateway and real-library acceptance. The additional gate does
not qualify the Logseq sync adapter/upstream browser editor or Docling conversion
engine. Compatible-core minimum selection, final-package publication policy and
app-specific acceptance gates remain. Main owns storage/variant migration and
the approved local-storage Zotero transition, with existing data preserved.

The seven project-vault notes and app index need this checkpoint. Vault access
was not attempted in this apps-only consolidation scope; each app's development
notes records the pending update. Repository documentation remains authoritative.
