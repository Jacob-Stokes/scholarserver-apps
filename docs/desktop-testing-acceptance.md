# Desktop client setup acceptance — 12 September 2026

## Result and limits

Two persistent native ARM64 Linux desktop clients are running on the operator Mac
under Compose project `scholarserver-test-desktops`. They are not the native
macOS applications. No personal Mac profile was opened, reconfigured or mounted.
No remote deployment, paid resource or published package was changed.

This pass qualifies desktop startup, browser control, storage isolation and a
specific stop/start persistence check. It does **not** qualify desktop account
sign-in, attachment sync, two-way sync with Freelove or n8n workflows.

The operator completed registration for the dedicated Zotero account. Its email
verification page confirmed success. No password was generated, stored in this
repository or submitted by the agent. Desktop client login remains pending.
No account address, verification link or secret is recorded here.
Obsidian has no sync configured; choose separate test vaults for each sync mechanism.

## Runtime identity

| Client | Version | Running image ID |
| --- | --- | --- |
| Obsidian | 1.13.7, desktop welcome screen | `sha256:9bed047a2dfb0ef597bf3402469c080030c45f4ddc32d08c4a79a7e0594fabed` |
| Zotero | 10.0.1 with Firefox 154.0 for account login | `sha256:b4f0e16a29c4b675ec1cc4209140ad6592aa9746d211df3385f9ac4b1372ad45` |

The qualified IDs are checked before start. Exact container names, volumes, local
URLs and build inputs are documented in [desktop testing](desktop-testing.md).
Runtime inspection confirmed only named `/config` mounts, `privileged=false`,
loopback published ports and no native host folders. The Obsidian process runs
as UID 1000 under LinuxServer's container-root supervisor; Zotero uses UID 10001.

## Evidence

### Browser login follow-up

Zotero 10's Account → Log In needs an external browser. The original image had
none: the desktop waited for login while GLib reported that it could not launch
the default application. The replacement adds checksum-pinned Mozilla Firefox
and container-only HTTP/HTTPS/Zotero protocol associations. It does not change
Mac associations or mount Mac browser profiles.

A disposable native ARM64 profile opened Firefox and the official Zotero login
page through that button. Firefox's first-run Terms screen and the account login
require operator interaction; this is browser-launch proof, not authenticated
callback or sync acceptance. No terms were accepted on the operator's behalf.

The initial combined browser/app launch reached the 256-thread cap (`pids.events`
recorded 54 failures), with failed subprocess creation. The replacement permits
512 threads and 1.5 GiB memory. After restarting the disposable check, the login
page rendered without the earlier page-crash banner; thread-limit and OOM event
counters remained zero. This is not a sustained sync workload test.

The old health probe also closed the RFB connection before authentication,
triggering TigerVNC's blacklist while falsely reporting success. The replacement
finishes a bounded shared handshake, without input or framebuffer requests.
Native regression tests reproduced the old false success and verified thirty
new probes without blacklisting or disconnecting an existing synthetic viewer.
Local focused tests pass: eight JavaScript tests and nineteen Python tests,
with two native-only Python skips. Those two native cases passed separately in
the helper's disposable ARM64 container. Full `npm test` and lint also passed.

The retained desktop was recreated with the qualified image and its original
named volume. It passed health readiness and reopened the `ScholarServer Test`
collection in the browser. Obsidian was not recreated. The browser-check
container and its disposable writable layer were removed and absence verified;
the retained Zotero and Obsidian volumes were preserved.

### Initial desktop and persistence checks

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
