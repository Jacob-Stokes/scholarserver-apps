# Native candidate checks

This directory is outside catalog discovery. `compose.yaml` remains a non-runnable
design sketch. `native_probe.py` is a separate **opt-in disposable test**, not the
ScholarServer installer or an approved deployment recipe.

Build from the repository root on a native Linux Docker host:

```sh
docker build -f apps/paperless/integration/Dockerfile -t scholarserver-paperless-native:20260907 .
python3 apps/paperless/development/native_probe.py
```

The probe requires uid 0 or 1000 to prepare private files owned by the container's
uid 1000. Docker must be available. It selects unique project/volume/network names,
publishes only dynamically assigned loopback ports, uses no host research mounts
and removes its containers and synthetic volumes in `finally`. Pulled images and
build cache are not globally pruned. An abrupt host failure can bypass cleanup;
the printed exact project ID identifies resources for review, not a global prune.

Inputs are pinned upstream Paperless 3.1.3, PostgreSQL 18.3-alpine and Valkey
9.0.3-alpine image digests. These are a candidate compatibility set, **not** an
up-to-date security certification. Before release, review security advisories,
SBOM/licences and supported native architectures. The integration has a separate
locked runtime dependency tree; the shared build-stage lock also needs advisory
review even though those build dependencies are not copied into the final image.

## What the probe does

1. Starts native services with generated file-based secrets and no Linux
   capabilities. Paperless and MCP use uid 1000 and read-only root filesystems.
2. Waits for native migrations and HTTP readiness.
3. Seeds two synthetic accounts and ownership records, guarded against existing
   users, then uploads a generated one-page PDF through the native multipart API.
   Waits for its specific consumption task; verifies extracted text and exact
   original bytes. The fixture account can upload; the production MCP stays read-only.
4. Starts the real MCP image with the restricted native reader's token.
5. Checks anonymous MCP rejection, visible document text, hidden document denial
   and ACL-filtered search, then repeats after restarting Paperless and MCP.
6. Stops writers, captures a native database dump and matching media/index, and
   restores into a second project with demonstrably distinct volumes. Repeats
   MCP/ACL and original-byte checks. Both projects use the same host and private
   token files; this is not cross-host credential recovery or in-flight job recovery.
7. Removes and verifies removal of both projects' containers and data volumes.

No browser onboarding, Manager installation, installed Gateway/OAuth, scanned-image
OCR quality, Manager backup/restore or production deployment proof follows from
these checks. See REVIEW.md for which complete executions actually passed.

## Access screen checks

After building the UI, run `node apps/paperless/development/check-access-ui.mjs`
with `SCHOLARSERVER_BROWSER_MODULES` pointing to installed Playwright modules.
An optional `SCHOLARSERVER_BROWSER_CHANNEL=chrome` uses installed Chrome. This
serves the real UI with a synthetic Manager API; it checks recommended private
access, required sign-in, preserving a failed-save draft, explicit retry and the
confirmed Open URL. It does not create routes or provision a native account.

## Runtime details discovered

- Upstream s6 init stages executables in `/run`; the temporary mount must permit
  execution. This does not require root or a writable system image.
- Docker 29 did not publish ports for this internal-only test network. A separate
  probe bridge exposes only loopback HTTP ports; the DB and broker remain on the
  internal network. Production routing must use Manager's normal access layer.
- Host root-created private files must be assigned to uid 1000 before mounting
  them into the non-root MCP. Do not weaken file permissions as a workaround.

Upstream references:
- https://github.com/paperless-ngx/paperless-ngx/releases/tag/v3.1.3
- https://github.com/paperless-ngx/paperless-ngx/blob/v3.1.3/docker/rootfs/etc/s6-overlay/s6-rc.d/init-start/run
- https://github.com/paperless-ngx/paperless-ngx/blob/v3.1.3/docker/rootfs/etc/s6-overlay/s6-rc.d/init-env-file/run
- https://github.com/paperless-ngx/paperless-ngx/blob/v3.1.3/docker/compose/docker-compose.postgres.yml
