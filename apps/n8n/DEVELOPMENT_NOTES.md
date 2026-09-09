# n8n integration — development record

Status: public candidate images; installed in Freelove's local development catalog
through Manager. A separately approved development identity provides private
editor access. Not published in the official catalog; automated access and login
lifecycle acceptance remain incomplete.
Updated: 9 September 2026.

## Ownership and intended interface

n8n owns workflow execution and workflow credentials. Reviewed YAML templates
contain native n8n nodes and connections; they are not an additional execution
language. ScholarServer will offer template installation and configuration,
status and an optional advanced editor. The existing Zotero automation worker,
settings, schedules and history have not been changed or migrated.

The app-owned client uses the public `/api/v1` API and an installation-specific
API key. It must be called behind authenticated platform/application routes,
never directly from a browser with a service key. The app-owned setup UI and
controller now support connection, template installation, activation and runs.
Authenticated Manager routing still needs package acceptance. No browser-supplied
destination may select the controller's base URL.

Workflow creation writes a receipt before contacting n8n. Duplicate calls return
the receipt. Uncertain outcomes are reconciled by inventory, never automatically
replayed. The journal has one controller-process owner, not cross-process locks.
A matching operation marker is not an authentication boundary. API access must
be scoped to the intended installation. Direct n8n edits need a review step;
fingerprints detect changes but are not atomic upstream compare-and-swap locks.
The initial interval is configurable before installation; existing workflow
replacement and migration are not wired up yet. Upstream's
2.38.1 public update controller explicitly uses `forceSave: true`; a preflight
fingerprint does not protect a concurrent edit. Activation selects the inspected
version instead of implicitly publishing the newest draft.

## Package and data

The candidate pins upstream n8n 2.38.1. The container is non-root with a read-only
root filesystem. `/home/node/.n8n` holds SQLite, credentials, encryption key and
other upstream state; preserve and recover it as a unit. A separate writable
`/home/node/.cache` holds generated UI assets and is reproducible. Native startup
failed without this cache, then failed until its owner matched UID/GID 1000.
The manifest declares those permissions for executor provisioning.

The editor is a private isolated origin with native n8n sign-in. `none-private`
describes the platform routing boundary, not an anonymous n8n account. No public
webhook access or gateway MCP is enabled. No Docker socket, host directory or
cross-application network is mounted. Outbound networking remains broad in the
platform's current network model; it is not destination-level isolation.

The candidate manifest now references published multi-architecture images. The maintained
image layer disables diagnostics, personalization, community packages, environment
access from nodes and command/local-file nodes, and bounds execution retention.
These settings and read-only startup were verified on native ARM64 and AMD64.
Compose's environment allowlist is unchanged. Generated external URLs, cookies
and proxy settings still need native-editor access acceptance.

The n8n API key must stay in protected application/platform state, not this
journal. Workflow credentials belong only in n8n; UI retains IDs and connection
status. OAuth onboarding has not been verified. Backups must encrypt secret
material, and a real restore must prove credential decryption before release.

## Evidence

- Platform `loadAppPackage` validates the candidate manifest and Compose.
- Package contract tests pass, including pinned icon and declared services/data.
- Fourteen focused source tests pass: redaction, bounded responses, uncertain writes, template
  validation, direct-edit fingerprints, duplicate create, restart reconciliation,
  and corrupt-state rejection. Included in `npm test` via `pretest`.
- Full `npm test` passed with the focused tests included through `pretest`.
- Isolated native Freelove container imported and executed the YAML test workflow
  using supported n8n CLI commands. This is not public-API or Manager acceptance.
- A separate fresh test database passed public-API workflow create/read/list,
  enable/disable, execution listing, credential create/delete and workflow cleanup.
  The test creates an owner through the browser and observes the key issued by
  its normal settings UI; production code does not call private account APIs.
  An initial test read the redacted UI key and received 401. Reading the issued
  raw key in memory fixed the test; credentials are not written to its output.
- Native ARM startup, encrypted backup/restore, actual Manager installation,
  protected credential setup, UI, migration, publication and
  deployment remain outstanding.

### Subsequent integration acceptance

- Manager source checks and production build pass with capability-based Automations
  navigation, missing-platform installation guidance and preservation of legacy tabs.
- Real Chrome acceptance on a fresh native ARM64 n8n instance passed connection,
  template installation, enable/disable, page reload, execution listing, mobile
  width and missing request-header rejection. Personalization is disabled, so the
  owner setup test waits for navigation rather than the optional survey screen.
- Restarting both containers preserved the saved API connection and installation.
  Connection and receipt files are mode 0600, owned by UID/GID 1000.
- An encrypted restic snapshot restored to a separate directory preserved those
  files and successfully decrypted a synthetic n8n credential using the restored
  encryption key. This is container-level recovery, not Manager restore acceptance.
- Idle observation: n8n approximately 332 MiB; integration approximately 37 MiB.
  This is one idle sample, not a workflow-load benchmark.
- Native ARM integration image builds locally. The upstream ARM n8n pull encountered
  Docker Hub's unauthenticated rate limit. CI run 34343597454 hit the same upstream
  limit on both native architectures before building. No images were published.
- The updated ARM64 controller passed explicit-version publication, invalid boolean
  rejection and a real direct-edit conflict test (HTTP 409, workflow left disabled).
  Check scripts operate only on the separate disposable acceptance installation.
- User trial containers and data were not changed. No paid server was created.

The native image workflow is manual to avoid repeatedly hitting the known pull
limit. Publication needs authenticated upstream pulls or the rate limit to clear.

Architecture correction: live `uname -m` and image inspection confirm Freelove is
ARM64. Earlier AMD64 labels in this record were incorrect and have been corrected.
The Mac passed the full configured-install browser/API checks on native ARM64.
Resolution (`uname -m`: x86_64) subsequently passed native read-only startup and
the same browser/public-API checks, including configured six-hour installation,
enable/disable, reload, mobile width, execution listing, synthetic credential
creation/deletion, exact-version publication and direct-edit conflict protection.
Its temporary containers, volumes and network were removed after the checks.
CI retry 34346459704 still hit the upstream rate limit; it is not AMD64 evidence.

The pinned upstream AMD64 image was downloaded on the Mac without execution and
transferred with `docker save`/`docker load` to Resolution. Its root filesystem
layers and effective runtime configuration matched after transfer; legacy Docker
and containerd inspect output differ in omitted empty fields and image IDs.
The native wrapper build used a named build context pointing to that verified
local image, preserving the pinned Dockerfile without another registry pull.
Both integration and wrapper images are being published as architecture-specific
`sha-5200aebcfc1137f789ac0309a8de363c16486ccc` candidates. GitHub package visibility
is public. The runtime index is `sha256:4076ee8130e3cc0bf480cfcdb10c53ce1d8e58cacbd980d658976474c8249d32`;
the integration index is `sha256:cb5ade32accdb1a95211a6f9d836904320af258295dff98421b7a5a62910dcd2`.
Anonymous registry reads verified both indexes and their native architecture entries.

### Manager installation and remaining editor boundary

Core source `5eea193` passed `pnpm check`, the Manager image build and executor Go
tests. Freelove's Manager and executor were updated with their configuration and
application data preserved. A protected rollback snapshot and prior executor are
retained at `/opt/scholarserver/pre-5eea193.HAIdXz`. The old executor rejected
`launchLabel`; the updated version accepts the package without weakening its schema.

The candidate was staged only in the local development catalog. Manager operation
`4df9f365-4293-4329-b41c-95926c20704e` installed instance `n8n` with both services
healthy and no warnings. The Automations tab discovers it and its app-owned setup
endpoint responds through `/apps/n8n/api/status` with `connected: false`. No owner
or API key has been created in this instance. The separate user trials remain intact.

Editor access fails because `application_origins.go` only inspects container-managed
Tailscale, while Freelove's working connection is host-managed. Further source
inspection found that its Caddy route strips all Cookie and Set-Cookie headers.
The pinned n8n image's `dist/auth/auth.service.js` reads and sets `n8n-auth`, so
the current proxy is incompatible with native login. Separate ports do not isolate
cookies. Keep the editor closed pending a separate private hostname and cookie
boundary acceptance; do not remove the stripping policy as a shortcut. This is
why automatic catalog access cannot use the existing isolated-port route.

The user subsequently approved a dedicated Tailscale identity from their phone.
Container `scholarserver-n8n-private` uses the platform's pinned Tailscale image,
userspace networking, no host ports/devices/capabilities and persistent state at
`/var/lib/scholarserver/access/n8n-private` (0700). Its deployment file is
`/opt/scholarserver/n8n-private.compose.yaml`; it joins only n8n's application and
egress networks, not the Manager edge network. Serve HTTPS 443 proxies to
`http://n8n:5678`; no Funnel route is enabled. The existing host connection and
user trial containers were not changed.

`https://scholarserver-n8n.tailc56b3d.ts.net/` returned HTTP 200 and rendered owner
setup in a 390-pixel-wide Chrome viewport. The first request timed out while
Tailscale issued its certificate; the subsequent request succeeded. No account
was submitted or credential read by this check. This manually provisioned
development identity is not yet created, backed up or removed by app lifecycle
operations. Preserve its state until lifecycle management is implemented. The
official release still requires that integration and native login acceptance.
The initial owner/API-key setup still opens n8n once. Post-install settings, credential
onboarding from Manager and explicit migration remain implementation work; they
are not counted as completed by these lifecycle tests.

### Configured installation and rejected-request recovery

Reviewed YAML can identify a native hourly schedule node. The install form accepts
an interval from 1 to 168 whole hours, applies it to a cloned native workflow and
leaves activation off. There is no arbitrary parameter-path language, expression
input or secret field. Configuration lives in n8n after creation; the journal
continues to hold only receipts and fingerprints. Existing workflows are not
overwritten, and direct-editor changes keep their existing protection.

A definitive rejection now offers an explicit retry tied to the rejected operation
ID. Concurrent or stale retry requests cannot create extra copies. Unconfirmed
requests remain reconciliation-only, including after restart. Invalid settings
fail before writing a receipt or contacting n8n.

Source tests cover these transitions. A mocked Chrome check covers custom interval
submission, failed-save draft preservation, refresh preservation and mobile width.
This is not a new native n8n acceptance or a deployed feature. Credential onboarding
and migration are still outstanding; no user credentials or existing automations
were changed in this pass.

The full apps test suite passes with 21 focused n8n tests. The independent UI build
and cached native ARM integration image build/startup pass. This verifies the
controller image, not native ARM n8n or Manager installation. Test containers and
the local browser preview are closed; no paid resources were created.

## Focused platform secret review

Core `cmd/executor/internal/executor/action.go` validates declared input fields,
uses 0700 request/response directories, writes requests atomically as 0600 files
owned by the declared app UID, and removes request/response files on return.
This can carry a declared secret setup field without adding a vault. App-owned
code must still redact responses/errors and store its API key outside workflow
receipts. This is a focused code read, not a complete secret-lifecycle audit.

Sources: upstream versioned `packages/cli/src/public-api/v1/openapi.yml`, workflow
public controller and credential schemas at the `n8n@2.38.1` GitHub tag. Managed
hosting licensing is a separate future decision; preserve upstream licensing.

## Next acceptance sequence

1. Add protected setup and authenticated app-owned controller routes; verify a
   real n8n API key without reading or replacing the user's existing credentials.
2. Wire install/list/enable/history into the automation interface; implement
   declared template settings and explicit direct-edit conflict handling.
3. Offer n8n installation when missing. Preserve old automation controls/history
   until an explicit, verified migration disables old schedules.
4. Exercise isolated-origin access, restart, credential backup/restore and both
   native architectures; only then publish a new immutable catalog package.
