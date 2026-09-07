# Literature draft review checkpoint

Scope: four original metadata-only tools with existing authenticated mcp-common
transport; no upstream engine/service repackaging. Review the full reuse decision
and official source links in DEVELOPMENT_NOTES.md. No candidate MCP code copied.

Verified locally: repository `npm test` passed after installing its existing
Obsidian sync test dependencies exactly as CI does; literature source mock tests,
UI TypeScript check and Vite production build passed. All 12 focused tests pass and cover bounded
input/output, metadata identity/version, malformed XML/DTD and optional fields,
rate/concurrency/cooldown, stalled body/deadline, provenance, ambiguity, namespace
and draft-only release exclusion. No live upstream metadata calls were made.
UI compilation is not a browser rendering or authenticated workflow test.

The first full test attempt failed solely because a fresh worktree lacked the
non-workspace Obsidian sync test dependency `tar`; `npm ci --prefix
apps/obsidian/sync --ignore-scripts --no-audit --no-fund` resolved that prerequisite.
No unrelated source was changed. Host tests ran on local Node 25.8.2; CI Node 22
and native Linux container proof remain distinct and unperformed.

Outstanding gates (not implementation claims):

- Approved immutable image/native AMD64+ARM64 startup and dependency/image notice review.
- Complete packaged browser UI/API, editable configuration persistence, same-origin serving and Manager installation.
- Real Gateway discovery/authenticated calls, negative unauthorised transport tests, duplicate-instance isolation and service-token provisioning/rotation.
- Operator-wide aggregate arXiv rate enforcement and persisted cooldown across restart; the current gate is one process only. No workaround using multiple instances is permitted.
- Current upstream compatibility and a few permitted public metadata smoke checks before any release; no complete metadata/citation recall or paper licensing claim.

No container builds, deployment, SSH, account/credential creation, catalog/index,
release workflow changes, PRs, merge, tags or releases are part of this checkpoint.
Only the isolated `codex/literature-draft` source branch is to be committed/pushed.
