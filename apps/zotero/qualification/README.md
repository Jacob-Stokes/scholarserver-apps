# Read-only research metadata qualification

Run source checks from the apps checkout:

```sh
node --test apps/zotero/controller/research-items.test.mjs apps/zotero/package/research-action.test.mjs
node scripts/check-image-source.mjs --recipe zotero-controller
node scripts/check-image-source.mjs --recipe zotero-controller --lock catalog/image-source-lock.json
```

The inventory check is not an image check. The lock check may reject unrelated
shared-UI source drift recorded in core deployments; do not overwrite accepted
records to force it to pass. The following fixture verifies the exact two
reviewed controller/reader files from the selected immutable image independently.

On an approved native Linux Docker engine, with the package's exact controller
image already cached and this checkout available locally to that engine:

```sh
node apps/zotero/qualification/check-pinned-controller.mjs
```

This **creates and removes a disposable test container**; it is not a command to
run inside the installed Zotero container. Remote execution still requires the
core deployment preflight/approved scope. Do not pass personal data mounts or
credentials, use `docker exec` on retained apps, clear caches or pull/build images
as a diagnostic fallback. The harness does none of those things.

The wrapper selects the controller digest from the candidate manifest, checks it
against Compose and the cached image, rejects non-native execution, and launches
with network none, read-only root, UID 10001, no capabilities, no published ports,
a read-only harness mount and bounded runtime/tmp tmpfs. Only newly generated
synthetic runtime data is writable. It neither mounts nor changes source runtime
files in `/app`; it compares their SHA-256 values with the reviewed checkout.
The same image's Node starts its actual `/app/controller.mjs` against a loopback
synthetic HTTP API using existing supported environment configuration.

The fixture submits only `research-items` through the real runtime mailbox and
checks selected fields, exclusion of sensitive/attachment data, empty output,
invalid windows, invalid metadata, bounded pagination, and controller restart.
Every observed upstream request must be GET; unexpected routes or credential
handling fail. It verifies that synthetic configuration/credential bytes remain
unchanged. Output is a compact JSON receipt containing image identity,
architecture, source hashes and outcomes, never credentials or research data.
The wrapper removes only its uniquely named/labelled test container if needed
and verifies absence. No persistent test volume or host data directory is created.

Docker was unavailable on the operator Mac; this pass provides the harness, not
a successful image receipt. A source pass or a healthy installed container is
not a substitute. This proves synthetic local-API controller behaviour only,
not a real library/Web API, production Manager grant enforcement, account sync,
browser execution or the complete report pipeline.
