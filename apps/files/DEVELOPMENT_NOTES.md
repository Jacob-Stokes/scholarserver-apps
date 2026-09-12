# Files integration notes

## Image refresh checkpoint — 12 September 2026

Candidate `0.1.0-beta.4` selects a freshly built immutable AMD64/ARM64 worker.
Runtime source is unchanged; rebuilding establishes an explicit source/image
record rather than inferring an old image's source from its first git appearance.
Both native file/authentication checks and restart pass with disposable data.
This does not qualify a user's shared folders or a fresh signed Manager install.

Image publication does not publish the official catalog package or upgrade
Freelove. Exact source revisions, nineteen native image records, test scope and
cleanup are in [the refresh report](../../docs/package-refresh-20260912.md).
Earlier dated entries below describe their own checkpoints.


- User-requested built-in status is manifest-owned (`lifecycle.required`); core
  only implements that generic policy. No Files identifier in platform code.
- No Roots capability is advertised by the bridge. Client Roots would replace
  upstream's allowlist, which is inappropriate for server-selected storage.
- Shared folders never contain the service credential. No raw host mounts or
  host administrative APIs. The process is non-root with read-only rootfs.
- The upstream worker is persistent, not spawned per tool call. All clients use
  the same fixed grant, not client-controlled roots; operations queue serially.
- Retries after an unknown write outcome are manual. Cross-volume moves must
  either succeed intact or fail without losing either file; prove this in Docker.
- The generic storage contract currently provides fixed mount slots. The initial
  app offers two roots rather than inventing a private dynamic-mount mechanism.
- The exact npm release lacks LICENSE despite naming it in package metadata;
  retain the source-revision licence explicitly in the image and source.

Evidence: server.test.mjs runs the real pinned upstream worker through HTTP with
synthetic files. Native container and complete installation evidence is recorded
separately; source tests alone do not imply package publication.

7 September 2026: actual npm worker tests passed locally and in native AMD64
(Resolution) and ARM64 (Freelove) images. `test-container.sh` passed on both:
non-root, network disabled, read-only rootfs, read-only shared folder, blocked
credential access, writable synthetic note, failed-move source preservation.
The multi-platform image is published at digest
`fea262ef1cc4d8951e12ceee3ebaba915d03ddd6d0f9ee38d9c89d9bd7de43b6`.
Anonymous download on the disposable DigitalOcean host passed. A signed AMD64
installer created a separate `files-proof` installation on that existing test
host (not a fresh OS). Browser setup reached the dashboard with one healthy,
built-in Files instance without an app-install click. The Gateway discovered all
13 tools using the generated service credential. Browser-selected read-only and
writable synthetic storage grants worked; `proof-gateway.mjs` verified creation,
editing, moving, reading, glob search, and denied read-only/credential operations.
The public OAuth/Tailscale flow was deliberately not repeated: this test's Gateway
is local-only and reached through SSH, with normal Gateway-to-app authentication.

Direct Manager removal, stopping, and Gateway-disconnect requests all returned
400. Restarting Manager and Files preserved one instance, its desired revision,
both storage bindings and the synthetic note. Upstream search takes glob patterns
(`**/reviewed.md` for nested files), not an implicit substring match.

Beta.2 also restarts the service after an unexpected worker exit, failing pending
operations rather than replaying writes. `test-restart.sh` kills the identified
worker and verifies automatic Docker recovery, stable credentials and preserved
data on native AMD64 and ARM64. Its published image digest is
`cc59419df8d6beab5c65b3b3c600a13abb8b3eeb48e36bf591672856034c031c`.

The same disposable installation then passed a signed core upgrade from
`0.1.0-files-proof.1` to `.2` and an explicit Files beta.1-to-beta.2 package
upgrade. Both shared-folder grants and the synthetic note were preserved;
the Gateway proof passed again against the deployed beta.2 image. Detaching
the writable folder denied access immediately after applying the change;
reattaching it recovered the unchanged file without deleting storage content.
The final browser screen showed Running, Built-in and both folder grants, with
Update Files / Review change wording and no stop or remove action. Neighbouring
installations remained healthy. These are test deployments and published app
images, not publication of a new public ScholarServer core release.

## Catalog tags — 11 September 2026

The package manifest now declares the app-owned `Files` tag under
`presentation.details.tags`. The metadata-only source candidate is
`0.1.0-beta.3`; existing images, requirements and runtime/security settings are
unchanged. No package was published or deployed. The Obsidian project-vault
note was updated through Jacob Gateway on 11 September 2026; this repository's
catalog-tags document remains authoritative for the exact vocabulary.
