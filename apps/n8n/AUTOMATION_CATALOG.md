# Guided automation catalog

This is a source candidate, not a new published package. The pinned beta.4
integration image does not contain these changes.

## Experience

**Catalog** describes research outcomes and shows each required application's
packaged icon, name and role. A missing icon falls back to its initial and visible
name. Icons are loaded only from the authenticated Manager's local catalog.
Templates remain reviewed native n8n YAML; requirements and presentation live
beside their nodes, not in Manager.

Choose **Set up**, give the automation a name, choose its app instances and output
folder, and select the interval. The workflow is created disabled. **My automations**
shows its saved bindings, schedule and recent execution statuses. A second copy
has its own stable identity, n8n workflow, credential and scoped research grant.
The connection-check template lives under Configuration as an execution diagnostic.

Availability is deliberately bounded: the service API lists healthy, authorised
app actions. Absence alone does not tell this integration whether an app is
missing, stopped, incompatible or ungranted. Cards explain that uncertainty rather
than claiming installation is the only repair. Available actions do not prove a
selected library/folder works; real execution is separate evidence.

## State and recovery

- n8n owns graph content, schedules, credentials and execution state.
- Integration receipts own configured-copy identity, template provenance,
  operation identity and non-secret scope bindings.
- Existing template-keyed records are retained without recreating workflows,
  rotating credentials or changing activation. New copies use UUID keys in the
  same journal. Original IDs remain addressable for older clients.
- Repeated submissions with the same identity return the existing receipt.
  A definitive rejection can be retried only with that operation's ID. An
  uncertain creation blocks another copy of the same template until reconciled.
- Before creating a workflow, persist its submitted fingerprint after credential
  references have been attached. Reconciliation will not adopt a different graph
  as a newly trusted guided workflow. Upstream normalisation can leave an uncertain
  request needing manual review; it must not trigger a second create.
- Inventory traverses all pages up to a bounded limit. Repeated cursors,
  duplicated IDs or a failed page do not produce a misleading partial listing.
- Native edits are labelled Customised. Original roles remain visible as
  provenance, not a claim about the modified graph. Refresh never writes a graph.
  Guided enablement checks the actual fingerprint and publishes the inspected
  version. Disable remains available for customised active workflows.
- Research access is checked before enablement and on each research request.
  Disabling future triggers, revoking research access and undoing prior output
  are distinct. There is no automatic undo.

The journal still has one controller-process owner. This is not a cross-process
database or an exactly-once guarantee for external services. Preserve n8n's state,
encryption key and integration runtime together in backups.

## Extension boundary

Requirements have explicit package IDs, app-role bindings and action IDs.
Source tests compare those declarations with both the implemented bridge's action
set and the package grants. The form and server require every listed action;
one representative action is insufficient.

This does not add a generic form language, graph compiler, scheduler, permission
engine or n8n-specific Manager code. A new workflow can use existing supported
research operations; a new app operation requires an explicit app-owned bridge
change and tests.

## Remaining release and product gates

- Publish a new immutable integration/package after final native architecture
  acceptance. Do not repoint beta.4 at a different image.
- Prove real Zotero, Obsidian/Docling and Manager action queues with compatible
  app releases; synthetic responses and real note writes are not that proof.
- Add signed data-only summaries for browsing before a platform is installed.
  Current discovery still starts inside an installed platform.
- Add explicit update review, scoped first-run result summaries, connection
  repair and supported post-install parameter editing. Catalog refresh must not
  apply template updates.
- Broader dependency diagnostics need narrowly authorised inventory, not broader
  workflow execution privileges.

No second engine, legacy migration or live research activation is part of this pass.
