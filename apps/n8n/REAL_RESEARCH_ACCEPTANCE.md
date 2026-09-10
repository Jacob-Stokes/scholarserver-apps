# Real research workflow acceptance — 10 September 2026

**Passed:** Zotero reading notes executed against a copy of the connected library,
through native n8n, the real Manager service API, executor queues and app actions.
The resulting note also reached the original vault through official Obsidian Sync.
This is candidate integration evidence, not a production upgrade or final package
release acceptance.

## Candidate and isolation

Core source was `b42d29a`; apps source was `a0e89ed`. A separate `researche2e`
installation ran natively on Freelove's ARM64 host. Manager, executor and the n8n
integration used current source. Zotero and Obsidian used compatibility overlays
of their installed controllers, adding the current `research-items.mjs` and
`research-note.mjs` actions. Their complete latest setup/package entry points were
not tested. Candidate package versions were separate prereleases; published pins
and the existing installation were not upgraded.

Zotero's desktop was briefly paused for a consistent library copy, then unpaused.
The copied desktop was offline. The isolated Obsidian client used a copied vault
and its existing Sync configuration. Only the labelled acceptance note was written.
No paid server was created.

## Observed results

Manager installed the three candidate apps through the executor. Password-only
n8n setup provisioned its real service identity. The authenticated Manager app
proxy installed the `zotero-reading-notes` template with a scoped credential.
The schedule stayed disabled; native n8n CLI execution ran the actual saved graph.

| Check | Result |
| --- | --- |
| Read the labelled dummy paper and create its note | Passed; native execution completed successfully and the note contained the expected title. |
| Repeat without changes | Passed; no duplicate note. |
| Edit the note through the authenticated Obsidian API, then repeat | Passed; exactly one note, with the edit and its content hash preserved. |
| Official Obsidian Sync | Passed; the original vault contained the same note and preserved edit, with the same content hash. |
| Encrypted Manager backup and restore of n8n | Passed; verified application backup, real restore, healthy restart and successful execution using the restored credential. |
| Revoke research access and execute again | Passed; execution failed with Forbidden and the note remained unchanged. |

Workflow ID: `zQxqqdoswCOSjdAc`. Verified backup ID:
`78a4273d05ee0a239bea7e3e`. The dummy paper and note were retained for review;
research access was revoked before removing the candidate runtime.

## Limits and cleanup

This did not test the daily digest, PDF conversion, fresh-host guided installation,
final published app packages, or the complete latest Zotero/Obsidian setup flows.
The attempted browser check could not reach the isolated Manager's internal-network
port; there is no successful browser screenshot from this run. Earlier mocked
browser checks remain separate evidence. Sync was verified on the original server
client, not visually on a phone or Mac.

All candidate containers, networks and tagged images were removed. The exact
temporary source/state directory, including copied credentials and backup data,
was deleted and absence verified. The executor test service was inactive and the
SSH tunnel was closed. Existing Manager, n8n, Zotero and Obsidian containers were
healthy afterward; the original Zotero desktop was not paused.

The full apps `npm test` suite also completed with exit status 0 after this run.
