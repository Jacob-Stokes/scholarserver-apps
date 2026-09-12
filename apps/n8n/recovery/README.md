# Manager-driven n8n recovery check

`apps/n8n/check-manager-recovery.mjs` is an operator-only integration check. It
creates a separate installation on a native Docker daemon with a fresh named
volume, Manager, executor and the supplied n8n package. It never connects an
online account, mounts a personal library or uses an existing n8n installation.

The helper is trusted operator tooling with the Docker socket. Manager runs
unprivileged, read-only, without that socket or executor-private state. Administrative
requests originate on Manager's real loopback interface; service requests use the
ordinary Manager-issued application credential. No authentication bypass is added.

## Prepare and run

Use a local rootful Docker daemon, including Docker Desktop's Linux VM. Rootless
Docker's different volume root is deliberately rejected. The daemon architecture
must match both supplied images. Only native ARM64 has been exercised in this pass;
the AMD64 path is not new AMD64 acceptance evidence.

1. Export exact committed core/apps sources using core's
   `scripts/export-build-source.sh` with an **absolute** output path. Record the
   `sources.json` receipt. Do not copy Git credentials or uncommitted runtime edits.
2. Build the Manager with that export's `apps/manager/Dockerfile`. Compile its
   executor for Linux and the daemon's native architecture with `CGO_ENABLED=0`.
3. Put the compiled binary, named `executor`, in a fresh helper build directory.
   Build `dev/n8n-recovery/Dockerfile` using that directory as the context. This
   image installs Docker CLI, Compose and restic for testing; it is not a release
   runtime or a claim of reproducible OS-package versions.
4. Run from the apps repository after its locked dependencies are installed:

```sh
N8N_PROOF_EXECUTOR_IMAGE=sha256:EXACT_LOCAL_HELPER_IMAGE_ID \
N8N_PROOF_MANAGER_IMAGE=sha256:EXACT_LOCAL_MANAGER_IMAGE_ID \
N8N_PROOF_CORE_COMMIT=FULL_CORE_COMMIT \
N8N_PROOF_PACKAGE_DIR=/absolute/path/to/exported/apps/n8n/package \
node apps/n8n/check-manager-recovery.mjs
```

The check records image IDs, operator-supplied core commit, manifest hash, package
version and daemon architecture. The commit label is not an image signature;
retain the source export and image-build evidence separately.

## Acceptance and cleanup

The check installs the full package through Manager, completes normal owner and
service-credential setup, checks service authentication and an undeclared-action
rejection, then executes a real n8n workflow using a synthetic HTTP credential.
Manager creates an encrypted application backup. An allowed native API update
removes the workflow's authentication and its execution fails. Manager restores
the backup and the original authenticated execution succeeds again.

The API key intentionally has no workflow/credential deletion scopes. Do not
broaden them for this test. It changes a disposable workflow through the existing
update scope and removes the whole test installation through Manager afterward.

Normal and exceptional completion remove the owned containers, named data volume
and networks, then verify absence. A process kill or Docker failure can interrupt
cleanup: use the printed unique scope to inspect exact remaining resources before
removing them. Never prune Docker or remove unrelated application data. Built
images remain available for another run.

This is same-host Manager/executor recovery, not a signed fresh platform install,
cross-host/off-site restore, browser sign-in test, real research-app grant test or
managed private-editor hostname lifecycle acceptance.
