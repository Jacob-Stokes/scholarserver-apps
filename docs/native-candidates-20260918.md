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
