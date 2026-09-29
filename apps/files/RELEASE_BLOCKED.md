# Current Manager development candidate — 29 September 2026

Package `0.1.1-manager.20260929.1` now selects receipt-verified native AMD64/ARM64 images
from source `f881ada53a14cf706b237484a4165c9635a9d377`, run
[36557464955](https://github.com/Jacob-Stokes/scholarserver-apps/actions/runs/36557464955).
All seven source packages use that same image build. Manifest, Compose and source
records agree. This closes the stale-image-source gate for this candidate.

This is ready for the paired development qualification/update workflow, not an
unrestricted official catalog publication. Final paired-core compatibility,
fresh-install and authenticated retained-host acceptance remain separate gates.
App-specific account, data and recovery limits are recorded in
[the current report](../../docs/manager-configuration-20260929.md).
Earlier entries below describe historical candidates and do not identify the
currently selected source version or installed package.

# Source candidate — not for publication

## Editorial candidate — 14 September 2026

Source package `0.1.0-beta.5.editorial.20260914.1` is not published or qualified for a live
catalog update. It preserves the prior image pins; they do not claim to contain
this pass's UI changes. See [editorial icons and release gates](../../docs/editorial-icons.md).
Before publication, qualify the new package with a core release that supports
`presentation.editorialIcon`, select its verified platform minimum, and complete
native/image-source and authenticated browser acceptance for changed UI images.
Never inject these assets into an installed or published old package version.
Existing app-specific release gates below, where present, remain in force.
