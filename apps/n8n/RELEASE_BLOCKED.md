# n8n release acceptance

This candidate is not ready for catalog publication. Native ARM64 and AMD64
container/browser/API checks pass. Public immutable multi-architecture images are
published and wired into the manifest. Manager installation on Freelove completed
successfully and the app-owned setup API is reachable through Manager.

The remaining release blocker is the native editor's access boundary:

- Freelove uses host-managed Tailscale. The existing isolated-origin executor
  route only supports container-managed Tailscale and rejects this installation.
- That route strips Cookie and Set-Cookie. n8n 2.38.1's auth service requires its
  `n8n-auth` cookie, so removing the transport rejection would not make login work.
- Different ports on one hostname are separate web origins but not separate
  cookie hosts. Do not fix this by forwarding all cookies, proxying the native
  editor through Manager, or disabling n8n authentication. Establish a separate
  private hostname and verify sign-in, reload, logout and cookie separation first.

The newly installed `n8n` instance has no owner or saved API key yet. Existing
trial instances were not modified. No public editor route was created. Earlier
encrypted credential restore evidence is container-level, not a Manager restore.

After explicit user approval, a separate persistent Tailscale identity now serves
the editor at `https://scholarserver-n8n.tailc56b3d.ts.net/`. HTTPS and the initial
owner setup page were verified in a mobile-width browser. This is a manually
provisioned development connection, not a catalog-managed lifecycle feature.
No owner account was submitted by the test. Sign-in, logout, saved API connection
and automatic access provisioning/removal remain release acceptance work.
