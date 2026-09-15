# Native research development candidates — 15 September 2026

Image source: `2a8cde7cd7a81193891a993bad74eb9adff4a03e`. All 19 ARM64 images
were built by the existing native pipeline and published under immutable
source/architecture tags. Publication verified each remote config against its
native build receipt; this does not qualify every application workflow.

Selected development packages are n8n `0.1.0-guided.20260915.5` and Obsidian
`0.5.0-guided.20260915.2`. Their manifest/Compose pins and current source-lock
records select seven qualified ARM64 images. Prior records remain in Git history;
no published package or old image is overwritten.
This is not a general multiarchitecture release or permission to change other
installed applications. Other stale source-lock records remain release blockers.

## Evidence

- Operator receipt: `.dev/native-images/<source>-arm64.json`; qualification:
  `.dev/native-images/<source>-arm64.qualified.json` in this checkout.
- Existing native gate passed Files boundaries/restart, Obsidian official-client
  consent/integrity/native startup and LiveSync replication, FreshRSS setup and
  six MCP tools/restore, and n8n setup/restricted-key/restart checks.
- The unchanged suite ran in an ARM64 Linux helper on Docker Desktop because
  the host macOS user cannot perform the fixture's Linux ownership changes.
  Source was read-only; disposable test roots and receipt output were writable.
- Additional n8n research acceptance ran all six workflows twice on native n8n
  with synthetic app services and real Linux create-only note writes. Empty
  input and revoked-grant cases produced no additional writes. Native schema
  setup, independent copies, paused creation, timing and edit protection passed.
- Private operator logs: `/tmp/apps-native-arm64-qualification-linux-20260915.log`,
  `/tmp/n8n-research-native-20260915.log`,
  `/tmp/apps-native-arm64-publish-20260915.log`.

## Remaining gates

Freelove's n8n and Obsidian updates passed exact installed-state plans, fresh
encrypted checkpoints and live preservation checks. Installed revisions are
n8n 6 and Obsidian 17. The owner approved folder browsing for personal/obsidian
only. Existing automation schedules were preserved. Five native report forms
remain blocked by Zotero's missing installed metadata declaration: its qualified
metadata-only candidate cannot pass the executor's shared-storage update guard.
No live report creation or functional report-folder-picker acceptance is claimed.
No real research workflow, paid Obsidian account, personal desktop profile or
fresh-install acceptance is claimed here. Core deployment state is recorded in
the core repository's `docs/deployments.md`.

Jacob Gateway vault documentation could not be updated: its note-read request
timed out. Pending notes: `Projects/AcademicSystem/Apps/n8n/n8n.md`,
`Projects/AcademicSystem/Apps/obsidian/obsidian.md` and the Apps index. Repository
documentation remains authoritative; no credentials or research data belong in
these evidence notes.
