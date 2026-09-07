# Static package sketches, not installation inputs

These files live outside the release discovery glob. All images use the release
builder's recognised all-zero rejection digest. Only the MCP image has a source
recipe; the other image names are design placeholders, not publication requests.
No controller HTTP server or credential onboarding adapter is implemented yet.

The current repository contract requires every setup choice to retain a declared
Gateway service. To avoid inventing per-app routing or claiming sync-only has AI,
there are two package sketches: sync-only with no MCP, and desktop with AnkiWeb or
self-hosted setup options. Decide package presentation before release; no core
changes have been made. The setup preview explains all three user choices.

Proposed non-shell health probes declare transport liveness only. The sync probe
is TCP liveness, not authenticated protocol readiness; the desktop probe checks
KasmVNC, not the collection. The controller must separately classify account and
AnkiConnect readiness. Final binaries/interpreters, permissions, resource budgets,
read-only mounts and native architecture support need actual artifact testing.
The proposed hardening is a requirement, not evidence an upstream image meets it.

Sync uses the application's own authentication. It uses the existing
`none-private` platform classification, with native sync credentials still
mandatory inside Anki. No new auth enum is invented. Both sketches pass schema
and Compose policy at core revision `0b52f901dc9f5223b5209e22a906568495ddcbe5`;
unresolved images still prevent installation. Private endpoint routing uses the
current core origin policy, which does not allow an extra browser sign-in gate.
Reuse a future generic supported mechanism rather than app-owned routing. Public
sync needs protocol, TLS and request-size acceptance; it cannot use a browser
redirect login gate.

Before implementation, declare the self-hosted account action using the existing
onboarding request contract and bounded secret fields. Consume request files only
once; persist state before side effects; preserve existing credentials and data.
Do not add password fields to Compose, a browser preference, or a command argument.
The planned sync adapter reads a private credential file inside its process before
loading upstream Python `anki.syncserver`. Verify this version's configuration
interface; do not substitute a new third-party sync protocol implementation.
