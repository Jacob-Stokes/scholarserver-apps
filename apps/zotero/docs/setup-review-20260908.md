# Setup read ownership — 8 September 2026

Status reads now have one AbortController owner. Routine polling skips an
outstanding read; an explicit/action refresh cancels the previous read, and
cancelled results or errors cannot overwrite current state. Unmount cancels the
read. Account completion invalidates old status reads before displaying its
result. Account polling retains and clears the latest retry timer and checks
cleanup before issuing another completion request. Mutating requests are not
replayed or treated as cancelled server operations.

The existing desktop-access effect already guards late results after cleanup.
Its loading state prevents choosing/saving an address before discovery finishes.
Storage draft initialization remains separate from ongoing health observation.

Verification: full npm test, four-app production builds and synthetic browser
suite passed. Added held-status-response regression verifies a newer refresh
remains visible after the older response is released. Existing browser tests
cover both Zotero modes, failed saves, password clearing, draft preservation and
desktop-access progression. The new regression was not run against the old build.

Limits: no real Zotero sign-in, desktop authorization, package publication or
deployment. Account timer cleanup was reviewed, not independently exercised in
a new browser regression. General mutation completion after unmount, cross-tab
writes and uncertain-response reconciliation remain separate work. This is a
bounded setup ownership pass, not a complete audit of the controller or library.
