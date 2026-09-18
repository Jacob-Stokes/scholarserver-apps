# Published native images and source consolidation — 18 September 2026

[GitHub run 35332927221](https://github.com/Jacob-Stokes/scholarserver-apps/actions/runs/35332927221)
completed both native builds, their qualification gates and all multi-platform
manifest jobs for source `3b90bb773159202103b989cd43d9642eb226a1b6`.
The manual workflow uses standard public-repository runners; no hosted private
minutes, paid runner, emulation or retained-host build was requested.

Both original build/qualification receipts and the development-gate artifacts
were downloaded to `.dev/github-images-20260918`. Receipt checksums were checked
against their qualification records. For each of the seven changed recipes,
anonymous registry reads checked the immutable index, both platform descriptors,
config digests, architectures, RootFS layer identities, source revision labels and
recipe fingerprints against those receipts. Registry manifests and config blobs
were also hashed independently. No Docker image was pulled or run on the Mac.

Only the seven stale recipe references were refreshed: Docling controller,
FreshRSS integration/reader, Logseq helper, n8n integration, Obsidian sync and
Zotero controller. Unchanged recipe references retain their existing qualification.
The six affected packages receive new `20260918.1` candidate identities; no
published or installed old version is rewritten. n8n and Obsidian retain their
ARM64-only package declarations because their unchanged companion pins remain
architecture-specific. No permissions, storage contracts or variants change.

The complete source lock must pass before consolidation into `main`. Core must
then pin the final apps commit and pass its paired source checks and production
build. The prior core CI failure was stale image-source metadata, not successful
qualification of these new references.

This records published images and candidate source metadata, not an official
catalog release, signed installer or Freelove deployment. Every existing
`RELEASE_BLOCKED.md` remains in force. Targeted package installation, explicit
connection review and authenticated live-vault acceptance remain separate gates.
Project-vault documentation updates are pending; no vault access was used here.

## Retained Freelove updates — 18 September 2026

The source was consolidated into `main` at `580bcbd`; core pinned that commit.
The following development-package updates then used the published native ARM64
images, exact reviewed Manager plans and verified encrypted per-instance backups:

| Instance | New package | Revision | Acceptance |
| --- | --- | --- | --- |
| n8n | `0.1.0-guided.20260918.1` | 7 | Operator runtime verification passed; live native form and PDF folder-picker checks passed. |
| Logseq | `0.1.0-beta.4.editorial.20260918.1` | 3 | Operator runtime verification passed; no new graph-sync acceptance. |
| Obsidian | `0.5.0-guided.20260918.1` | 18 | Operator runtime verification passed; existing personal vault was not reconfigured. |
| Obsidian development instance | `0.5.0-guided.20260918.1` | 3 | Running reviewed images and healthy. Automatic acceptance stopped on its recreated private-access proxy; existing AI integration warning remains. Browser Configuration still reports Connected. |
| Zotero sync-test | `0.5.10-guided.20260918.1` | 3 | Running reviewed images and healthy. Automatic acceptance stopped on the existing AI integration warning. |

Docling and personal Zotero were not updated: their writable shared-storage
bindings need a separately supported recovery path for image-changing updates.
Do not detach those folders or describe an image change as metadata-only to bypass
the guard. FreshRSS was not installed. All package release blocks remain in force.

The operator backup check was corrected in core `185aa3e` to examine installed
data bindings, not inactive variant declarations. Four regressions and the full
core/operator checks passed. This allowed LiveSync Obsidian updates without
weakening recovery for an actually bound excluded dataset.

Live browser checks selected `Papers` in the PDF folder picker and reached an
enabled Add automation button, then cancelled the draft. No workflow was created,
schedule changed, connection permissions saved or research note written.
Development-vault folder access remains unapproved; selecting it correctly blocks
folder browsing. Legacy permission migration and new-mode live research execution
remain acceptance gates, not completed work.

Core `docs/deployments.md` and `docs/testing/connections-deployment-20260918.md`
own the exact running identities, checkpoints and remaining operator blockers.
Project-vault note/index updates remain pending; no personal vault connector was
used for contributor documentation.
