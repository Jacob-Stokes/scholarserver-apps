# Zotero package

This package provides two beginner-facing setup options:

Both options include a Zotero MCP container connected to ScholarServer Gateway.
See [the capability comparison](../docs/install-options.md) for the install,
storage and version distinctions.

- **Complete Zotero workspace** runs native browser-hosted Zotero 10 Desktop, its
  setup bridge and ZotMoov, the first-party MCP, attachment resolver, and automation
  worker.
- **Online library only** runs just the first-party controller and MCP against Zotero
  Web API v3. It does not install Zotero Desktop or desktop plugins on the server.

The complete workspace reaches Zotero's loopback-only API through a generated-token
bridge on its instance-private Docker network. Port 23119 is never published to the
host or public edge.

For the complete workspace, Zotero's application page guides the user through:

1. Connecting a Zotero account through Zotero's own browser authorization page.
2. Selecting one storage mode:
   `zotero-storage`, `webdav`, `linked-folder`, or `server-only`.
3. Supplying WebDAV settings when that storage mode is selected. ScholarServer asks
   Zotero to verify the server before reporting success.
   WebDAV covers the personal library only; group-library files can optionally use
   Zotero Storage and ScholarServer explains the quota implication in the setup UI.
4. Choosing a protected Zotero Desktop address. Private Tailscale is recommended
   and created from ScholarServer's existing private connection. Cloudflare and
   advanced HTTPS choices appear only after the corresponding Manager connection
   has been enabled in the global Access page.
5. Starting local authorization and choosing **Always Allow** in Zotero's prompt.
   When the protected desktop is on the same origin, the setup panel can show it;
   a separate-tab link remains available. Sign-in itself stays on Zotero's website.
6. Starting the first synchronization from ScholarServer.

ScholarServer never asks for the Zotero password. The account token and any WebDAV
password stay in Zotero's encrypted credential store inside its persistent profile.
Setup commands pass through a private, single-use filesystem bridge shared only by the
Zotero engine and its controller; their request files are removed before processing.
ScholarServer retains a Zotero-local API authorization key, which is unrelated to the
user’s zotero.org API key and is only usable against this local Desktop instance.

For Online library only, the page instead guides the user through:

1. Creating a dedicated key in their Zotero account with clearly explained access.
2. Connecting and validating that key without placing it in Compose.
3. Choosing citation data only or Zotero Storage files on demand.

WebDAV and linked-file contents require the complete workspace. Zotero Storage files
can be fetched into the online setup's private cache when a tool requests them.

The `resolve-attachment` diagnostic action asks Zotero for a supported local file URL,
then verifies that the canonical file remains below `/data` or `/linked`. It never reads
`zotero.sqlite` and never accepts an arbitrary filesystem path.

Configure this installation in **Applications → Manage → Configuration**.
The app-owned attachment workspace remains available separately. Only the
generic Manager proxy can reach its interface through the restricted
`scholarserver-edge` network; neither it nor Zotero's local API has a published
host port. Online library only presents its applicable Web API permissions.

Create new PDF workflows in **Automations**, using Docling for conversion.
Fresh Zotero configuration does not offer another PDF scheduler or connection
setup. Existing saved processing settings, schedules, failures and recent runs
remain under **Previous PDF processing** in Configuration. They are not silently
migrated or deleted. The previous unprivileged worker and its persistent state
remain for those installations; stopping Zotero also stops that worker. It has
no host port, Docker socket or arbitrary script/YAML execution surface. Its
older Manager authentication route remains a compatibility limitation; keeping
its controls does not establish that a live conversion still succeeds.
