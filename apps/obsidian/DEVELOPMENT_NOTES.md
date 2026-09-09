# Obsidian development notes

## Create-only research notes — 9 September 2026

The controller has a candidate `create-research-note` action for the n8n research
templates. It requires a connected vault, limits filenames to stable Zotero keys
or dated digests, rejects hidden/parent paths, and writes at most 256 KiB. Linux
directory descriptors and an exclusive hard-link publication prevent symlink
redirection and overwriting existing notes, including concurrent creates.

Native Linux tests pass for duplicate/concurrent writes and symlink rejection.
Native n8n fixture execution created real notes through the same writer. This is
not official Sync/LiveSync propagation or a published controller image. The
currently pinned package deliberately does not advertise the action; add its
declaration only with a new compatible image/version. Exact declaration and gates
are in `apps/n8n/RESEARCH_WORKFLOWS.md`. Do not upgrade the live official-sync
installation to unrelated development setup changes without compatibility checks.

A crash can leave a hidden staging file; future cleanup should identify only
owned stale staging files and never treat them as complete notes. Failed folder
sync and queue interruption need additional live acceptance.

## Setup status ownership — 8 September 2026

A delayed pre-install status poll could replace the status returned after client
installation and reset an edited folder scope to `/`. The synthetic browser
regression reproduced that failure against the old build.

Only the current status request may update the screen. Explicit refresh supersedes
an older request, routine polls do not overlap, and unmount cancels pending reads.
Reads time out after 15 seconds. Edited folder scope remains a user-owned draft,
separate from polled server state. Installation now uses the operation wrapper's
single refresh rather than refreshing twice.

An unreadable successful HTTP response is an error rather than a successful null
result. These changes do not alter sync processes, stored credentials or vault
contents, and do not automatically retry writes.

Verification: source tests, production UI build and the four-app mock-browser suite
passed, including a held old poll released after installation and scope editing.
This is not device-to-server sync acceptance or a published package. Remaining
mutation lifetimes and the wider setup component still need separate review.
