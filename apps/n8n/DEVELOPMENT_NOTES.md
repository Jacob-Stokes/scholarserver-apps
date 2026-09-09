# n8n integration — development record

Status: candidate source only. Not in the catalog, published or installed through Manager.
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
User-editable settings, updates and migration are not wired up yet. Upstream's
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

The candidate manifest still references the upstream image. The new maintained
image layer disables diagnostics, personalization, community packages, environment
access from nodes and command/local-file nodes, and bounds execution retention.
These settings were verified in a native AMD64 container but must be connected to
published immutable package images. Compose's environment allowlist is unchanged.
Generated external URLs and proxy settings need isolated-origin acceptance.

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
- Real Chrome acceptance on a fresh native AMD64 n8n instance passed connection,
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
  Docker Hub's unauthenticated rate limit; native CI verification is being added.
- User trial containers and data were not changed. No paid server was created.

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
