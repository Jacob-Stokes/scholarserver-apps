# Source candidate — not for publication

## Shared sign-in — 18 September 2026

`0.1.0-beta.8.signin.20260918.1` requires compatible Manager/executor browser
identity support. Reader and integration images passed dual-native qualification
in GitHub run 35383347325 from source 753228f69b9aa61daf78b487ca52297be5c7c65e.
Fresh shared-sign-in setup, existing-account migration, unavailable-reader resume,
restart, restore, all six MCP tools and untrusted-peer rejection passed on both
architectures. Authenticated Manager-to-reader navigation, restart and shared
logout/re-login passed on the retained Freelove development installation with
core ba923821048e7d3e259ff0fd03c63d44483c8887. Its pre-existing Gateway integration
warning still needs review. The generic platform range is not yet a release
compatibility guarantee. This candidate remains for the explicitly paired
development deployment only, not unrestricted catalog publication.

## Published image refresh — 18 September 2026

Source candidate `0.1.0-beta.7.editorial.20260918.1` selects changed recipe images
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

Source package `0.1.0-beta.7.editorial.20260914.1` is not published or qualified for a live
catalog update. It preserves the prior image pins; they do not claim to contain
this pass's UI changes. See [editorial icons and release gates](../../docs/editorial-icons.md).
Before publication, qualify the new package with a core release that supports
`presentation.editorialIcon`, select its verified platform minimum, and complete
native/image-source and authenticated browser acceptance for changed UI images.
Never inject these assets into an installed or published old package version.
Existing app-specific release gates below, where present, remain in force.
