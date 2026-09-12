# FreshRSS integration

## Image refresh checkpoint — 12 September 2026

Candidate `0.1.0-beta.6` selects freshly built immutable AMD64/ARM64 reader and
integration images, including the current shared UI/notification code. Both native
runs pass setup, all six MCP tools, unauthenticated rejection, reader failure and
recovery, restart and stopped-filesystem backup/restore with synthetic feeds.
No real feed account or cross-host Manager restore is claimed.

Image publication does not publish the official catalog package or upgrade
Freelove. Exact source revisions, nineteen native image records, test scope and
cleanup are in [the refresh report](../../docs/package-refresh-20260912.md).
Earlier dated entries below describe their own checkpoints.


## Ownership and decisions

- FreshRSS 1.29.1 is the pinned official multi-architecture base of a thin
  startup wrapper. No FreshRSS source is changed or rebuilt.
- SQLite is sufficient for a personal reader. Its database, subscriptions,
  article state and configuration stay in FreshRSS's data directory.
- A separate ScholarServer integration provides setup, shared application UI and
  MCP over the existing Google Reader API. It does not read the SQLite database.
- The upstream entrypoint needs root and accepts passwords in environment/argv.
  Our small startup adapter instead runs Apache and upstream PHP code as
  UID 1000 with a read-only image. Setup secrets travel through private files.
  The adapter is version-coupled and must be tested when FreshRSS is upgraded.
- An initial mounted adapter proof worked, but the catalog intentionally forbids
  arbitrary entrypoint overrides. The established CouchDB thin-wrapper pattern
  is simpler than adding a platform exception or mutable executable volume.
- The reader supports sub-path hosting. It does not need a dedicated Tailscale
  hostname or a second account with a cloud service.
- Existing MCP candidates were reviewed (ni-c/freshrss-mcp, ChrisLAS/freshrss-mcp,
  ivanlee1999/freshrss-mcp). None is an established official FreshRSS integration.
  This first slice uses our existing authenticated MCP transport and a small
  Google Reader API adapter. No new MCP framework or API server is introduced.

## Verification

2026-09-07: AMD64 native proof passed setup while the reader was unavailable,
six real HTTP MCP tools, browser sign-in, synthetic feed ingestion, read/star
changes, unauthenticated MCP rejection, restart, and stopped-filesystem restore.
The browser showed the article starred through MCP. Idle snapshot with one
synthetic article: about 39.5 MiB reader and 34.9 MiB integration; not a capacity
benchmark. Source suite (`npm test`), lint and core package validation passed.

The real MCP SDK rejected a refined Zod root schema: our existing converter did
not retain its object type. Keep the input object schema explicit and validate
the cross-field state choice in the handler. A regression checks every exported
schema through the actual converter.

Native AMD64 and ARM64 passed the same recovery, six-tool MCP, restart and
stopped-filesystem restore tests. Both final images are public and digest-pinned.
The real Freelove browser flow passed catalog installation, account creation,
private address selection, native login and subscription creation. All six MCP
tools then used that browser-created feed; its read/star changes appeared in the
reader. Only disposable data was used; existing FreshRSS installations were not
touched.

The real browser proof caught two issues missed by the initial container test:
compressed responses must not retain compression headers after the outer proxy
decodes them, and the upstream base URL must be inferred from our trusted proxy
headers rather than hard-coded to an internal hostname. Native tests now cover
encoding and subpath links. Manager also needed generic native-form forwarding
and exact same-origin Fetch Metadata support for privacy-preserving forms;
core commit d005b98 covers that without application-specific code.

Outstanding: Freelove's older development Gateway uses a different Compose
project from the production executor's discovery contract. Automatic Gateway
attachment fails there for new apps, including this candidate. The authenticated
FreshRSS MCP endpoint itself passed, but a public ChatGPT/Claude OAuth session
was not verified. Public Cloudflare and the optional Authentik layer were not
exercised in this pass. This is a beta, not a full release-readiness claim.

## Published update and managed recovery drill

Catalog release v0.2.28 publishes package 0.1.0-beta.2. The normal Manager UI
downloaded the public package and updated the disposable beta.1 installation.
The account, subscription and starred article survived; both running image
digests matched the published package. The update correctly required a verified
backup first. Freelove's legacy development host lacked Restic, so its standard
distribution package (0.16.4) was installed and an application backup passed
verification.

The subsequent managed restore restored the files and restarted the reader, but
Gateway reconnection failed because of the development layout mismatch described
above. The transaction was committed but pending, not rolled back. This is not a
successful complete managed-restore test. After verifying that the recovery
journal referred exclusively to personal/freshrss-e2e, it was removed from active
recovery during disposable-test cleanup. No real application recovery record was
changed.

The disposable application, synthetic data, its backup snapshot, test containers
and temporary build credentials were removed. No paid test server was created.
The published package remains available in the catalog. Public AI attachment and
complete managed recovery still need a compatible Gateway deployment test.

## Gateway follow-up, 7 September 2026

Core commit ac75f9e aligns the development Compose identity and managed paths
with the executor's existing installation-scoped discovery rules. Freelove was
migrated without reinstalling or changing existing application data. A fresh
disposable installation attached automatically, exposing a second issue:
FreshRSS's bare tool names were rejected by the Gateway namespace allowlist.
Direct SDK tests had not exercised that allowlist. Package 0.1.0-beta.3 (catalog
v0.2.29) prefixes all six tools with freshrss_; source and native tests now assert
that contract explicitly. Both native architectures passed again.

The public package updated through the normal Manager API. The running Gateway
reported all six tools available alongside the existing integrations. A subsequent
managed application backup and restore completed with a committed, done journal;
an authenticated feed request from the Gateway container succeeded afterward.
This supersedes the earlier layout-blocked recovery result, but does not establish
public OAuth/AI-client or cross-host disaster-recovery coverage.

## Optional reader appearance, 7 September 2026

The thin reader image now includes a normal FreshRSS system extension. It appends
our built CSS/JS through `FreshrssInit`; upstream source and native display
preferences are untouched. Configuration owns one persisted choice in runtime
data: ScholarServer (default) or FreshRSS original. The latter appends no assets.
Feeds, reading state, extensions and native logo configuration are not replaced.
Runtime data is already included in the existing backup contract.

Colours and fonts come from the shared UI build snapshot, not a second palette
table. They follow this browser's preference when the reader shares the dashboard
origin. An independently published hostname has separate browser storage and uses
the default palette; this is not server-wide theme propagation. Native Origine
is the supported base for matching. Arbitrary third-party FreshRSS themes are not
promised to match; choose FreshRSS original to use them unchanged.

Two integration details mattered: FreshRSS indexes enabled extensions by their
metadata name, not their PHP entrypoint; and its base CSS has separate `--frss-`
colour variables in addition to Origine's variables. A dark-mode screenshot
caught black article titles; the browser proof now checks their contrast.
Branding is DOM-only because mutating system configuration during rendering could
otherwise be persisted by a later unrelated native settings save.

Native AMD64/ARM64 tests cover default injection, original-mode removal, six MCP
tools, interrupted setup, restart and stopped-filesystem recovery. The disposable
browser proof covers native login, real font downloads, live palette changes,
dark title contrast, mobile overflow, original-mode restoration and failed-save
draft preservation/retry. It uses synthetic feeds and a test-only account.
No real FreshRSS data or unrelated host services were changed.

Published as package 0.1.0-beta.4 in catalog v0.2.30, with digest-pinned native
images. Anonymous image-manifest access and the public bundle checksum passed;
Freelove imported the package through its ordinary catalog refresh. Core commit
e87c34b fixes removed-instance history pinning an obsolete catalog version and
was deployed to the existing Manager without changing application versions or
settings. This appearance pass used direct disposable reader containers, not a
new full-platform installation or a new public OAuth acceptance test.

## References

- https://github.com/FreshRSS/FreshRSS/tree/1.29.1/Docker
- https://github.com/FreshRSS/FreshRSS/blob/1.29.1/cli/create-user.php
- https://freshrss.github.io/FreshRSS/en/developers/06_GoogleReader_API.html
- https://freshrss.github.io/FreshRSS/en/admins/15_extensions.html

## Catalog tags — 11 September 2026

The package manifest now declares the app-owned `News & feeds` tag under
`presentation.details.tags`. The metadata-only source candidate is
`0.1.0-beta.5`; existing images, requirements and runtime/security settings are
unchanged. No package was published or deployed. The Obsidian project-vault
note was updated through Jacob Gateway on 11 September 2026; this repository's
catalog-tags document remains authoritative for the exact vocabulary.
