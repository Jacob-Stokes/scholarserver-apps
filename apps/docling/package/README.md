# ScholarServer Docling

This package turns PDFs in an attached ScholarServer document store into durable
Markdown derivatives. It follows the Resolution deployment's use of the official
CPU-only Docling Serve image, but adds a ScholarServer-owned SQLite queue and a
bounded controller.

The pinned Docling Serve image already contains its conversion models.
ScholarServer deliberately does not mount an empty cache over those bundled
files; only job state and the selected documents storage are persisted.

The controller accepts only relative PDF paths below `/documents`, hashes every
source, and runs one conversion at a time. A successful conversion writes:

```text
/documents/.scholarserver/docling/<source-sha256>/document.md
/documents/.scholarserver/docling/<source-sha256>/manifest.json
```

Jobs survive restarts and are idempotent by source hash plus conversion profile.
Failed jobs retry three times. Scans are explicit and bounded; installing this
package never starts converting an existing library by itself.

The CPU service is limited to one CPU, 4 GiB RAM and 256 processes. Formula/code
enrichment and page-image generation are disabled in the initial profile so small
servers remain responsive.
