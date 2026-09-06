# Files integration notes

- User-requested built-in status is manifest-owned (`lifecycle.required`); core
  only implements that generic policy. No Files identifier in platform code.
- No Roots capability is advertised by the bridge. Client Roots would replace
  upstream's allowlist, which is inappropriate for server-selected storage.
- Shared folders never contain the service credential. No raw host mounts or
  host administrative APIs. The process is non-root with read-only rootfs.
- The upstream worker is persistent, not spawned per tool call. All clients use
  the same fixed grant, not client-controlled roots; operations queue serially.
- Retries after an unknown write outcome are manual. Cross-volume moves must
  either succeed intact or fail without losing either file; prove this in Docker.
- The generic storage contract currently provides fixed mount slots. The initial
  app offers two roots rather than inventing a private dynamic-mount mechanism.
- The exact npm release lacks LICENSE despite naming it in package metadata;
  retain the source-revision licence explicitly in the image and source.

Evidence: server.test.mjs runs the real pinned upstream worker through HTTP with
synthetic files. Native container and complete installation evidence is recorded
separately; source tests alone do not imply package publication.

7 September 2026: actual npm worker tests passed locally and in native AMD64
(Resolution) and ARM64 (Freelove) images. `test-container.sh` passed on both:
non-root, network disabled, read-only rootfs, read-only shared folder, blocked
credential access, writable synthetic note, failed-move source preservation.
The multi-platform image is published at digest
`fea262ef1cc4d8951e12ceee3ebaba915d03ddd6d0f9ee38d9c89d9bd7de43b6`.
Anonymous download on the disposable DigitalOcean host passed. Complete Manager
startup and authenticated Gateway verification are still separate pending gates.
