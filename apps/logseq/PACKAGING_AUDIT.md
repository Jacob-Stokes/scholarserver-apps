# Logseq candidate packaging audit

Engineering checkpoint, 6 September 2026. Not legal clearance or permission to
publish. Successful runtime tests do not complete distribution requirements.

## Known ownership

- Helper: ScholarServer integration and the unmodified official Logseq 2.0.1
  desktop archive, run without a GUI. Archive checksums are pinned separately
  for AMD64 and ARM64. This is a custom application image, not only an MCP.
- MCP: ScholarServer research-tool adapter and locked dependencies; it calls the
  private helper. No separate Logseq binary is installed here.
- Sync: pinned community image, with our public-configuration launcher added.
  Its image label identifies packaging revision
  `3c894de08098169466ddba57fc8e7befc236ed39`; this does not by itself identify every
  upstream Logseq input used inside the community build.
- Editor: directly referenced, pinned community browser image; optional.

## Confirmed source references

- [Official Logseq 2.0.1 licence](https://github.com/logseq/logseq/blob/2.0.1/LICENSE.md): AGPL v3 text.
- [Community packaging licence at the sync image's revision](https://github.com/yshalsager/logseq-selfhost/blob/3c894de08098169466ddba57fc8e7befc236ed39/LICENSE): AGPL v3 text.
- The native helper image retained `/opt/logseq/LICENSE.electron.txt` and
  `/opt/logseq/LICENSES.chromium.html` from the archive. This was a top-level file
  check, not a complete licence inventory inside the application archive.
- `development/upstream-lock.json` records tested image pins. Build success and
  these source links do not establish a complete corresponding-source delivery.

## Before publication

1. Inventory the final images, including packaged application archives and npm
   dependencies. Preserve all applicable licences, copyright and notice files.
2. Resolve the exact source/build inputs behind each community image, separately
   from its packaging repository revision. Record the matching build instructions.
3. Provide and verify recipient-accessible corresponding source alongside the
   distributed artifacts, including applicable integration/build sources. A private
   repository or an untested upstream URL is not a completed delivery mechanism.
4. Decide and document the licence for ScholarServer-owned code consistently with
   the distribution arrangement; do not infer it from the upstream image's licence.
5. Repeat native checks against the final immutable artifacts and publish the
   source/notice inventory with their exact digests. Keep the candidate unpublished
   until these checks and `RELEASE_BLOCKED.md` are satisfied.

No upstream maintainers were contacted. No licence grant or approval was inferred
from the successful tests, and no public images were published in this pass.
