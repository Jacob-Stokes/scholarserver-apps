# Review checkpoint

7 September 2026 — source draft only, branch `codex/stirling-draft`.

## Passed locally

- Full repository `npm test` passed. Initial run lacked the existing standalone
  Obsidian sync dependencies; installed them with the same `npm ci --prefix
  apps/obsidian/sync --ignore-scripts` preparation used in check.yml, then reran.
  No Obsidian source or lockfile was changed.
- `npm run test:stirling`: six mock/source tests passed, UI TypeScript check and
  Vite production build passed. Initial draft TypeScript setting was corrected to
  allow the existing shared UI's .ts/.tsx imports before the successful rerun.
- Focused Biome formatting/lint passed. Repository diff whitespace check passed.
- Selected-release source/API inspection confirms native MCP in v2.14.3 and the
  two selected operation IDs. No upstream implementation was copied.

## Not proved

No real PDF parsing or output quality, native image identity/startup, real MCP
handshake, Gateway discovery/authentication, browser rendering, installation,
backup restore or deployment. The UI is a review-only shared-frame preview:
it does not upload files or save credentials. Direct use of the native UI and
adapter's retained artifacts has not yet been integrated into one browser flow.

The two YAML files are non-runnable sketches, not schema-conformant release
packages. Credentials must be provisioned privately before any later server
startup; the adapter has no account creation/setup automation. Unknown outcomes
require manual reconciliation; there is no native-job resume implementation.

## Review before advancing

Read RELEASE_BLOCKED.md and DEVELOPMENT_NOTES.md. The highest priority gate is
the native MCP's proprietary Stirling PDF User License and selected-image edition
rights, followed by authenticated, resource-bounded native execution and artifact
recovery. Keeping five tool names narrow is not a licence or security approval.
The per-workspace identity boundary must be shown plainly before multi-user use.

No deployment, image build/pull, catalog publication, CI edits or main-branch
changes were performed. This checkpoint can be reviewed independently of all
other application draft worktrees.
