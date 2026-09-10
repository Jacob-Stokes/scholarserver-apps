# n8n release acceptance

This candidate is not ready for catalog publication. The beta.3 source manifest
still pins a beta.2 integration image that rejects the newly declared Manager
service input during password setup. Fresh-host acceptance on 10 September
reproduced that failure. Current source also needed a missing runtime module
added to the Dockerfile. A separate local AMD64 candidate passes password-only
setup, but neither its image nor its test package has been published. A new
immutable, native multi-architecture package remains required.

The following earlier evidence concerns beta.2, not the beta.3 source contract.
Native ARM64 and AMD64
container/browser/API checks pass. Public immutable multi-architecture images are
published and wired into the manifest. Manager installation on Freelove completed
successfully and the app-owned setup API is reachable through Manager.

The main remaining release blocker is automatic native-editor access lifecycle:

- Freelove uses host-managed Tailscale. The existing isolated-origin executor
  route only supports container-managed Tailscale and rejects this installation.
- That route strips Cookie and Set-Cookie. n8n 2.38.1's auth service requires its
  `n8n-auth` cookie, so removing the transport rejection would not make login work.
- Different ports on one hostname are separate web origins but not separate
  cookie hosts. Do not fix this by forwarding all cookies, proxying the native
  editor through Manager, or disabling n8n authentication. Establish a separate
  private hostname instead. The manually provisioned development hostname has
  passed owner setup, a fresh page load, sign-out and sign-in.

The installed `n8n` instance now has an owner and a scoped server-side API key.
Existing trial instances were not modified. No public editor route was created. Earlier
encrypted credential restore evidence is container-level, not a Manager restore.

After explicit user approval, a separate persistent Tailscale identity now serves
the editor at `https://scholarserver-n8n.tailc56b3d.ts.net/`. HTTPS and the initial
owner setup page were verified in a mobile-width browser. This is a manually
provisioned development connection, not a catalog-managed lifecycle feature.

Core `4eaee8a` fixes forwarding the app's explicit-request header through Manager
without forwarding cookies or authorization; full core checks and image build
pass. Deployed browser acceptance now covers owner setup, sign-in/out, scoped
connection, six-hour YAML template installation, enable/disable, a successful
manual execution visible in Manager, and persistence after both n8n containers
restart. The development API key expires on 9 October 2026; replace it before then.

Automatic access provisioning/removal and identity recovery, Manager-driven
credential backup restoration, post-install settings and workflow-credential
onboarding remain work. No official catalog package has been published.

Beta.2 replaces manual API-key setup with a password-only declared onboarding
action. Native ARM64/AMD64 setup and the real Manager/executor mobile workflow
pass on a disposable installation. This removes the native-editor dependency
from ordinary Manager setup; it does not resolve the optional editor's separate
hostname lifecycle. Existing working connections are preserved. Exact evidence
and image digests are in DEVELOPMENT_NOTES.md.
