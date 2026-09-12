# Isolated desktop test clients

These are real Linux desktop clients running in Docker Desktop on the operator
Mac, not another ScholarServer server and not the native macOS applications.
Freelove is the retained development server. Use disposable hosts for fresh
installation acceptance and delete them after those tests.

## Open and operate

- Obsidian: <http://127.0.0.1:18330/>
- Zotero: <http://127.0.0.1:18331/vnc.html?autoconnect=true&resize=scale>

The Obsidian profile contains `ScholarServer Test`, a vault created through its
desktop interface under `/config`. That is a container path, not a Mac folder.
Zotero starts with its ordinary upstream profile and library under `/config`.
No ScholarServer bridge, ZotMoov or other extension is installed in this Zotero
client. It is deliberately separate from the server-side Zotero package.

From this repository, with Docker Desktop already running:

```sh
npm run dev:desktops -- start
npm run dev:desktops -- status
npm run dev:desktops -- stop
```

Start checks local Docker endpoint, native ARM64 image architecture, qualified
image IDs and existing resource ownership. Unknown same-project containers stop
the operation; inherited Compose orphan deletion is disabled. The helper does
not build, pull, reset accounts or configure sync.
Stop stops only this project's two services and retains all profile data.
There is no reset/delete command. Containers restart with Docker unless they
were explicitly stopped; neither helper starts Docker nor prevents Mac sleep.

## Isolation and access

Compose project `scholarserver-test-desktops` owns:

| Service | Persistent volume | Contents |
| --- | --- | --- |
| `obsidian` | `scholarserver-test-desktops_obsidian-profile` | Desktop settings, vaults and future test sync credentials |
| `zotero` | `scholarserver-test-desktops_zotero-profile` | Default Zotero profile, library, attachments and future test sync credentials |

No host directories, native profiles, device nodes or Docker socket are mounted.
The clients have outbound network access for sync, but no published sync/API/VNC
ports. Only each browser desktop port is published, bound to `127.0.0.1`.
VNC itself listens only on Zotero's container loopback.

The local desktops have no web login and use HTTP/WebSocket over loopback. Other
local users/processes can therefore control these test profiles. Do not forward
these ports, put them on a public proxy or use personal research data. Obsidian's
loopback URL is treated as a secure browser context; WebCodecs was verified in
the in-app browser without a certificate exception. External deployment would
need authenticated TLS, not the same Compose configuration.

Zotero runs as UID 10001 with all capabilities dropped. LinuxServer's Obsidian
entrypoint runs its service supervisor as root inside the unprivileged container;
the desktop/app processes run as UID 1000. Both prevent new privileges. This is
not equivalent to a hostile-code sandbox: only install deliberately selected,
trusted test plugins. No host-wide Docker or browser security settings are changed.

Memory caps are 1.5 GiB for Obsidian and 1 GiB for Zotero, not reserved RAM.
The Mac had 16 GiB physical RAM and Docker about 3.84 GiB when provisioned.
Measure active sync and attachment workloads before increasing caps or concurrency.
Mac sleep and Docker shutdown suspend availability. These clients do not qualify
native macOS, Windows, mobile or cross-host recovery behaviour.

## Build inputs

Obsidian uses the pinned upstream LinuxServer image in Compose; the verified
desktop reports 1.13.7. Download that exact reference before the first start:

```sh
docker pull lscr.io/linuxserver/obsidian@sha256:c6c86336a2cf57506b0db2beb09ef4a50170808820a59c20063e669d12122dd4
docker build -t scholarserver-test-zotero:local dev/desktop-clients/zotero
```

Run the commands only against local native ARM64 Docker. The Zotero recipe
refuses other build/target architectures and verifies the upstream Zotero 10.0.1
archive checksum. Ubuntu is pinned; apt package repositories remain moving inputs.
This local image is not published or part of the signed app catalog.

The `x-qualified-image-ids` section in Compose records the images accepted on this
Mac. A changed local Zotero tag is refused before startup. After an intentional
rebuild, qualify it with a separate test profile, inspect its exact image ID and
deliberately update that receipt. Never replace the receipt merely to bypass a
drift failure. The recipe is rebuildable, not guaranteed byte-for-byte identical.

## Sync acceptance is a separate gate

Use dedicated test accounts and synthetic content only. Never sign these profiles
into a personal vault/library merely to make a test pass.

- Zotero desktop sync goes through the dedicated Zotero account. Metadata uses
  Zotero's service; attachment tests must name Zotero Storage or the configured
  WebDAV destination. A second server-side client needs the same test identity.
- Obsidian LiveSync uses a test CouchDB database on the development server.
  Official Obsidian Sync needs its own account/remote vault and any required
  subscription. Keep those two mechanisms in separate vaults.
- Test desktop create/edit → sync → server read → automation output → desktop
  receive, including attachment bytes and a second edit after reconnect.
  Mounting the same folder into both clients does not prove sync.

Account registration, email verification, client login and two-way server sync
must be recorded separately. This setup pass does not change Freelove or create
paid resources. Do not infer sync acceptance from a healthy desktop web endpoint.

## Maintenance checks

```sh
npm run test:desktops
npm test
```

The focused suite guards loopback exposure, separate volumes, Docker endpoint
selection, ownership refusal and Zotero child-process shutdown/readiness failures.
Runtime and browser evidence is recorded separately in `desktop-testing-acceptance.md`.

References: [Docker Desktop's Linux VM](https://docs.docker.com/desktop/features/vmm/),
[LinuxServer Obsidian](https://docs.linuxserver.io/images/docker-obsidian/),
[Zotero sync](https://www.zotero.org/support/sync).
