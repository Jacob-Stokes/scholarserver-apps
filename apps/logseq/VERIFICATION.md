# Logseq candidate proof — 6 September 2026

## Initial native helper/MCP proof

Disposable graphs and native Docker containers: AMD64 on Resolution and ARM64 on
Freelove. No
researcher's notes, account, existing Logseq graph or existing service was used.
No host ports were published in that proof. The initial browser preview used a
loopback-only SSH tunnel. The subsequent account/sync test is recorded below.

- Official Logseq 2.0.1 Linux archive checksum verified at image build.
- CLI created a database graph, research page and block without a GUI/display server.
- Hardened helper and MCP containers start as UID 1000 with read-only roots,
  dropped capabilities and no Docker socket.
- Actual MCP protocol: all six tools work, including search, page/block/task
  creation and reading the resulting tree.
- Unicode and a synthetic DOI citation survived storage and retrieval.
- Two concurrent MCP clients worked (not the older npm CLI's MCP transport).
- Restarting both containers preserved the page, block, task and service identity.
- The graph API rejects unauthenticated requests.
- Unit tests exercise validation, command serialization, timeout outcomes,
  bounded queues/output, stdin transport and non-destructive graph initialization.
- Our own interrupted initialization is resumable. A pre-existing graph with a
  missing or empty database is rejected before the upstream CLI can recreate it.
- The maintained upstream sync and DB web images start under the development
  recipe's non-root/read-only constraints. Sync health returns 200; graph listing
  without credentials returns 401.
- The DB editor loads in the in-app browser. It starts with its own **Demo** graph.
  That is a rendering/startup proof, **not** evidence of shared-graph sync.
- Complete existing apps repository test suite and lint pass with the candidate.

## Account and encrypted browser sync proof — 6 September 2026

A new account was created and email-verified with the user's permission. No paid
subscription or existing research data was used. The pinned sync and browser
containers were reached through private Tailscale HTTPS test routes, not Funnel.

- Found and fixed missing public Cognito configuration in the development recipe.
  `/health` had returned 200 while authenticated graph requests returned 401.
  After configuration, signed-in graph/key requests succeeded and unauthenticated
  requests still require authorization. A recipe regression check was added.
- Stored encrypted user-key material on our self-hosted sync server using a
  separate generated encryption password, saved privately outside the repository.
- Created one disposable encrypted graph using the pinned self-hosted browser.
  The server's graph listing reported `graph-e2ee?` true.
- Created a synthetic research page/block with Unicode and a synthetic DOI.
- Joined the same graph from Logseq's public test browser on a different origin
  (independent browser storage). Its requests downloaded the snapshot from our
  private sync server; the page and block identities/content matched.
- Edited the block in the second client and observed the edit in the first.
- Restarted the sync container. After reconnect, another edit from the first
  client reached the second. No manual reset or encryption downgrade was used.

This proves two-browser bidirectional encrypted sync through the self-hosted
server with a new unpaid account. It is not a physical-device test, cryptographic
audit, headless-replica enrollment proof or complete installer acceptance.

The public test site's initial encrypted graph creation stalled with an invisible
password-request timeout. The pinned browser successfully prompted for the
password and created the graph; the public site could then join and edit it.
That UI failure was not evidence of a subscription requirement.

## Not yet verified / not yet implemented

- Headless account authorization and encrypted replica enrollment.
- Browser, headless replica and a physical device using the same graph bidirectionally.
- Compatibility of the official CLI with the proven browser/sync pair.
- Attachments, reconnect after network loss and consistent backup/restore.
- ScholarServer setup screens, access-route integration and the two install choices.
- Final package manifest, release image digests and full redistribution/source notices.

This is not available in the published catalog. `RELEASE_BLOCKED.md` records the
acceptance gates. Existing Obsidian and Zotero installations are unchanged.

The new non-publishing GitHub workflow cannot be dispatched until its file exists
on the default branch (GitHub returned 404). Native proofs were run on the two
hosts above instead; neither host was reinstalled.

## Reproduce

From a fresh disposable repository checkout on a native Linux Docker host:

```sh
npm ci --ignore-scripts
npm run test:logseq
sh scripts/check-logseq-candidate.sh
```

The native script refuses existing test data and does not publish images. It stops
its own containers afterward; the disposable graph remains in the checkout for
inspection. The optional upstream preview is separate and is not a sync test.
