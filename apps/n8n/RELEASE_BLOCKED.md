# n8n release acceptance

This candidate is not ready for catalog publication. Do not include it in a
release until immutable integration images, native architecture startup,
authenticated Manager routing, and credential backup/restore are verified.

The package currently describes the upstream service only. The app-owned
integration UI is under acceptance testing and must be wired into the manifest.

Native CI run 34343597454 failed before building on both architectures because
the upstream registry returned HTTP 429 for unauthenticated pulls. Do not retry
continuously or publish the upstream-only candidate as the completed app.
