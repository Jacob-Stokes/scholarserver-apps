# Package build audit — 2026-09-12

This is a read-only source audit for `files`, `freshrss`, `docling`, `obsidian`,
`zotero` and `logseq`. It records source and package evidence only. No image was
built, pushed, installed or deployed, and no live deployment was queried.

The n8n work remains with the main agent. Checkpoint `71d9ce4` records the n8n
cards/search/app/tags/sorting source, mock-browser and full-app checks as
passed; rebuild qualification and publication are still in progress and are
not marked complete here.

## Rebuild decision

| App | Current package candidate and image references | Required rebuild set | Unchanged upstream or wrapper images | Drift / acceptance note |
|---|---|---|---|---|
| Files | `0.1.0-beta.3`; `scholarserver-files@sha256:cc59419df8d6beab5c65b3b3c600a13abb8b3eeb48e36bf591672856034c031c` ([manifest:4,37](../apps/files/package/scholarserver-app.yaml)) | None | The single custom worker image and Dockerfile are unchanged for the current metadata candidate. | Beta3 is documented as metadata-only; package publication and fresh acceptance remain to be done ([notes:60-67](../apps/files/DEVELOPMENT_NOTES.md)). |
| FreshRSS | `0.1.0-beta.5`; reader `@sha256:592c6a13bf150d5f718f2d385e2e33dc76c5e1898a3d32ebe930ad9fc3daf595`; integration `@sha256:393fdc5c870e24d4bdffb4eaefb61eaeb60eca029d334d1526e2e7b17a1d6f99` ([manifest:4,24,26](../apps/freshrss/package/scholarserver-app.yaml)) | `scholarserver-freshrss-reader`, `scholarserver-freshrss-app` | The FreshRSS upstream base remains unchanged and pinned. | Both custom Dockerfiles embed the vendor shared UI and build it ([reader Dockerfile:1-14](../apps/freshrss/reader/Dockerfile), [integration Dockerfile:1-21](../apps/freshrss/integration/Dockerfile)); the shared Sonner change is therefore absent from these image digests. |
| Docling | `0.3.5-beta.2`; upstream `docling-serve-cpu@sha256:32ba1a1dded8d8fd21f9d8da1b9837e04cfee164ef891d9513174c3d989dcee9`; controller `scholarserver-docling-app@sha256:950265066352d627c86397b34ecc1b6bf50daf448d53ce0d6dfbd802dcbf4950` ([manifest:4,37,39](../apps/docling/package/scholarserver-app.yaml)) | `scholarserver-docling-app` | `docling-serve-cpu` is upstream and unchanged. | The controller image embeds the UI ([Dockerfile:1-20](../apps/docling/controller/Dockerfile)); shared screen/toast changes after the digest baseline require a rebuild. Remaining documented review includes discovery and operation lifetimes; OCR/table fidelity was not claimed as complete ([notes:3-13,31-43](../apps/docling/DEVELOPMENT_NOTES.md)). |
| Obsidian | `0.5.0-beta.2`; sync `@sha256:eb1408f13fbb09185b8e58df8b6efb7b11030a64640940dfa021018b104233eb`; API `@sha256:6a66315f92529a13e9abcd87a2e14960ba2bdc5f6b16bdf2117054a1ac129f8d`; MCP `@sha256:73c593708e2ce46e58f0e0c7c6537863da9b25bcffb082630d1c2a721b1537f0`; LiveSync CouchDB `@sha256:ff63b220d37c4b22cd57fc29dee84d873c83151f2e3516a894a72baf5b714fab`; worker `@sha256:0fbea3fda311380b5f78bc8af756c1f961f87ae68c72ab045774c826a1f819a5` ([manifest:4,70-78](../apps/obsidian/package/scholarserver-app.yaml)) | `scholarserver-obsidian-sync` | API, MCP, LiveSync CouchDB and LiveSync worker images. | The sync image embeds the UI ([Dockerfile:1-39](../apps/obsidian/sync/Dockerfile)) and has post-candidate stale-status, research-note, UI-copy, Sonner and clipboard changes. The candidate source/image qualification is tied to `c781a54`; the package remains release-blocked by the app’s explicit current block file ([RELEASE_BLOCKED:1-9](../apps/obsidian/RELEASE_BLOCKED.md)). |
| Zotero | `0.5.10-beta.2`; desktop `@sha256:f0232533289dbfa7d529bef04c60fc80a362386d75d57ad4c287d937e0ace09f`; controller `@sha256:8ced86982150c54a77411b2006335fdb1449e0cc27654e5001d7c117d99f2f80`; bridge `@sha256:f14acd9afc569949154de83273560396f81e2d651969843f0081a18d416c9a40`; automations `@sha256:4b0ac036beede4f1b9a65a0bef33b876389bccd93a489d5d676e850a1e34d7af`; MCP `@sha256:339c2028b55988a6ba36347f09114c53bc33957b541fb198f0711bc5c2bd07a6` ([manifest:4,69-77](../apps/zotero/package/scholarserver-app.yaml)) | All five custom images: `scholarserver-zotero-desktop`, `-controller`, `-local-api-bridge`, `-automations`, `-mcp` | Zotero archive/version checksums remain pinned upstream inputs. | Controller and automation behavior changed for atomic writes; controller/status-model and shared UI changed; Dockerfile bases and lockfile installation changed. The `research-items` action remains withheld pending a new controller image/version ([notes:3-17](../apps/zotero/DEVELOPMENT_NOTES.md)). |
| Logseq | `0.1.0-beta.2`; helper `@sha256:484f86f884af813f8d891633a9cbaaf01c5a7cf97cc7084c5025087e3d053cb8`; MCP `@sha256:a530dcb8944813f09fb07cae90d5cffd01518a10d43a75443daa914940425c8d`; sync `@sha256:46a51cf9720d91f9ed7031f281030de08eb160521ed31d54733fdda0b7b97425`; editor upstream `logseq-selfhost-web@sha256:46d425b4eafdf5552b22ecefb58ed37d547460f47bec7f25ab77f75520ac4a1d` ([manifest:15,108-114](../apps/logseq/package/scholarserver-app.yaml)) | `scholarserver-logseq-helper` | Logseq MCP, sync adapter and upstream editor images. | The helper embeds the current UI and setup code ([Dockerfile:1-46](../apps/logseq/helper/Dockerfile)); setup serialization/partial-setup handling, UI copy and Sonner changes follow the published baseline. The workflow and native proof omit package publication for this candidate. |

In short: rebuild 10 custom images—FreshRSS 2, Docling 1, Obsidian 1, Zotero
5, Logseq 1. Reuse Files and the unchanged upstream/wrapper images listed
above. At the audit baseline, Logseq and n8n were omitted from
`scripts/build-native-images.sh` and the normal image workflow; the separate
Logseq candidate workflow was proof-only. The current working tree contains
concurrent main-agent edits that add both apps to those build lists. Those edits
are outside this audit and their build results are not assessed here.

## Provenance and uncertainty

The following is the strongest source evidence found; a digest’s first git
appearance is not treated as its build source unless release evidence says so.

| App/image group | Git/development evidence | What is known |
|---|---|---|
| Files | Current digest first appears at `c9f0180`; beta3 notes say runtime/images were unchanged ([notes:60-67](../apps/files/DEVELOPMENT_NOTES.md)). | The current image is reusable for metadata-only beta3. An explicit source commit for the published image build was not recorded. |
| FreshRSS | Current reader and integration digests first appear at `b1d61ee`; beta4 was the last documented published package ([notes:133-139](../apps/freshrss/DEVELOPMENT_NOTES.md)). | First-record commits are evidence of git recording only. The exact image build source commit is unknown. |
| Docling | Upstream digest first appears at `d3e3e2b`; current controller digest first appears at `4a14a49`. | Upstream provenance is the pinned upstream digest. The custom controller’s exact published-image source commit is unknown. |
| Obsidian | Candidate image references are documented as native AMD64/ARM64 outputs of `c781a54` ([packaging verification:50-54](../docs/packaging-verification.md)). | This is explicit candidate-build provenance, not proof of catalog publication. The older stable `0.4.6` image source commit is not recorded. |
| Zotero | Desktop digest first appears at `974b70b`; controller at `4a14a49`; bridge/automations/MCP at `865ff99`. | These first-record commits do not prove build provenance. The exact source commit for the published image set is unknown. |
| Logseq | Digest group first appears at `eb526d6`; release evidence records final integration images built from `e7d3fce` ([release:8-18](../apps/logseq/BETA_RELEASE.md)). | `e7d3fce` is explicit release-build evidence. It does not establish that later source changes are present in the current digest refs. |

## Metadata and release boundary

Commit `3457e39` changed the package versions/tags for all six apps. The catalog
guidance requires metadata changes to use new immutable prerelease package
identities ([catalog-tags:40-60](../docs/catalog-tags.md)); each app’s notes
describe its current version as an unreleased metadata candidate. A package
candidate is not published merely because its manifest points at an existing
image, and an existing image does not contain later UI/controller source.

Files can retain its current image for the metadata-only candidate. The other
five apps need rebuilt custom images before a runtime-inclusive package is
qualified. If a candidate package identity has already been published by a
later process, do not overwrite it: select a higher immutable version. The
exact next versions are intentionally not inferred here.

No live deployment is part of this audit. Source tests, image contents, native
startup, package installation and authenticated live acceptance remain separate
evidence classes.

## Build and test constraints

`scripts/build-native-images.sh:24-30` pushes after each build, so it is not a
safe command for this read-only audit. The audit baseline omitted Logseq and
n8n from that script and from the standard image workflow matrix; concurrent
working-tree edits now add them, but are not part of this record. Do not use
emulation, QEMU or Rosetta. Resolution is AMD64/rootless but has only about 2 GB free;
Docling declares a 4 GiB minimum runtime, so it is not an adequate full
acceptance host. Mac Docker is off and the available local builder is ARM-only.

When build authority and native capacity are available, run each image directly
without push, using the repository root as context unless the Dockerfile’s
directory is shown as the context:

```sh
cd /Users/jacob/scholarserver-apps
docker build --pull -f apps/freshrss/reader/Dockerfile -t audit/freshrss-reader:local .
docker build --pull -f apps/freshrss/integration/Dockerfile -t audit/freshrss-app:local .
docker build --pull -f apps/docling/controller/Dockerfile -t audit/docling-app:local .
docker build --pull -f apps/obsidian/sync/Dockerfile -t audit/obsidian-sync:local .
docker build --pull -f apps/zotero/controller/Dockerfile -t audit/zotero-controller:local .
docker build --pull -f apps/zotero/desktop/Dockerfile -t audit/zotero-desktop:local apps/zotero/desktop
docker build --pull -f apps/zotero/local-api-bridge/Dockerfile -t audit/zotero-bridge:local .
docker build --pull -f apps/zotero/automations/Dockerfile -t audit/zotero-automations:local .
docker build --pull -f apps/zotero/mcp/Dockerfile -t audit/zotero-mcp:local .
docker build --pull -f apps/logseq/helper/Dockerfile -t audit/logseq-helper:local .
```

These commands were not run. Before any package publication, use a disposable
native checkout and run the scoped source checks:

```sh
npm run test:packaging
npm run test:ui
npm run test:logseq
npm run lint
npm run build
```

Then perform image-content, native AMD64/ARM64 startup, package archive,
installation and authenticated acceptance checks separately. Publication and
deployment are outside this audit.
