# Packaging candidate — not ready for catalog publication

The candidate now references the verified native AMD64/ARM64 images from
`c781a54`, not the previous bundled-client images. Before removing this gate,
verify authenticated migration, official account sync, actual desktop/plugin
LiveSync setup and live application backup/restore. The target platform must
support `data.backup: excluded`; select a compatible released platform minimum
before publication rather than relying on the current broad `>=0.1.0` range.
Older published versions are immutable and still refer to their old images.
