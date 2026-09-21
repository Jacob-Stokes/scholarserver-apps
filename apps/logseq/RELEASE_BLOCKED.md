# Source candidate — not for publication

## Loading development candidate — 21 September 2026

Candidate `0.1.0-beta.4.editorial.20260921.1` selects the native images qualified
and published by GitHub run 35591930384. This permits the separately reviewed
retained-development update described in
[the publication record](../../docs/loading-publication-20260921.md); it does
not establish an official signed catalog release or fresh-install acceptance.
The remaining release gates below continue to apply.

## Published image refresh — 18 September 2026

Source candidate `0.1.0-beta.4.editorial.20260918.1` selects changed recipe images
from GitHub run 35332927221,
source 3b90bb773159202103b989cd43d9642eb226a1b6. Both native architectures passed
the workflow gates and were published. Registry indexes, platform configs and
source fingerprints were checked against the downloaded receipts. Only changed
recipe pins and a new package identity change; other image pins, permissions,
storage, variants and declared package architectures are unchanged.

This is image publication and source consolidation, not an official catalog
release or deployment. Existing release gates remain. See
[the refresh record](../../docs/native-candidates-20260918.md). Project-vault
documentation is pending; this pass does not access research data.

## Editorial candidate — 14 September 2026

Source package `0.1.0-beta.4.editorial.20260914.1` is not published or qualified for a live
catalog update. It preserves the prior image pins; they do not claim to contain
this pass's UI changes. See [editorial icons and release gates](../../docs/editorial-icons.md).
Before publication, qualify the new package with a core release that supports
`presentation.editorialIcon`, select its verified platform minimum, and complete
native/image-source and authenticated browser acceptance for changed UI images.
Never inject these assets into an installed or published old package version.
Existing app-specific release gates below, where present, remain in force.
