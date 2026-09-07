# Anki development notes — 7 September 2026

## Scope and evidence

Isolated worktree/branch `codex/anki-draft` from apps checkpoint
`d8cd87ffd42dfc1ee40e0919e7a188b43172dd0a`. Canonical checkout was unchanged.
Read AGENTS, README, architecture review, application integration lessons, image
packaging and packaging verification before implementation. Also read the local
core architecture/UI contract and the accessible backup of the academic software
landscape note: semantic narrow tools, curated permissions and destructive-action
approval informed this draft. That note was an August backup, not a current plan.
A ScholarServer master checklist was not located in the accessible project/docs
and vault-backup paths; no claim of checklist acceptance is made. No vault data is
copied into this repository.

### Resolution: verified read-only observation

The existing lowercase SSH alias works. Uppercase `Resolution` missed the alias
and failed host-key verification; no known-hosts or SSH configuration was changed.

| Container | Source location from Compose labels | Observed persistence / listening |
| --- | --- | --- |
| anki-desktop | `/root/docker-services/anki-desktop/docker-compose.yml` | `/config` bind; host loopback 3000 and 8765 |
| anki-mcp | same Compose project | no data mounts; host loopback 7006 |
| anki-sync-server | `/root/docker-services/anki/docker-compose.yml` | `/anki_data` volume; host loopback 8078 to 8080 |

Desktop and sync are locally built images. Dockerfiles select launcher 25.09 and
Python Anki 24.11 respectively; these are source build defaults, **not verified
running Anki versions**. MCP's observed registry digest is
`sha256:bc7ac5c63a92ca5a2f1c3a6dc0be59762917718ab3a7873827df5ab6e4b89c85`.
The source checkout under `/root/mcps` is at
`f5bdd17c37ff63f008dffb1f5f2b94fc4f8a92cf`; correspondence with that image is
unverified. Anki API, account, card, sync, media and health endpoints were not called.
Only selected container metadata, source files and environment **names** were read.
No environment values, credentials or study material were read or recorded.
No files, containers, schedules or accounts on Resolution were changed.
Adventure and Freelove were not accessed.

Existing source confirms the useful data path: semantic MCP -> AnkiConnect ->
desktop-owned collection. Reuse that architecture. The observed startup script
writes a pickled preferences database, overwrites add-on configuration, uses a
mutable add-on ZIP and runs periodic sync with raw output. The MCP forwards raw
upstream errors and has no request deadline. Those behaviours are not imported.
No unlicensed MCP source was copied; see UPSTREAM_NOTICES.

## Decisions and difficulties

- No official headless card editor is assumed. Official minimal sync server and
  browser desktop serve different needs. AnkiConnect is the selected API boundary.
- Maintained desktop candidate uses runtime downloads: outer image pinning alone
  cannot make the app immutable. Keep image selection blocked rather than fabricate
  a tested digest or build a new desktop distribution without evidence.
- Sync-only has no Gateway service. Existing package tests require declared MCPs
  in every setup choice, so draft two packages rather than duplicate route logic or
  silently install a desktop in sync-only. Final catalog presentation remains open.
- Core at `0b52f901dc9f5223b5209e22a906568495ddcbe5` accepts both draft manifests
  and Compose policy. It forbids `shm_size`; use its allowed tmpfs declaration for
  `/dev/shm`. Origin endpoints are private and cannot add Authentik in that version.
  We use that generic policy unchanged. Do not claim public/optional sign-in support
  from a different source branch; revisit when the generic implementation lands.
- The setup UI is explicitly a browser-local preview. Production controller,
  onboarding consumption, key provisioning and sync credential adapter remain
  unfinished. Do not label a saved draft as an installed or connected app.
- MCP has five read tools, plus opt-in single-note creation. No arbitrary action,
  remote asset fetch, bulk edit, deletion, overwrite, import or sync tool exists.
  API responses have a 1 MiB ceiling and 15 second fetch deadline; failures are
  classified without forwarding upstream text. There is no retry or operation queue.
- An exclusive persistent marker blocks creation across processes and restarts
  after an unknown outcome. The in-process busy guard does not coordinate GUI/device
  actions; operator recovery requires stopping the MCP and checking the desktop.
  This is not a distributed sync lock or a power-loss durability proof.
- Required full tests found a hard-coded Dockerfile count; updated it from 17 to 18
  to include the unpublished integration recipe, while retaining its pin/lock checks.
  No build/release workflow, catalog or index was changed.

## Verified source and synthetic checks

- Full repository `npm test`, including Anki tests; `npm run lint`.
- Anki UI type check and production build.
- Clean standalone MCP dependency install, compile and seven synthetic tests using
  the image recipe's install-links mode. Corrected the initial workspace-linked
  lockfile so transitive MCP dependencies are locked for independent packaging.
- Setup decisions: exact services/data for three options; rejected secret fields,
  unknown choices and installed-option changes; same-option resume accepted.
- API/tools: protocol/key placement, redirect denial, forbidden actions, default
  read-only mode, busy rejection, persistent uncertain creation, malformed results,
  successful journal removal, redacted errors, oversized response, strict inputs,
  namespace and duplicate rejection. Fixtures use only synthetic data and responses.
- Static packaging regression: release discovery exclusion, marker, placeholder
  image identity, storage declarations, non-shell health, private ports and data
  separation. These do not prove the proposed images contain the probe binaries.
- Core manifest validation and Compose policy returned no issues for both sketches
  at the above core revision. All-zero digests intentionally remain unusable.
- Headless local Chrome preview at 320/390/768/1280 widths: no horizontal overflow;
  save/reload retains choice; synthetic storage failure preserves the editable
  draft and prior saved choice. External requests blocked. Screenshot visually
  inspected and radio-label layout corrected, then browser checks repeated.

Not verified: final container startup, actual MCP HTTP/Gateway discovery, running
Anki/add-on compatibility, accounts, sync, media, devices, backups or fresh install.
The MCP Dockerfile was not built. No source test is presented as live acceptance.

## Remaining implementation and exact acceptance gates

1. Select maintained immutable desktop and official sync artifacts. Verify full
   dependency/runtime integrity (not only launcher), supported native AMD64/ARM64,
   licence/source notices, add-on hash and update/migration plan. No emulation.
2. Implement app-owned controller with existing onboarding request contract:
   explicit account creation consent, bounded secret inputs, private file writes,
   crash/resume state and request deletion. Add the upstream sync credential adapter
   and preserve pre-existing installation/account state. Verify secret-free logs,
   arguments and Compose inspection. No controller/API shell runner.
3. Test each final image natively with non-root UID, read-only root, dropped
   capabilities, bounded resources and declared tmpfs; prove probe binaries exist,
   distinguish transport liveness from Anki/account readiness, and restart cleanly.
4. With a disposable collection, prove AnkiConnect auth, disabled API logging,
   denied browser origins, loopback/private-only reachability and exact Anki/add-on
   version compatibility. Block background sync and direct alternative API writers.
5. Test actual authenticated MCP discovery through Gateway, schema rejection,
   read-only default, explicit creation enablement, create/read, timeout followed
   by reconciliation, MCP crash/restart and two-instance credential/network isolation.
6. Test AnkiWeb using an explicitly authorised disposable account/collection:
   desktop login, initial direction prompt, desktop -> real device and device ->
   desktop changes, media byte equality, offline/reconnect and restart. No automatic
   force-sync or claim that local creation means other devices have received it.
7. Repeat with official self-hosted sync: native desktop, AnkiDroid and AnkiMobile,
   compatible versions, private access, TLS if exposed through generic routing,
   collection/media request sizes and same-account identity. Include simultaneous
   device attempts and interruption. Never use existing user decks to prove this.
8. Test fresh installation of sync-only and both desktop options, failed setup,
   preserved draft, reload/resume, disabling/re-enabling, upgrade and removal with
   data preservation. Test private browser WebSocket routing. Public/optional sign-in
   waits for generic core support; do not add app-specific route orchestration.
9. Stop app writers and disconnect clients; back up/restore synthetic collection,
   media, credentials and operation marker. Verify media hashes and absence of
   post-backup changes, then reconnect with explicit sync-direction confirmation.
   Test cross-host recovery and interrupted restore separately from same-host restore.
10. Before future editing/reset/import or automated sync, design human confirmation
    of the exact target and a desktop-owned serialization protocol. A file lock in
    the MCP cannot serialize independent native client sync. Keep these unavailable
    until those failure-path tests pass.

## Source delivery

Inspected CI before pushing: image publication triggers only on `main` or manual
dispatch, catalog publication on `v*` tags; candidate workflow is manual. A plain
push of `codex/anki-draft` cannot trigger those workflows. Do not push tags, merge,
modify CI to bypass gates, dispatch builds or create a catalog release for this draft.
