# Native Manager configuration package candidates — 25 September 2026

The runtime source remains `67a874ef3a2187d4257db008c04429d6450186a1`.
[Public GitHub run 36176875295](https://github.com/Jacob-Stokes/scholarserver-apps/actions/runs/36176875295)
passed its AMD64 job `108209518730`, ARM64 job `108209518331`, and all 17
multi-platform manifest jobs. Both native jobs built 19 recipes, passed their
named qualification gates and the Docling, Logseq and Zotero development gates,
then published their exact receipt images. The receipt artifacts are
`native-image-receipts-67a874ef3a2187d4257db008c04429d6450186a1-amd64`
(artifact `10883262318`) and the corresponding `-arm64` artifact `10883037220`.
Their build-receipt SHA-256 values match their qualification and development
summaries: AMD64 `a48de618f686e80f045a3e0fe613c295db3434ad94270b76af4dba244a912dd9`;
ARM64 `7cde531c176d7fd380711a80f859ed3049dd36c00c9d17f61b28d087e9d4b7cf`.

Anonymous read-only registry checks independently hashed each selected immutable
index, required exactly one Linux AMD64 and one Linux ARM64 child, and matched
both native child manifests, image-config digests, architecture, RootFS diff IDs,
`org.opencontainers.image.revision` and `com.scholarserver.source-digest` to
those qualified receipts. No image was pulled or run locally. Only the nine
recipes whose source fingerprints differed from the previous source lock were
re-pinned:

| Package candidate | Changed recipe | Verified immutable index digest |
| --- | --- | --- |
| `0.3.6-configuration.20260925.1` Docling | `docling-app` | `sha256:34e2fc52510bc96ad45616f72096758134eb0c8fc4608c3e3be31e28b6eb707b` |
| `0.1.1-configuration.20260925.1` FreshRSS | `freshrss-app` | `sha256:8513690f6eb3c443fbb5da2bf999d8c34136be433ff4b8b75ba1f2506a0c3f6f` |
| same FreshRSS candidate | `freshrss-reader` | `sha256:670bc55cea48f1d85686c2aac212cf101cae03346d1d01114f7cb3e72219bb86` |
| `0.1.1-configuration.20260925.1` Logseq | `logseq-helper` | `sha256:82dc37bdd21889f71ae101a8ffe3e25464a5d50744c03ffa3382b5d0572edee8` |
| `0.1.1-configuration.20260925.1` n8n | `n8n-app` | `sha256:da1395e65bf11e677261c2ec596dbf5ea91cdae1b50199058c12fb8f9ed20239` |
| `0.5.1-configuration.20260925.1` Obsidian | `obsidian-sync` | `sha256:d1533c9a660cec94d9663bdbcc3b57db90e5d54c39171b93c32ea0f0ab3523ba` |
| same Obsidian candidate | `obsidian-livesync-worker` | `sha256:ff20b292ebff60e6cb05f26c6abd2fa475dc1aa94d230b9571a8ec0315259b28` |
| `0.5.11-configuration.20260925.1` Zotero | `zotero-controller` | `sha256:082fb46567f6bb3b2c1cbdc14e2419db52c5e014c76427f3c758964ae60399e0` |
| same Zotero candidate | `zotero-automations` | `sha256:42012ad2eace68874c238ce221aa1c1621b40b13aa4fcf30ebcd0e9283e93579` |

FreshRSS reader's UI inputs had drifted from its previous source-lock record.
The LiveSync worker and Zotero automations images copy the shared controller
runtime package, whose package metadata changed with this runtime source; their
old source fingerprints therefore cannot describe the selected source. All
other image pins, package architecture declarations, permissions, storage and
variants remain unchanged. In particular, n8n and Obsidian still declare only
ARM64 package support; publishing both native children for a changed recipe
does not qualify their unchanged companion images for a wider package target.

The six `manage.20260925.1` source package identities remain in Git history.
The first configuration identities at those same patch bases remain in Git
history but were not imported. Manager's version comparator ranks the
`configuration` prerelease below an existing `manage` prerelease at the same
patch base. The six corrected identities above advance the patch number so
catalog updates can select them above both retained installed versions and
the imported `manage` packages. This changes package metadata only: no image
recipe source fingerprint or immutable image reference changes. These new
`configuration.20260925.1` identities are source candidates, not
published catalog packages. The complete 19-record source lock validates against
their manifest and Compose references. Native gates are not full installation,
real-account or encrypted-device-sync acceptance; existing release blocks and
project-vault documentation follow-ups remain. No package was imported or
deployed by this metadata pass.
