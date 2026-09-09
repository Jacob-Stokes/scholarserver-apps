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
never directly from a browser with a service key. This routing and setup UI are
not implemented yet. No browser-supplied destination may select its base URL.

Workflow creation writes a receipt before contacting n8n. Duplicate calls return
the receipt. Uncertain outcomes are reconciled by inventory, never automatically
replayed. The journal has one controller-process owner, not cross-process locks.
A matching operation marker is not an authentication boundary. API access must
be scoped to the intended installation. Direct n8n edits need a review step;
fingerprints detect changes but are not atomic upstream compare-and-swap locks.
User-editable settings, updates and migration are not wired up yet.

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

This upstream-image candidate uses upstream configuration defaults. Desired
telemetry, community-node and execution-retention defaults are NOT enforced:
the platform correctly rejects arbitrary environment settings in package
Compose. Do not weaken that policy. A reviewed configuration/controller or
maintained image layer is a release prerequisite. Generated external URLs and
proxy settings also require actual isolated-origin acceptance before release.

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
