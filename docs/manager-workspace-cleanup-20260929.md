# Manager workspace cleanup — 29 September 2026

Configuration forms now have one presentation owner in Manager. This follow-up
removes the obsolete app-owned forms behind the redirects delivered in the
[previous batch](manager-configuration-20260929.md). It is a source checkpoint,
not a new package release or deployment. Existing version declarations, image
digests, source-lock records and installed package bytes are unchanged.

## Retained entry points

| App | App-owned browser surface | Configuration destination |
| --- | --- | --- |
| Obsidian | Compatibility handoff only | Exact installed instance in Manager |
| Logseq | Compatibility handoff; upstream editor remains its own endpoint | Exact installed instance in Manager |
| FreshRSS | Compatibility handoff; reader and its theme remain separate | Exact installed instance in Manager |
| Zotero | Attachment lookup and shared-file matching | Library setup and PDF processing in Manager |
| Docling | Queue and Process PDF | Defaults, queue control and service details in Manager |
| n8n | Explicit embedded automation setup and connection recovery | Manager Configuration and Automations |

Unknown installed UI bookmarks also return to Manager. API paths remain outside
the redirect contract. The explicit n8n embed needs both its route and query flag;
that flag cannot reopen another obsolete page. Unprefixed development previews
of the handoff-only apps show a link to Applications and issue no setup reads.

Obsolete setup readers, panels, catalog controls and tests of those removed
implementations were deleted after checking their consumers. Controller APIs,
native app services, device setup and stored configuration were not removed.
Zotero's attachment read scope now keeps only the status needed by that workspace.
Docling retains its saved-default read separately from per-job OCR edits; absent
defaults cannot silently queue a job with an unconfirmed default.

## Verification

- Full `npm test` passed: 547 Node test invocations across the reported suites,
  plus the packaging and Python checks included by the command. This count
  includes suites invoked more than once by the repository scripts.
- `npm run lint`, every app's typecheck and the full `npm run build` passed.
- Focused tests cover all six redirect helpers, second-instance identity,
  operational route exceptions, n8n explicit embedding, access revocation,
  late-response rejection and retained read state after transient failure.
- Codex's in-app browser followed all six built Configuration entry points to
  the expected Manager destination. These destinations were local navigation
  placeholders; this does not constitute a new live Manager acceptance run.
- Synthetic workspace checks exercised Docling submission with edited OCR,
  unavailable defaults with blocked queueing and explicit per-job override;
  Zotero attachment results, a failed lookup retaining its key, denied access
  hiding its form/results, and the online-library variant; and n8n embedded
  installation, reload, failed-write draft retention, missing-permission guidance
  and recovery-required presentation. No real account, document or workflow was used.
- All three retained workspace layouts were inspected at a measured 390 CSS-pixel
  width with no horizontal overflow. Desktop/default viewport was restored.
  The localhost browser zoom needed a 312-device-pixel viewport to reach 390 CSS
  pixels; the first 487-pixel observation was not counted as a phone-width check.

The reusable preview is `node scripts/app-workspace-preview.mjs`. The refreshed
`scripts/check-app-screens.mjs` covers redirects and retained workspace scenarios
at four widths for future automated runs. This pass used the in-app browser;
that headless script and the revised native Docker browser gates were not run.
Local source logs are under `.dev/manager-form-removal-20260929/`.

## Qualification still required

The native Docling gate now uses the configuration action and persisted receipt,
then checks the document workspace. Logseq checks its compatibility handoff;
Zotero checks attachments; n8n browser gates exercise embedded setup and distinguish
API enable/disable checks from Manager lifecycle UI acceptance. These scripts
need to pass against new native images before any replacement package is installed.

Keep the previous qualified package set intact until the next complete batch is
ready. Update packaged README files, including Zotero's older tab descriptions,
when assigning the next immutable versions; their current archive bytes remain
part of the previous qualified batch. Original Obsidian first-device sync, Zotero worker service authentication,
remaining real-account transitions and signed fresh-install acceptance stay open
in the paired core checklist. The source audit also found that Manager filters
diagnostic templates out of its normal catalog: existing diagnostic workflows
and explicit embedded installation still work, but a new advanced diagnostic
entry point in Manager is not yet exposed. The old installed Configuration route
already redirected away from its former diagnostic panel. Track this as a
remaining migration gap rather than treating the normal catalog as complete
operation parity. The project-vault append remains pending the
existing request for approval to transmit project details.

## Qualified package batch

Native AMD64 and ARM64 build, controller/restart/LiveSync gates and the
Docling/Logseq/Zotero development gates passed for source
`439a9bc182e9ac31bf9100d130dc4ad7b13e1490` in
[run 36583182239](https://github.com/Jacob-Stokes/scholarserver-apps/actions/runs/36583182239).
All 19 published multi-architecture image indexes were checked against both
build receipts: child manifest/config hashes, actual architecture, root filesystem
layer identities, source revision and source fingerprint labels. Qualification
and development summaries match their build-receipt hashes.

The seven package manifests now reserve new `manager.20260929.2` versions and pin
those immutable indexes in both their image declarations and Compose templates.
The source lock validates against the current metadata-only source tree. Single
primary-purpose tags are included. These are package source candidates, not an
installed batch or evidence of paid Obsidian Sync completing.

Deployment still needs recovery of an existing uncertain configuration request:
core cutover rejects unresolved receipts, and Manager currently scopes receipt
reads to the installed package version. Preserve history and establish supported
upgrade/reconciliation before installing the recovery package. Do not delete the
receipt, replay setup, or silently relax the cutover guard. The downloaded official
client also requires a reviewed preservation path under the update tooling.
