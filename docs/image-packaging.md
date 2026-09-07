# Application images and maintenance boundary

ScholarServer runs tested, digest-pinned application images with separate setup
controllers and MCP integrations. Prefer an upstream application's maintained
image. A third-party image is acceptable after reviewing architecture support,
permissions, data layout and upgrade behaviour. Building our own integration
does not justify repackaging its application.

## Inventory and decisions — 6 September 2026

| Image / service | Maintainer responsibility | Decision |
| --- | --- | --- |
| Docling service | Docling upstream | Keep direct digest-pinned image. |
| Docling controller | Our configuration, UI and integration | Keep separate. Contains Python, not Docling. |
| Obsidian vault API | Our Markdown-file API | Keep separate. MCP does not depend on Headless. |
| Obsidian MCP | Our AI integration | Keep separate. |
| Obsidian sync controller | Our setup UI and lifecycle | Remove bundled proprietary Headless. User-initiated npm download only. |
| CouchDB | Apache image plus our entrypoint/health check | Retain thin wrapper: reads generated credentials from a private shared file and starts non-root. No fork or rebuild of CouchDB. |
| LiveSync worker | Upstream CLI plus our lifecycle adapter | Retain thin wrapper: waits for first-device initialization, joins safely, publishes status and resumes from persisted settings. No fork of LiveSync. |
| Zotero desktop | Our assembly of official Zotero, desktop and plugins | Retain documented exception for native AMD64/ARM64, non-root/read-only startup and setup bridge. |
| Zotero controller | Our configuration/UI | Keep separate. |
| Zotero local API bridge | Our access boundary for localhost-only API | Keep separate; do not expose Zotero's API publicly. |
| Zotero automations | Our application-owned jobs | Keep separate. |
| Zotero MCP | Our AI integration | Keep separate; online-library mode needs no desktop. |

The maintained [LinuxServer Zotero image](https://github.com/linuxserver/docker-zotero)
was considered. Its `readme-vars.yml` currently declares only x86_64 and its
Dockerfile downloads the x86_64 archive. It is not a drop-in multi-architecture
replacement. A switch would additionally require profile/plugin migration and
desktop access checks. Revisit when those constraints change; do not silently
remove ARM64 or weaken hardening to reduce the number of Dockerfiles.

Removing the CouchDB/LiveSync wrappers today would require delivering the same
scripts through another mounted-artifact mechanism. That adds startup/migration
coupling without removing the integration code. Keep the small, pinned-base
wrappers instead of inventing a platform feature solely to eliminate them.

## Version policy

FreshRSS uses the same thin-wrapper exception as CouchDB: its official image is
the immutable base, with only our non-root startup/account adapter added. The
separate integration owns setup/UI/MCP; the upstream app owns its SQLite data.
There is no FreshRSS source fork or platform-specific FreshRSS code.

- Catalog releases select immutable image digests; no automatic upstream latest.
- Every application Dockerfile pins its base digest. JavaScript installs use
  committed lockfiles. Updates to those inputs are explicit source changes.
- Linux repository packages are not snapshot-pinned yet. Builds are **not claimed
  bit-for-bit reproducible**. Final image digests still make installs repeatable.
- Review security updates regularly, test replacements and publish a new catalog
  version. Pinning is not a reason to leave vulnerable dependencies indefinitely.
- A build-time gate inspects image layers before pushing; deleting prohibited
  software in a later layer does not make redistribution acceptable.

## Official Obsidian client

The controller contains our integration and open-source dependencies, but not
the proprietary client. An explicit **Install and connect** action downloads the
approved npm tarball directly to the user's server, verifies SHA-512 and installs
under the existing non-root user into `/official-client`. No arbitrary download
URL or version is accepted from the browser. There are no npm lifecycle scripts
or automatic latest-version downloads at runtime.

The installed client uses its documented CLI options. A small launcher receives
those options through stdin and sets them in-process before loading the unmodified
client, so passwords are absent from OS arguments and environment. Raw upstream
command output is not forwarded into controller logs or user-facing errors.

An image update that changes the approved client requires another explicit
download. Existing vault files, account configuration and enrollment remain in
their original data directories. An old bundled installation pauses official
sync until confirmation, then resumes its existing enrollment without sync-setup.
LiveSync neither downloads nor invokes Headless and cannot switch methods through
an onboarding request. Migration never selects a different sync method.

`official-client` is an explicitly excluded backup binding. Included runtime
metadata records the installed version/integrity; vaults and credentials remain
included. Restore to an empty server asks before reinstalling. Old exported
backups and outside whole-disk snapshots are not rewritten by this change.

This separates our distribution from a user's download; it is **not an approved
licensing workaround**. Managed hosting still requires written clarification.
No upstream maintainers have been contacted. References:
[licence](https://obsidian.md/license), [terms](https://obsidian.md/terms),
[developer clarification](https://github.com/obsidianmd/obsidian-headless/issues/39),
[unresolved redistribution question](https://github.com/obsidianmd/obsidian-headless/issues/52).

## Release verification

Keep source/unit checks, mocked browser checks, real container startup and actual
two-device sync distinct. A release block remains until new image digests and
the required native/migration/sync evidence are recorded. Pushing source does not
replace the old catalog images or change existing installations.
