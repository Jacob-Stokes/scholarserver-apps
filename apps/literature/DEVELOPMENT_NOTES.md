# Literature metadata connector — development notes

7 September 2026; source draft, not an installed external service. Crossref and
arXiv remain hosted upstream APIs. ScholarServer supplies only a narrow connector.

## MCP reuse decision

Reviewed [botanicastudios/crossref-mcp](https://github.com/botanicastudios/crossref-mcp)
README and main `mcp-server.js`: MIT repository, stdio transport, title/author/DOI
tools. Its fetch paths lack the total-response, deadline and aggregate rate
boundaries required here. Replacing its transport and request layer is more work
than these four small operations. No code is copied or vendored.

Reviewed [blazickjp/arxiv-mcp-server](https://github.com/blazickjp/arxiv-mcp-server)
README and `pyproject.toml` (reports 0.7.2, Apache-2.0). Its current library, paper
reads/downloads and optional PDF dependencies exceed metadata-only scope. No code
is copied or vendored; this is not a complete source-security audit. Default branch
content is not a pinned approved release. Both candidates may be revisited only
for a justified expansion. Reuse existing `mcp-common` for authenticated HTTP MCP
and `literature_` tool namespace, Zod validation, and saxes 6.0.0 (ISC) for strict
Atom XML parsing. Exact dependency resolution is in the root lockfile.

## Source and policy references

- [Crossref access/rates](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/): optional contact identification, public access, rate/concurrency response headers and 429/403 handling.
- [Crossref REST API](https://github.com/CrossRef/rest-api-doc): `/works/{doi}` and bibliographic candidate search. No abstracts/references or citation graph claims.
- [arXiv API manual](https://info.arxiv.org/help/api/user-manual.html): fixed API query route, Atom identifiers/timestamps and explicit paging.
- [arXiv terms](https://info.arxiv.org/help/api/tou.html): one connection and at least three seconds between calls, aggregated over operator machines. Descriptive metadata and paper rights are distinct. Source links are offered but never fetched.

## Implemented boundary

Four read-only tools: Crossref DOI lookup/bibliographic candidates; arXiv search
and reported version lookup. DOI URL inputs are rejected: use a bare DOI. arXiv
supports modern and old-style versioned IDs. No arbitrary destination, redirect,
download, PDF, Zotero write, local corpus, OpenAlex, PubMed, full-text acquisition
or institutional-access workflow. Source text is untrusted. No database/cache or
background jobs exist. Results include source, timestamp, original input, bounded
record fields, partial flag and explicit ambiguity; no automatic match selection.
Pagination is explicit (10 records maximum, offsets 0–100), not exhaustive search.

Requests have a 15-second deadline through body consumption, 1 MiB byte cap and
one in-flight request per source. Busy/rate-limited calls fail immediately; no
queue, retries or writes. arXiv waits at least 3.1 seconds after response completion;
Crossref starts conservatively at one second and only slows from rate headers.
Concurrency stays one regardless of a larger advertised allowance. 429/503 set
cooldown (at least 60 seconds; honour longer Retry-After seconds/date). 403 stops
that source for the process lifetime pending operator investigation. Rate state
is not durable; restart/operator-wide coordination remains a release gate.

## Setup and evidence boundaries

No upstream account/client install required. Optional CROSSREF_CONTACT is sent to
Crossref only; no real contact entered in this pass. Server startup requires a
preprovisioned `/runtime/service-token` (32+ characters); no default secret.
Manager routing, provisioning and a real browser settings API are not implemented.
The shared ApplicationScreen/SetupPanel UI is explicitly a static review preview,
not a fake connected UI. No local-device folders, credentials, scripts or native
companion are introduced. Users can manually consult the official source links.

Run `npm run test:literature` for focused mocks/typecheck/build; `npm test` for
existing repository regressions. These do not prove native container or Gateway
operation. No Docker, SSH, deployment, real metadata request, account or corpus
operation is part of this pass; upstream documentation was read only.

CI inspected: Check runs main pushes/PRs; image workflow is main-path/manual only,
Logseq candidate manual only, catalog release tag-only. Pushing this draft branch
does not trigger publication. No workflow/catalog changes made. Release builder
discovers `apps/*/package/`, not this `development/` directory.
