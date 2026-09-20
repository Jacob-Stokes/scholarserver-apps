# FreshRSS integration

## Shared panel lifecycle — 20 September 2026

Status, reader-address discovery and appearance now use the same shared resource
and hook. Their requests remain independent and bounded. The app owns one access
scope; a denial in any panel clears all snapshots and removes private forms.
Explicit recovery creates a fresh owner, so late old save responses cannot clear
new drafts or display an obsolete success. Appearance drafts survive tab changes;
background reads do not overwrite either form. Fresh tab returns reuse accepted
data. Successful saves accept validated server results; no writes auto-replay.
Manager still validates address policy at save time; cached options are not grants.

Eleven focused tests, typecheck/UI build, `test:ui`, shared snapshot parity and
compiled synthetic browser checks pass, as do core `pnpm check` and the four-app
shared-screen regression. The browser covers child-denial propagation,
late mutation completion after recovery, actual stale reads preserving drafts,
fresh return without extra requests and mobile width. Full `npm test` remains
blocked by the unrelated missing Paperless integration workspace. This pass has
not built images, published packages or changed Freelove. Native/live acceptance
and project-vault notes/index remain pending. See `docs/read-lifecycle-migration.md`
for the resumable next slice.

## Shared status resource migration — 20 September 2026

FreshRSS now uses the canonical ScholarServer `ReadResource` and
`useReadResource` lifecycle for status reads. This app retains only its response
parser and policy of two-second polling while preparation is active and
thirty-second polling otherwise. The resource is component-local and retains
ordinary status data through transient failures; drafts stay app-owned. It pauses hidden-page
polling, and blocks/clears data after a confirmed access denial. Setup writes
cancel the current read and refresh after success; an authentication failure
invalidates and blocks without forcing an accidental retry. Focused tests cover
the parser, access-error classification and cadence policy; shared lifecycle tests
remain owned by `packages/ui`.

Compiled synthetic browser checks pass for independent panels, retained refresh,
stable layout, failed reads/saves, draft preservation, auth expiry and mobile width.
UI build/typecheck and focused tests pass. This is not package publication or
Freelove acceptance. Project-vault notes/index remain pending.
The compiled browser also covers a denied sign-in-link mutation and a lost link
response: access remains blocked until explicit retry, and status/reload reconcile
an accepted link without replaying its POST.

## Independent UI loading — 20 September 2026

Status, reader address and appearance retain separate request ownership. Unknown
status no longer renders setup claims or sign-in mutation controls. A ready
reader remains visible during background status checks and transient failures;
401/403 and HTML sign-in responses remove private status and stop automatic
retry. One status request runs at a time, with a 15-second bound, 30-second idle
polling and two-second checks during preparation. Hidden tabs do not poll. A
setup action stops the preceding observation before writing; no writes replay.

Appearance cannot save guessed defaults. Its initial failure has local retry,
and failed saves retain the draft. Reader-address failure has its own feedback;
advanced address editing is behind a disclosure. Failed saves keep the selected
address. Neither panel is held up by the other's request.

The shared build snapshot matches core's runtime bytes, including reserved
feedback and visible nonanimated indicators. `reader-status.test.mjs` covers
observation ordering, failure, cancellation, cadence and authentication blocking.
`loading-browser.mjs` tests compiled UI against synthetic, loopback-only APIs:
delayed panels, failures/retries, drafts, retained content, sub-pixel background
refresh stability, both motion-off settings and 390px mobile width. Shared-screen
browser regressions pass for Docling, Obsidian, Logseq and Zotero. `npm run test:ui`
passes. Full `npm test` was attempted but is blocked by pre-existing root-manifest
changes referencing a missing Paperless integration workspace; these edits were
not removed. Tests of this source are not native-container or live acceptance.

No image, immutable package manifest, account, permission or Freelove service
was changed. Package rebuilding/publication is a later batch. The project-vault
note/index update is pending; this local pass did not access the vault.

## Main-interface shortcut — 18 September 2026

Candidate `0.1.0-beta.9.launch.20260918.1` declares `launchLabel: Reader` on
the reader endpoint, leaving the configuration UI unlabelled. The matching core
change uses this endpoint even when a package also provides a setup UI. Image
pins, access policies, identity bindings and data declarations are unchanged;
no FreshRSS image rebuild is needed. This metadata candidate is not deployed or
published. Existing installed packages need a normal package update; do not edit
their stored manifests. Full apps tests and paired core checks pass; the
project-vault note and index are updated. A compiled Manager browser check with
synthetic APIs verifies reader/configuration separation on Home, cards, table
and Manage, including lookup failure. This is not live package acceptance.

## Shared browser sign-in candidate — 18 September 2026

The candidate links one Manager-verified owner to the existing reader account.
Manager provisions an Ed25519 public key through a declared executor action;
the reader proxy accepts only signed, short-lived, instance/request-bound identity
assertions. The PHP adapter uses FreshRSS HTTP authentication, disables automatic
user registration and trusts only the integration's private-network address.
No upstream password or API credential is reset during migration. Existing
browser login settings are recorded in runtime/browser-auth-backup.json for
operator recovery; this is not a public fallback or automatic fail-open path.
Manager and its compatible executor must be installed before this package.
Both recipe images passed native qualification on AMD64 and ARM64 in GitHub run
35383347325 from source 753228f69b9aa61daf78b487ca52297be5c7c65e. Tests cover fresh
shared-sign-in setup and migration of an existing password account, unavailable
reader resume, signed navigation, all six MCP tools, restart and stopped-filesystem
restore. A neighbouring container cannot spoof the native reader username.
The paired Freelove development deployment now runs this package at revision 3
with core ba923821048e7d3e259ff0fd03c63d44483c8887. The owner approved linking the
existing reading list after a normal Authentik password login. Manager-to-reader
navigation, favourites, subscriptions, reload, targeted service restarts and
shared logout/re-login passed in the real browser. Anonymous and forged requests
are denied. Existing API credentials still work; direct MCP discovers six tools
and a read-only feed-list call succeeds. No feeds or reading state were changed.

The guarded package update took a verified encrypted backup. Its pre-existing
Gateway integration warning repeated and remains marked for review; direct MCP
success is not proof of public Gateway routing. Do not replay Apply. The empty
library does not qualify ingestion or large-library performance. Core
`docs/testing/browser-sign-in-20260918.md` owns exact retained-host evidence.
Official catalog compatibility/version qualification remains a separate gate.
Project-vault documentation was updated on 18 September; repository notes remain
authoritative for exact implementation and release status.

## Qualified caching candidate — 18 September 2026

Candidate `0.1.0-beta.7.performance.20260918.1` selects integration images from
successful dual-native GitHub run 35364309153, source
`21c9b9ee4e8e3302815433e6083fdea1b454e689`. Source fingerprints and registry
configuration identities match the downloaded native test receipts. This selects
the bounded static-cache fix below; it does not itself update an installation.
The reader pin remains the previously qualified main candidate. Updating an older
installed package also includes that reader's appearance extension; it is not an
integration-only update. Review the complete package delta and take a verified
application backup before Apply. Permissions and data declarations are unchanged
from the preceding candidate. Project-vault documentation remains pending.

## Reader latency fix — 18 September 2026

Freelove's installed beta.4 reader answered directly in 18–23 ms, while the
Manager endpoint took 1.5–2.3 seconds, including CSS. Core now separates public
DNS/OAuth diagnostics from request authorization and revalidates just the known
package rather than scanning all historical packages. Live ingress checks remain.

The integration candidate gives recognized theme/script assets private five-minute
browser caching and conditional revalidation. Those upstream static requests carry
no credentials. Dynamic pages, APIs, errors, unexpected MIME types and responses
with session cookies remain no-store. Unit tests cover the boundary; the native
proof checks real CSS and a 304 response. The opt-in FreshRSS candidate workflow
builds only the changed integration and tests it with the pinned reader on both
architectures. Publication, package selection and retained-host acceptance are
separate gates; this source change is not yet deployed.

## Published image refresh — 18 September 2026

Source candidate `0.1.0-beta.7.editorial.20260918.1` selects changed recipe images
from GitHub run 35332927221,
source 3b90bb773159202103b989cd43d9642eb226a1b6. Both native architectures passed
the workflow gates and were published. Registry indexes, platform configs and
source fingerprints were checked against the downloaded receipts. Only changed
recipe pins and a new package identity change; other image pins, permissions,
storage, variants and declared package architectures are unchanged.

This is image publication and source consolidation, not an official catalog
release or deployment. Existing release gates remain. See
[the refresh record](../../docs/native-candidates-20260918.md). Project-vault
documentation is pending; this pass does not access research data.

## Finalized native candidate pins — 14 September 2026

The current unpublished editorial candidate now selects its exact verified
images from successful dual-native run 34878253357, source 2917a0a. This supersedes
the earlier source-only/old-pin limitation, not the package release block.
Version, descriptions, tags, icons, variants, permissions and data/setup remain
unchanged; n8n and Zotero now advertise qualified ARM64 as well as AMD64.
No runtime input or vendor bytes changed. Full npm tests, lint and all 19 source
locks pass. See [native evidence, snapshot ownership and remaining gates](../../docs/native-candidates-20260914.md).
Development archives are not an official release or a deployment.
The project-vault note/index update is pending under this apps-only scope.

## Editorial icon source candidate — 14 September 2026

Purpose-copy follow-up: `presentation.details.description` now reads
“Follow news and research feeds in one reader.” Existing tags, unpublished candidate
version and image pins are unchanged. This describes purpose, not setup or new
capabilities. The two canonical font files were also mirrored into vendor.
Vault-note follow-up is pending under this pass's no-remote-changes boundary.

New unpublished source identity `0.1.0-beta.7.editorial.20260914.1` adds an app-owned
`artwork/editorial.svg` and a locked transparent PNG declaration under
`presentation.editorialIcon`, with separate ScholarServer CC BY 4.0 attribution.
The prior `0.1.0-beta.6` package identity is not rewritten. Original
icon bytes, image pins, Compose, app capabilities, grants and data/setup contracts
are preserved. The explicit release block remains until compatible-core/package
and changed native-image/browser acceptance are qualified; no publication or
retained-host update is implied. See [artwork, source versions, checks and deployment
options](../../docs/editorial-icons.md).

The shared vendor snapshot now matches main's reviewed canonical runtime files,
including editorial typography/themes and the browser-local icon preference.
Any image incorporating the changed shared UI must be rebuilt and qualified;
the preserved pin must not be described as containing these source changes.

Bounded asset/package and n8n UI checks pass; the seven packages also pass the
current core loader/schema check. Full `npm test`, final-image and authenticated
browser acceptance remain main-owned gates. All six app UI typechecks and the
n8n UI build pass; the build emits original/editorial rasters as separate files.
This checkpoint was appended to the existing project-vault app note through
Jacob Gateway; the app index was updated with the same source-only boundaries.

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
