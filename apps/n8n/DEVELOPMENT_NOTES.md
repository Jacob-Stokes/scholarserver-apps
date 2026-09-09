# n8n integration — development record

Status: public candidate images; installed in Freelove's local development catalog
through Manager. A separately approved development identity provides private
editor access. Owner setup, sign-in and Manager workflow operations pass on that
development connection. Not published in the official catalog; automated access
lifecycle and Manager restore acceptance remain incomplete.
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
The deployed Manager path is verified below. No browser-supplied
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
Compose's environment allowlist is unchanged. Native login works on the separate
development hostname; generated external URLs and automatic proxy provisioning
still require release acceptance.

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
  its normal settings UI. This historical check predates the password-only adapter below.
  An initial test read the redacted UI key and received 401. Reading the issued
  raw key in memory fixed the test; credentials are not written to its output.
- Later native, recovery and deployed Manager evidence is recorded below. This
  initial source/API pass did not establish those results.

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

The native image workflow is manual to avoid repeatedly hitting an upstream pull
limit. The subsequently published candidates are recorded below; the earlier CI
failures are not successful native-build evidence.

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
Both integration and wrapper images were published as architecture-specific
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
endpoint initially responded through `/apps/n8n/api/status` with `connected: false`.
The owner and connection were subsequently configured as recorded below. The
separate user trials remain intact.

Automatic editor access fails because `application_origins.go` only inspects container-managed
Tailscale, while Freelove's working connection is host-managed. Further source
inspection found that its Caddy route strips all Cookie and Set-Cookie headers.
The pinned n8n image's `dist/auth/auth.service.js` reads and sets `n8n-auth`, so
the current proxy is incompatible with native login. Separate ports do not isolate
cookies. The development editor therefore uses a separate private hostname;
do not remove the stripping policy as a shortcut. This is
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
was submitted or credential read by that initial check. This manually provisioned
development identity is not yet created, backed up or removed by app lifecycle
operations. Preserve its state until lifecycle management is implemented. The
official release still requires automatic lifecycle integration.
That initial deployment used manual owner/API-key setup, superseded by the
password-only adapter below. Post-install settings, workflow credential onboarding
from Manager and explicit migration remain implementation work.

### Deployed owner, connection and workflow acceptance

The owner was created through n8n's normal browser setup using user-supplied
details. Optional assistant onboarding was skipped. A fresh page load retained
the session, and explicit sign-out followed by sign-in succeeded on the separate
private hostname. No authentication bypass or account database edit was used.

A 30-day development API key has eight custom scopes: `workflow:create`,
`workflow:list`, `workflow:read`, `workflow:update`, `workflow:activate`,
`workflow:deactivate`, `execution:list` and `credential:create`. It expires on
9 October 2026. n8n abbreviates the displayed key; use its Copy control, not
the shortened display. The initially unused key was rotated during transfer
diagnosis. No raw key or password is retained in this documentation.

The first real setup write found that Manager dropped `x-requested-with` from
its app-UI proxy. Core commit `4eaee8a` forwards only that additional marker and
adds a route regression test for the JSON body, secret-header exclusion and
cross-origin rejection. Full `pnpm check`, the Manager production build and
native ARM image build passed. Freelove now runs
`scholarserver-manager:4eaee8a-arm64` using an additional
`/opt/scholarserver/manager-4eaee8a.override.yaml`; the prior image/configuration
remain available for rollback. No executor change was required in this pass.

Through the deployed Manager screen, the scoped connection succeeded, the YAML
test template was installed once with a six-hour interval, and enabling then
disabling succeeded. Native n8n listed the same single workflow. A manual test
execution succeeded and appeared in Manager's recent runs. The test reads no
research data and calls no external service; its schedule is left disabled.
Connection and journal files are UID/GID 1000 and mode 0600. This proves the
development-host path, not automatic fresh-host access provisioning or Manager
backup restoration. Existing user trial containers were untouched.

Restarting both installed n8n containers preserved the connection, single
six-hour workflow, disabled schedule and successful execution history. A fresh
Manager page verified them after both containers became healthy. This is a
same-host restart check, not restoration from backup. No paid host was created.

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
At that stage this was not native acceptance; later deployed checks are above. Credential onboarding
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

### Password-only setup candidate (beta.2)

The normal form now asks only for a password and confirmation. A declared secret
onboarding action passes it through Manager and the narrow executor file queue to
the app controller. There is no browser API-key input or direct HTTP password
endpoint. The controller removes the short-lived request before contacting n8n;
only n8n's password hash and a protected API connection remain. Lost browser
connections do not own the controller's operation. Orphan responses expire.

`bootstrap-client.mjs` isolates n8n 2.38.1's private `/rest` owner/sign-in/key
contract. Workflow operations continue using the public API. The normal owner
setup endpoint rejects existing accounts. Environment-managed owner setup was
explicitly rejected because its loader can overwrite an existing owner.
The account is `owner@scholarserver.invalid`; no external email account is required.
The generated key has eight narrowly selected scopes, no expiration and an
upstream-compatible 50-character random ownership label.

The controller journals ownership before mutation, reauthenticates an interrupted
owner claim, and locates/rotates only its own key after a lost key response. It
does not recreate a missing database after a recorded attempt. That ambiguous
case requires recovery; a timeout is not permission to reset user state. Existing
valid connections return Ready without an account write or key rotation. Legacy
expiring keys keep their expiry until an owner-authorized reconnect.

Source tests cover redaction, bounded responses, preservation, stale keys with
missing databases, interrupted owner/key replies, duplicate submissions, stale
queue requests and secret-file cleanup. The native ARM64 disposable test passes
password-only action setup, sign-in with the chosen password, scoped key creation,
credential creation, rejection of owner replacement and controller restart.
An initial artifact test caught the upstream 50-character key-label limit; the
shorter ownership label has a regression assertion. Deployment and additional
browser/platform acceptance are recorded below.

The native AMD64 test on Resolution also passes password-only action setup and
controller restart. Images from source `2527afd` were published as an immutable
multi-architecture integration index:
`sha256:7f910fce3bab4daec4619e2505ecbfd1b01a674c8b0ec5c705ec0cd24f1e0927`.
The runtime image is unchanged. Manifest and Compose both pin this index.
The full apps suite passes, including 34 focused n8n tests.

Native ARM64 Chrome acceptance passes configured template installation, schedule
enable/disable, reload, runs, Ready configuration, mobile width, rejected writes
without the required marker, removal of the old key route and direct-edit
protection. The fresh Manager-installed disposable instance
`n8n-setup-acceptance-a` passes the actual HTTPS Manager/executor action from the
mobile-width password form, followed by template installation, enable/disable,
reload and Ready configuration. Both containers restarted and the automatic
connection remained Ready. No native editor address or copied API key was used.

A first disposable instance name produced a 66-character container hostname.
Docker DNS did not resolve it, although direct container-IP access worked. Core
`application-endpoints.ts` bounds only the project prefix, not its service suffix.
This is a deferred platform identifier-limit defect, not an n8n authentication
failure; the shorter test name passed. The default `n8n` name is unaffected.

Beta.2 is deployed to Freelove's existing `n8n` instance through Manager's
development lifecycle API. A Manager application backup
`d2eb7728102b4ff105d9847e` was verified before updating; this verifies the backup,
not a restore. The account's existing connection was reused without creating
an owner-setup journal. Workflow inventory, configured six-hour interval, disabled
schedule and installation receipt exactly match the pre-update snapshot. A
fresh 390-pixel Chrome page shows `n8n is ready` in Configuration with no password
or API-key form. Both deployed services are healthy. No core changes were needed.

Both disposable Manager instances were removed through lifecycle operations;
their synthetic application data was deleted and absence verified. Native test
containers/volumes/networks were removed by test traps, and the temporary
Resolution build checkout was deleted. Existing trial installations and the
private editor identity were preserved. No paid server was created. This remains
a local-development catalog deployment, not official catalog publication.

### Remaining gates

1. Implement catalog-managed private hostname provisioning, recovery and removal
   without weakening cookie isolation or replacing existing host access.
2. Verify a Manager-driven encrypted backup/restore, including workflow credential
   decryption and the private access identity lifecycle.
3. Implement reviewed post-install settings and workflow credential onboarding;
   preserve direct edits and reconcile uncertain writes.
4. Keep legacy automation controls/history until explicit migration is verified.
   Publish a new immutable catalog package only after its release gates pass.
