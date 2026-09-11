# n8n package update acceptance — 11 September 2026

The exact beta.2 → beta.4 package transition passed through the new executor
backup-bound update transaction. This updates the integration, **not the upstream
n8n version**: both packages use n8n 2.38.1. Freelove was not changed.

## Inputs and environment

- Core source: `1149b2431d23c758af191baee86a625491134f2a`.
- Native executor SHA-256:
  `f62439008dea0faa8a5732452b623ca77a6efbf2439b4273048ff2cb5a7cf9f5`.
- Old package: apps source `bca1fea`, `0.1.0-beta.2`.
- New package: apps source `7d85993`, `0.1.0-beta.4`.
- Both runtime references:
  `ghcr.io/jacob-stokes/scholarserver-n8n@sha256:4076ee8130e3cc0bf480cfcdb10c53ce1d8e58cacbd980d658976474c8249d32`.
- Old integration index: `sha256:7f910fce3bab4daec4619e2505ecbfd1b01a674c8b0ec5c705ec0cd24f1e0927`.
- New integration index: `sha256:ce82c53f9cbd7aa839d9fd1dbf1dd7c4d41474aab8aea5308e22c73584f591d7`.
- Test script: `check-executor-update.mjs`, SHA-256
  `21d8d00aba4f86eea20e36688731f9793afb84e983901dd325d76a07c07f7bb7`.

Resolution's isolated AMD64 rootless Docker daemon ran this test. The executor
ran as namespace root inside the existing CI toolchain image, with only the
disposable test directory and rootless Docker socket mounted. The host Docker
client and Compose plugin were mounted read-only. App containers used the package's
UID/GID 1000, read-only root filesystem and resource limits. Paths were identical
inside the harness and on the rootless daemon host so bind mounts referenced the
same data. No host system service or production Docker socket was used.

## Passed checks

1. Install beta.2 through executor plan/apply and wait for both services.
2. Set a generated disposable password through the declared executor setup action.
3. Create one disabled native workflow and an encrypted synthetic HTTP credential.
4. Verify workflow identity, successful native CLI execution, working saved API
   connection and decryption of the credential through n8n's CLI.
5. Apply beta.4 through executor plan/apply. The executor creates and verifies a
   fresh encrypted backup, stages the working copy and recreates both services.
6. Repeat the identity, execution, connection and credential-decryption checks.
   All managed directories retain UID/GID 1000 and mode 0700.
7. Verify the recovery journal is complete, then remove the app through executor.

The successful transient service invocation was
`6450c0a41fc94b74bd18029060cd439c`; elapsed time was 2 minutes 55 seconds.
The script never prints the generated password, API key or decrypted credential.
This is real executor/container/API/credential evidence, not a mocked HTTP test.

The complete apps `npm test` passed on Resolution afterward in 48 seconds
(invocation `a1e2aa0d19f84a5086825a3474134b00`). It used the current source archive
and cached dependencies with the same lockfile SHA-256. This was a source-only
container without a Docker socket. Local script syntax and scoped formatting
checks also passed.

## Cleanup and earlier failed attempts

No test containers or custom networks remained afterward. The synthetic data,
encryption key and backup repository were deleted. The runtime image downloaded
only for this test was removed from the isolated cache; it can be pulled again.
No paid server was created. The CI source runner restarted after the test.

The first runtime pull exceeded the CI account's 16-GiB filesystem. Reclaiming
1.25 GB of unused build cache allowed the retry; no published image or app data
was removed by that cache cleanup. An initial harness launch lacked a Docker
client and stopped before installing the app. Neither attempt is passing evidence.

## Remaining limits

- This does not qualify an upstream n8n version/database migration or downgrade.
- This run does not inject update failure; core's native synthetic migration test
  covers failure recovery separately. No n8n-specific failed-upgrade claim is made.
- The workflow is a harmless manual trigger, not a research integration. Credential
  decryption is verified, not an authenticated request to a real external service.
- Manager browser review, new platform-service grants, editor access and final
  signed-release acceptance remain separate. Existing beta.2 connections do not
  prove newly introduced research grants are automatically provisioned.
- Rootless namespace ownership is tested, not root-owned fresh-host installation,
  physical power loss, disk exhaustion recovery or recovery-copy maintenance.

Keep immutable packages unchanged. Publish and qualify a coherent core release
before using its new transaction on Freelove.
