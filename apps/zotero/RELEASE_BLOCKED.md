# Source candidate — not for publication

## Metadata research candidate — 15 September 2026

`0.5.10-guided.20260915.1` adds the missing read-only metadata action declaration
without changing any image or runtime source. The isolated native pinned-controller
synthetic mailbox harness in `qualification/README.md` passed all seven cases on
15 September, including restart and invalid/bounded input. Fourteen reads and
zero unexpected or mutating requests were observed; controller and metadata-reader
bytes matched source. Private receipt:
`/tmp/zotero-pinned-controller-qualification-20260915.json`.

The development candidate is deployed on Freelove's personal Zotero at revision
23. The earlier shared-storage rejection is retained as a failed-plan checkpoint.
Core `98afb33` adds a guarded metadata commit without runtime or data mutation;
Apply `f20960b7-c747-4bec-8416-affaeacac686` succeeded without warnings. Existing
images and the linked-folder binding are unchanged. All five native report forms
now list personal Zotero. Their live folder test is blocked by Obsidian vault
setup, not this package. No real-library report execution is claimed. Earlier
historical release gates are not silently closed by this metadata change.

## Editorial candidate — 14 September 2026

Source package `0.5.10-guided.20260913.2.editorial.20260914.1` is not published or qualified for a live
catalog update. It preserves the prior image pins; they do not claim to contain
this pass's UI changes. See [editorial icons and release gates](../../docs/editorial-icons.md).
Before publication, qualify the new package with a core release that supports
`presentation.editorialIcon`, select its verified platform minimum, and complete
native/image-source and authenticated browser acceptance for changed UI images.
Never inject these assets into an installed or published old package version.
Existing app-specific release gates below, where present, remain in force.
