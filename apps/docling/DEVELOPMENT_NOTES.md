# Docling development notes

## Setup read ownership — 7 September 2026

The conversion-defaults form previously allowed saving its initial false value
before the server settings had arrived. The same delayed read could replace a
user's OCR choice for a new job. The browser regression failed on the original
build because Save defaults was enabled while that response was held.

The form now requires successfully loaded defaults before editing or saving them.
Settings reads have a timeout, explicit retry and cancellation on unmount; late
defaults do not replace a job choice the user has edited. Failed reads no longer
silently display a saveable default. This does not retry writes automatically.

Status reads now have one current owner: an action's refresh supersedes an older
poll, routine polls do not overlap, and unmount cancels in-flight status reads.
An empty/unreadable successful HTTP body is treated as an error, not success.

Verification uses the apps test suite and synthetic browser responses for delayed
defaults, failed-read retry, draft preservation and an older poll completing after
queue pause. These are UI/source checks, not a new container conversion or published
package. File discovery and remaining operation lifetimes still need review.
