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

Native ARM64, final digest publication and the Manager catalog browser flow are
still in progress. Only disposable data is used; Resolution's real FreshRSS is
unrelated and untouched.

## References

- https://github.com/FreshRSS/FreshRSS/tree/1.29.1/Docker
- https://github.com/FreshRSS/FreshRSS/blob/1.29.1/cli/create-user.php
- https://freshrss.github.io/FreshRSS/en/developers/06_GoogleReader_API.html
