# Desktop client setup acceptance — 12 September 2026

## Result and limits

Two persistent native ARM64 Linux desktop clients are running on the operator Mac
under Compose project `scholarserver-test-desktops`. They are not the native
macOS applications. No personal Mac profile was opened, reconfigured or mounted.
No remote deployment, paid resource or published package was changed.

This pass qualifies desktop startup, browser control, storage isolation and a
specific stop/start persistence check. It does **not** qualify account sign-in,
email verification, attachment sync, two-way sync with Freelove or n8n workflows.

The dedicated Zotero account form was prepared in the in-app browser. Registration
requires the operator's password/terms submission; no password was generated,
stored in this repository or submitted by the agent. Verification and client login
remain pending. No account address, verification link or secret is recorded here.
Obsidian has no sync configured; choose separate test vaults for each sync mechanism.

## Runtime identity

| Client | Version | Running image ID |
| --- | --- | --- |
| Obsidian | 1.13.7, desktop welcome screen | `sha256:9bed047a2dfb0ef597bf3402469c080030c45f4ddc32d08c4a79a7e0594fabed` |
| Zotero | 10.0.1, checksum-verified upstream archive | `sha256:2f149a243c697e3a91e923158086a560a2b0fc478c4668db36c59ae07e9ba3aa` |

The qualified IDs are checked before start. Exact container names, volumes, local
URLs and build inputs are documented in [desktop testing](desktop-testing.md).
Runtime inspection confirmed only named `/config` mounts, `privileged=false`,
loopback published ports and no native host folders. The Obsidian process runs
as UID 1000 under LinuxServer's container-root supervisor; Zotero uses UID 10001.

## Evidence

- `npm test`: passed, including the existing application suites and typechecks.
- `npm run test:desktops`: eight JavaScript and seven Python tests passed.
- Both final containers passed their healthchecks and accepted streamed browser
  connections in the in-app browser.
- Created `ScholarServer Test` vault through the Obsidian desktop. The generated
  Welcome note is under that container's `/config/ScholarServer Test` folder.
- Created `ScholarServer Test` collection through the Zotero desktop.
- Ran `stop`: both containers exited 0, without OOM kills. Ran `start`: both
  healthy, and browser views reopened the same named vault/collection.
- The Obsidian Welcome note SHA-256 was unchanged across stop/start:
  `ecd0dfb6b21143ff52cfe36f93636df57e5b21773c101491b86f10ce17556ca8`.
- The first Obsidian tab reached a connection-error page during downtime; opening
  a fresh tab after readiness restored its desktop. This is not proof that every
  open browser tab reconnects automatically.
- Post-restart snapshot with desktop streaming: Zotero about 266 MiB, Obsidian
  about 494 MiB. This is an observation, not a sync workload capacity guarantee.
- Existing local n8n containers and unrelated Supabase remained running. The
  image builder's disposable check containers and profile volume were deleted and
  their absence verified; the two retained test profiles were not deleted.

Screenshots on the operator Mac, intentionally outside source control:

- `.dev/desktop-clients/obsidian-after-restart.png`
- `.dev/desktop-clients/zotero-after-restart.png`

The contributor-vault note update is deferred for this test-infrastructure pass;
the operator asked that personal native apps remain unaffected. This repository
owns the exact setup and evidence above.
