# Research workflows

These reviewed YAML files contain native n8n nodes and connections. n8n owns
execution, schedules, credentials and editable workflow content. They do not use
an AI provider. Add a workflow from the Manager Automations screen, choose its
applications and folder, then review it before enabling its schedule.

**Development candidate, not deployed:** core source now provides the scoped
Manager service API and the n8n source package provisions its service identity
through setup. Source and synthetic HTTP tests pass. New immutable app packages
and a live workflow-to-app acceptance test are still required before release.

| Workflow | Behaviour | Prerequisites |
| --- | --- | --- |
| Zotero reading notes | Creates a scaffold for papers added in the last seven days; filenames use Zotero item keys. Existing files remain unchanged. | Zotero `research-items` and Obsidian `create-research-note` actions. These actions are source candidates, not in the currently pinned app packages. |
| Daily research digest | Lists papers added during the previous UTC day. Empty days produce no note. Existing dated digests remain unchanged. | The same two candidate actions. This is a daily digest, not a weekly or catch-up implementation. |
| Convert Zotero PDFs to Markdown | Matches shared PDFs to Zotero attachments, queues one Docling conversion at a time, waits, checks success and attaches the result to the original paper. OCR is off. | Zotero's complete workspace, Docling, and the same folder exposed in both apps. Fewer than 100 PDFs in that folder. |

Reading notes do not catch up after more than seven days offline. The digest does
not backfill missed days or update an existing digest when a late sync adds older
items. Item reads reject a truncated 1,000-item window rather than silently
dropping the remaining papers. PDF discovery rejects folders reaching its
100-file bound. Existing Docling results and Zotero attachment receipts are reused;
the previous Zotero automation worker is not migrated or changed.

## Connection boundary

The source candidate separates **Catalog** from **My automations**. Cards show
required app roles before setup. Each configured copy has its own identity,
connections and folder; old template-keyed receipts are preserved. Native edits
are labelled Customised and are never overwritten. The execution diagnostic is
under Configuration. See [catalog behaviour and remaining work](AUTOMATION_CATALOG.md).

Each installation receives a separate n8n HTTP-header credential. n8n stores the
secret encrypted. The integration stores only its verifier, credential ID and
the selected workspace, apps, workflow kind and folder. Native HTTP nodes call
the integration's private research listener, not arbitrary Manager routes. The
listener accepts only the operations allowed for that workflow kind, checks the
installed app capabilities, and forwards explicit action inputs through Manager.
It never passes a Manager or app-wide service token into a workflow.

The bridge uses its platform-issued bearer only with the dedicated Manager service
API. The package grants exact actions; Manager also checks source and target health,
workspace identity and the target's current declarations. The trusted integration
joins the Manager edge network; n8n itself remains on its own instance and egress
networks. This is not hostile tenant isolation or outbound destination filtering.

Disconnect research access to reject subsequent bridge requests. This does not
delete the workflow, stop an already accepted operation, or remove notes.
Reconnection, changing the selected apps/folder after installation, and recovery
of a lost credential-create receipt currently require administrator review.
Unconfirmed credential creation remains inert and is not retried automatically.

Successful and failed production executions do not retain node payloads by
default. An in-progress/manual execution can still show research content in n8n;
editing workflow retention settings changes this. Back up n8n state and the
integration runtime together to retain both encrypted credentials and grants.

## Candidate app actions

Do not advertise these actions in an existing immutable package or point an
updated declaration at an old controller image. Publish new tested controller
images and compatible app versions first. The integration capability checks keep
the two Obsidian templates unavailable until the installed packages declare them.

Zotero (`runtime` data, 120-second action timeout):

```yaml
- id: research-items
  data: runtime
  timeoutSeconds: 120
  fields:
    - { id: since, type: string, secret: false, required: true }
    - { id: until, type: string, secret: false, required: true }
```

Obsidian (`runtime` data, 30-second action timeout):

```yaml
- id: create-research-note
  data: runtime
  timeoutSeconds: 30
  fields:
    - { id: folder, type: string, secret: false, required: true }
    - { id: filename, type: string, secret: false, required: true }
    - { id: content, type: string, secret: true, required: true }
```

The content field is treated as sensitive by platform presentation. The Obsidian
controller creates complete files through an exclusive hard link, never an
overwrite. Linux directory descriptors prevent symlink replacement from
redirecting writes. A process crash can leave a hidden staging file; it must not
be interpreted as a completed note. Live sync propagation still needs acceptance.

## Verification

`SCHOLARSERVER_CHECK_RESEARCH=1` extends `test-container.sh` with a disposable
Manager/app-response fixture and real Linux note writes. Native n8n installs all
three workflows through its public API with credential references, then executes
their native HTTP, Code, branching, looping and Wait nodes. Only the test copy's
wait is accelerated. This verifies native workflow execution, **not** a real
Zotero library, Docling conversion, paid Obsidian Sync, or Manager/executor queues.

The normal source suite covers credential redaction, uncertain creation, revoked
access, invalid paths, instance/workspace checks, capability gates and bounded
Zotero reads. `research-note.test.mjs` runs on Linux for create-only, concurrent
creation and symlink checks. Browser acceptance covers app/folder choices,
failed-save draft retention, reload and mobile layout.
