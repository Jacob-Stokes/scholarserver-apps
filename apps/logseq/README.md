# Logseq — integration candidate

This is a **development candidate**, not a published catalog entry. It targets
Logseq 2's database graphs, not the older Markdown-file graphs. Never import,
convert or reset a researcher's existing graph as part of installation.

## Ownership and boundaries

The graph helper runs the **unmodified, checksum-verified official Logseq CLI**.
Logseq owns database access, block identities, transactions and sync. Our private
HTTP API offers a small set of research operations; the separate MCP service uses
the existing ScholarServer transport. Neither service edits SQLite directly.

The intended complete stack adds the maintained
[self-hosted sync and browser images](https://github.com/yshalsager/logseq-selfhost).
The browser editor is an optional, recommended choice. It must join the **same
remote graph** as the server replica and the researcher's devices. Serving an
unconnected browser notebook does not count as integration.

The upstream self-hosted sync adapter still uses **Logseq account sign-in** by
default. Self-hosted storage is not the same as independent authentication. The
setup must disclose this. A new unpaid account has been verified with encrypted
browser/headless self-hosted sync and MCP tools on the same encrypted
graph. Enrollment was manual engineering work, not a finished installer.

The official release currently includes its new CLI in the desktop archive. The
helper runs that archive's runtime in Node mode: no display server, remote desktop
or GUI process. This is an explicit packaging exception, not a new Logseq fork.
The old `@logseq/cli@0.4.3` npm package is not the same runtime. Replace the archive
packaging with a supported upstream headless artifact when one is available.

## Security and data

- Non-root, read-only containers; no Docker socket or host ports in the recipe.
- Only the helper mounts the graph. MCP receives only its service credential.
- Graph commands are allowlisted. There is no shell, arbitrary CLI or database API.
- Note contents travel through stdin, not OS command arguments. Output and runtime
  errors are bounded; raw upstream errors are not sent to callers or logs.
- Commands are serialized. A timed-out write is **not automatically retried**.
- The upstream daemon is the single graph writer. Restarting the helper reopens
  the same persistent graph; it does not recreate or overwrite it.
- Sync is not enabled implicitly. Do not remove E2EE to make server-side MCP work.
  The verified headless replica decrypts locally as an authorized device would.

## Current scope

The helper/API/MCP slice has fourteen tools: graph status; listing, searching,
reading and creating pages; searching, reading and editing blocks; appending notes
and nested notes; creating and listing tasks; discovering and setting task status.
Read a block before replacing its text, and use IDs from this server replica only.
See [API decision](API_DECISION.md) for the measured CLI/HTTP trade-off and why the
community desktop MCP is not a drop-in replacement. Test only
with disposable graphs. See `VERIFICATION.md` for actual evidence and remaining
acceptance work; the presence of a recipe is not evidence of a working installer.
See [development notes](DEVELOPMENT_NOTES.md) for difficulties, decisions and
unresolved integration questions to carry into the next pass.

## Development

Build from the repository root using `apps/logseq/helper/Dockerfile` and
`apps/logseq/mcp/Dockerfile`. `development/compose.yaml` is isolated from the
published catalog and deliberately has no public route. Do not run it against an
existing Logseq data directory.

## Sources and notices

- [Official CLI and daemon lifecycle](https://github.com/logseq/logseq/blob/2.0.1/docs/cli/logseq-cli.md)
- [Logseq DB overview and sync](https://github.com/logseq/docs/blob/master/db-version.md)
- [Official 2.0.1 release](https://github.com/logseq/logseq/releases/tag/2.0.1)
- [Logseq AGPL-3.0 licence](https://github.com/logseq/logseq/blob/2.0.1/LICENSE.md)
- [Community packaging licence](https://github.com/yshalsager/logseq-selfhost/blob/master/LICENSE)

Retain upstream notices and satisfy corresponding-source obligations before
distribution. This candidate does not change the licensing status of any other app.
