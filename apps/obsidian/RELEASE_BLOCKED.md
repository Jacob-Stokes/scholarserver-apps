# Packaging candidate — not ready for catalog publication

Do not publish this candidate with the previous image digests. Build and inspect
the new native AMD64/ARM64 controller images, update Compose and manifest digests,
and verify migration, official account sync and two-device LiveSync before
removing this gate. The target platform must support `data.backup: excluded`.
Older published versions are immutable and still refer to their old images.
