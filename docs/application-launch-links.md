# Native interface shortcuts and access setup

Core now supports optional endpoint `launchLabel` metadata. It discovers the
installed manifest and selected setup option, validates the saved access choice,
and shows direct Open links on Installed application cards. This does not create
a route automatically. A missing label is intentionally not inferred from
`human-optional`: sync servers also use that exposure.

For the next compatible package versions:

| App | Endpoint | Label |
| --- | --- | --- |
| FreshRSS | reader | Reader |
| Logseq | editor | Notebook |
| Zotero complete workspace | desktop | Desktop |
| Paperless candidate | documents | Documents |

Files, Obsidian's sync services and Docling's conversion API are not native web
editors; keep their Manage/setup actions without inventing Open shortcuts. The
Logseq sync endpoint must not be labelled. A setup option without a desktop must
not acquire one merely through metadata.

Use shared endpoint-access setup to offer private Tailscale (recommended), and
public Cloudflare/Funnel or advanced direct HTTPS/existing proxy only when the
platform and endpoint support them. Do not expose raw VNC or open arbitrary host
ports. Optional Authentik protection follows the endpoint's compatibility policy;
it must not block device sync or internal service communication.

## Pending rollout

These declarations are planned for new immutable package releases, not edits to
published manifests. First establish a compatible Manager release requirement;
older schemas reject the new field. Then add labels, validate both selected app
setups and test configured/unconfigured/stopped states and native launch in a
browser. No package publication or deployment is performed by this document.

Paperless remains a candidate: its setup/controller still needs the shared access
picker wired into real provisioning. The native read-only MCP probe is not proof
that this user-facing setup flow is complete.
