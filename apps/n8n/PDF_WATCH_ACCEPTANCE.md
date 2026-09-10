# Automatic PDF conversion acceptance — 10 September 2026

## Real new-file test

An isolated native ARM64 installation used core `b42d29a`, the n8n candidate,
installed Zotero and Docling package images, and a copy of the connected Zotero
library. Manager installed the apps and provisioned n8n's service identity through
the real executor. Both apps used the same test storage location through the real
storage-binding API. The storage backend was a local rclone fixture, not Google
Drive or WebDAV. The copied Zotero desktop was offline; the original library was
not modified by this PDF test.

The test enabled the native minute schedule before adding a PDF. It did not use
the manual trigger or call conversion/attachment actions as substitutes for n8n.

- Watcher enabled at **15:23:14 UTC**, with an empty selected folder.
- PDF attached to the labelled test paper at **15:23:28 UTC** through Zotero's
  authenticated local API. Source attachment: `Y285S9W2`.
- Scheduled workflow queued Docling job `ca330b5394db4ec83237ec38902e0f82` at
  **15:24:13 UTC**. Conversion ran from **15:24:14 to 15:24:32 UTC**.
- At **15:25:18 UTC**, Zotero exposed one Markdown attachment, `ACMX26J5`, on the
  correct parent. Its actual file contained `## Dummy PDF file`.

The input was the public [W3C dummy PDF](https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf),
13,264 bytes, SHA-256
`3df79d34abbca99308e79cb94461c1893582604d68329a41fd4bec1885e6adb4`.
The imported Markdown SHA-256 was
`0cff37b3c9ab819483d4d449c7a481066bf00e17a6d292dbcaf474065fa4805b`.
This proves text-PDF conversion with OCR off, not scanned-document OCR or complex
paper/table fidelity.

## Overlap correction

A scan overlapping a waiting conversion exposed Manager's app-busy rejection.
No platform scheduler or integration-side queue was added. The reviewed PDF YAML
now uses native HTTP-node retries: three attempts, three seconds apart. Read
operations are repeatable; conversion and attachment operations reuse app-owned
identities. Completed conversions check their cached status immediately rather
than waiting a minute again.

Final retry candidate image:
`scholar-pdf-n8n@sha256:1e6d5cc349c67d687e484e637e25dd95a05630ab2081368bfeea5aa83c48026f`.
Two independent native scheduled copies passed repeated scans. For test evidence
only, these copies retained execution data; the shipped template still discards
completed node payloads. The earlier new-file run used the normal retention policy.
Native executions `8`–`11` passed ordinary repeated minute scans. To force a
collision, the two test copies then used identical native cron schedules at the
minute boundary; their execution steps were unchanged. Executions `12` and `13`
started at **15:38:00.126** and **15:38:00.159 UTC**. Manager returned two busy
409 responses. n8n retried and both executions finished with `success`, at
**15:38:09.289** and **15:38:07.588 UTC** respectively. No integration-side retry
or queue was involved.

At **15:39:08 UTC**, final verification still found one conversion job with one
attempt, and one Zotero Markdown attachment with the unchanged content hash.
Both test schedules were disabled before cleanup.

## Cleanup

All eight isolated containers, six networks and four candidate image tags were
removed. Manager removed the test storage resource; its mount and linked systemd
unit were gone before deletion of the exact temporary state directory. That
directory included the copied library, credentials and test execution payloads.
The test executor was inactive. Absence was verified, and the existing Manager,
n8n, Docling and Zotero containers remained healthy. The original Zotero desktop
was not paused. No paid server was created. The test PDF and its Markdown existed
only in the isolated copy and were removed with it.

## Source and UI checks

Full apps `npm test`, n8n UI build and mocked Chrome catalog checks passed.
The browser test covers minute defaults, invalid intervals, the submitted minute
setting, saved cadence, existing hourly settings and mobile layout. It is not a
browser test of the live installation. Existing installed workflows are not
silently rewritten. Final package publication and production deployment remain
separate work.
