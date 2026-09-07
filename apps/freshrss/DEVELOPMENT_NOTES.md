# FreshRSS integration

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

## References

- https://github.com/FreshRSS/FreshRSS/tree/1.29.1/Docker
- https://github.com/FreshRSS/FreshRSS/blob/1.29.1/cli/create-user.php
- https://freshrss.github.io/FreshRSS/en/developers/06_GoogleReader_API.html
