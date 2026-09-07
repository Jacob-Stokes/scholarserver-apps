# Logseq 0.1.0-beta.1 — 7 September 2026

This beta makes the existing integration discoverable, not production-certified.
It does not migrate or enroll any existing notebook automatically.

## Artifacts and source delivery

- Final integration images were built from `e7d3fce` natively on AMD64 and ARM64.
- `package/` pins the multi-architecture helper, MCP, sync adapter and upstream
  browser images by digest. Both choices share the same graph and private API.
- Integration MIT notices and distribution notes are present in all three custom
  images. The helper retains Logseq, Electron and Chromium notices. Dependencies
  and upstream filesystem layers are not stripped of notices.
- The official client source is `26f6f7880b1ec894871a9ec2c03bb97b954b4cb0`.
  Exact community runtime and build revisions are in `DISTRIBUTION.md`.
- Catalog release `v0.2.27` includes five upstream source archives, their SHA-256
  index, and this repository's integration/build source. Existing catalog entries
  retain their original immutable archives; only Logseq is added.

## Verification and limits

Source tests and core package-schema validation pass. Native candidate tests cover
all fourteen research MCP tools, multiple sessions, input rejection, unauthorized
HTTP requests and graph persistence across restart, using disposable notebooks.
The same tests passed again after anonymously pulling the final immutable helper
and MCP image digests on both AMD64 and ARM64. Sync adapter anonymous pull also
passed on ARM64. All three custom images were built and notice-checked natively
on both architectures. Live installation checks are recorded below as they
complete. Previous encrypted account/browser sync evidence is in `VERIFICATION.md`;
it is not a new physical-device or final public OAuth test.

Physical-device acceptance and fresh public OAuth/MCP acceptance remain open.
No claim of legal clearance or managed-hosting endorsement is made.

## Live catalog installation

Catalog `v0.2.27` was published with all nine assets and its latest index was
downloaded anonymously. Freelove's refresh API imported Logseq; the browser
displayed its beta card and icon, offered both choices, and installed the browser
choice through the normal six-stage wizard. Helper, MCP, sync and editor all
became healthy, and the app-owned configuration screen loaded.

Freelove still uses legacy host-level Tailscale. Its managed isolated-origin API
returns 409 (connect Tailscale), so this host cannot finish Logseq's private
connection step without access migration. That infrastructure was deliberately
left unchanged. Logseq is installed, not account-connected. Existing app versions
and data were preserved. Native test containers, temporary credentials and test
checkouts were removed; no paid disposable server was created.
