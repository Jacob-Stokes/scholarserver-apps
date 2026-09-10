# n8n release acceptance

The newer outcome-led catalog source described in
[AUTOMATION_CATALOG.md](AUTOMATION_CATALOG.md) is not in beta.4's published image.
It has source, mocked browser, native AMD64 and native-browser candidate evidence.
It still needs a new immutable package, final native-architecture acceptance and
real-app service/credential recovery checks. Do not present a source push as an
update to an installed beta.4 application.

Beta.4 is not ready for official catalog publication. It replaces the incompatible
beta.3 image pin with a new public, immutable AMD64/ARM64 integration candidate
built from source `94b1da2`. Both native builds passed declared setup and controller
restart checks, followed by the same checks against the published package digest.
The missing runtime module and reserved Manager-input mismatch
are fixed; they are no longer the reason for this release block.

Fresh installation through the final signed platform, real application-service
grant enforcement, private editor access lifecycle and Manager-driven recovery
of workflow credentials still require acceptance. Image publication does not
publish a catalog package or update Freelove's installed instance.

Before removing this block, run `node apps/n8n/check-package.mjs` on an isolated
Docker daemon for each supported native architecture against the final package
directory (an optional first argument). It selects
the exact manifest digests, checks Compose agreement and exercises the declared
password plus Manager-service input. Passing `test-container.sh` against separate
development tags is useful candidate evidence, not final-package acceptance.

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
