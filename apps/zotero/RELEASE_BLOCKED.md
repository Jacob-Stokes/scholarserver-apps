# Source candidate — not for publication

## Metadata research candidate — 15 September 2026

`0.5.10-guided.20260915.1` adds the missing read-only metadata action declaration
without changing any image or runtime source. It is not deployed or qualified
by that declaration. Run the isolated native pinned-controller synthetic mailbox
harness in `qualification/README.md` before deployment; failures or source/image
byte mismatches block the metadata-only update. Real-library/Manager/browser
acceptance remains distinct. Earlier historical release gates below are not
silently closed by this metadata change.

## Editorial candidate — 14 September 2026

Source package `0.5.10-guided.20260913.2.editorial.20260914.1` is not published or qualified for a live
catalog update. It preserves the prior image pins; they do not claim to contain
this pass's UI changes. See [editorial icons and release gates](../../docs/editorial-icons.md).
Before publication, qualify the new package with a core release that supports
`presentation.editorialIcon`, select its verified platform minimum, and complete
native/image-source and authenticated browser acceptance for changed UI images.
Never inject these assets into an installed or published old package version.
Existing app-specific release gates below, where present, remain in force.
