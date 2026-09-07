# Anki — reviewable draft

This integration keeps Anki's desktop, its sync server and ScholarServer's setup
and MCP responsibilities separate. It does not deploy anything.

## Setup options

| Option | Server components | Account and capability |
| --- | --- | --- |
| Self-hosted sync only | Sync server, setup controller (planned) | Study/edit on personal devices. Separate sync account; no browser desktop or MCP. |
| Browser desktop with AnkiWeb | Desktop with AnkiConnect, MCP, setup controller (planned) | Sign in inside Anki with an existing AnkiWeb account. No self-hosted sync server. |
| Browser desktop with self-hosted sync | Desktop with AnkiConnect, MCP, sync server, setup controller (planned) | Separate sync account. Set the same server address on every client. Desktop and server have separate copies. |

The UI is a local design preview using the shared application screen and setup
pipeline. “Save setup draft” persists only a non-secret browser choice, survives
reload and retains the selected choice if saving fails. It makes no API requests.
It cannot install an app, enable writing or sign in. Endpoint selection remains in
ScholarServer's existing Access screen; no routing or sign-in code is duplicated.
A production screen should receive the installed choice from the controller and
use the existing endpoint-access component/API if it presents address choices.

## Implemented source

- `integration/setup.mjs`: explicit service/data decisions and migration denial.
- `mcp/`: shared authenticated MCP transport plus narrow AnkiConnect API v6 tools.
  Read tools are the default; single-note creation requires an operator-owned file.
  No new database engine, direct SQLite writes or automatic synchronization.
- `ui/`: built/typechecked preview. No claim of production controller integration.
- `development/`: static, intentionally unresolvable package/Compose drafts.
  Zero image digests are blockers, not pins or known-good artifacts.
- `upstream-lock.json`: exact source revisions and PyPI SHA-256 artifact metadata
  for review. These do not constitute a full transitive runtime lock or image approval.

Run from the repository root:

```sh
npm ci --ignore-scripts
npm run test:anki
npm run build -w apps/anki/ui
npm exec -w apps/anki/ui vite -- --host 127.0.0.1
```

Run `npm test` with the repository's documented Obsidian sync dependencies too.
The MCP image recipe builds only our integration. It is not in the publication
workflow. Never aim synthetic tests at an existing desktop or collection.

## Data, accounts and safety

Sign in to AnkiWeb in Anki itself; do not pass its password to ScholarServer.
For a future self-hosted account, use a declared, bounded onboarding action that
consumes a private request, writes a private credential file and deletes the
request. That controller and sync-server credential adapter are not implemented.
The official server's environment-based credential interface requires a reviewed
file-to-process adapter before packaging; no secret belongs in Compose or arguments.

MCP uses `/runtime/service-token` and `/runtime/ankiconnect-key` (minimum 32
characters). Runtime is mounted read-only into MCP; `/operations` holds its write
journal. An operator may explicitly create `/runtime/creation-enabled` containing
`enabled` after disposable-data acceptance. This is not a UI or MCP action.
The API key belongs in AnkiConnect's private configuration, with API logging off,
no wildcard browser origins, and port 8765 private to the integration network.
Do not install the observed Resolution startup script: it rewrites user settings.

All calls are bounded; no request is queued or automatically retried. The exclusive
pending marker survives an uncertain creation or process death and blocks further
creation. It contains no note contents or secrets. Recovery is intentionally manual:
stop this app's MCP, inspect the desktop outcome, back up, then explicitly approve
clearing the marker. A lost successful response is still not permission to retry.
This guard does not coordinate separate interactive desktop actions or devices;
there is no automated sync tool or scheduler in the draft. Keep a single MCP writer.

No reset, delete, import, field overwrite, profile switch, force upload/download,
remote media fetch or arbitrary AnkiConnect action is exposed. Future overwrite or
reset must show the affected copy and require explicit human confirmation.

Back up desktop data (including media/settings), sync-server data and private
runtime/credentials as distinct bindings. Stop all app writers first using the
platform lifecycle; preserve data on disable/remove. Disconnect independent devices
before restore, inspect the restored copy and confirm the next sync direction.
Never mount desktop and sync server on the same directory or seed server storage
by copying a desktop database. AnkiWeb is not included in a server backup.

See [development notes](DEVELOPMENT_NOTES.md) and [upstream notices](UPSTREAM_NOTICES.md).

For the repeatable synthetic browser check, run the preview on loopback port 5197
(`npm exec -w apps/anki/ui vite -- --host 127.0.0.1 --port 5197 --strictPort`), then
run `node apps/anki/development/check-ui.cjs` from the root. Set
`SCHOLARSERVER_BROWSER_MODULES` to a directory containing Playwright if it is not
installed locally. The check uses Chrome, blocks external requests and writes its
screenshot under ignored `.dev/anki`; it only modifies this preview's localStorage.
