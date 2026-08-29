# Zotero compatibility spike

The first ScholarServer Zotero package uses Zotero Desktop as the local library
authority. Its MCP and processor share the Desktop container's network namespace,
so Zotero's localhost-only API on port 23119 remains localhost-only.

```text
authenticated noVNC UI ── Zotero Desktop ── Zotero/Zotero-WebDAV sync
                              │
                         localhost:23119
                              │
                    ┌─────────┴─────────┐
                    │                   │
               Zotero MCP     Zotero automation worker
                                        │
                                  Docling service
```

This avoids direct access to `zotero.sqlite`. Zotero 10's local API supplies normal
metadata reads and writes, resolves stored attachment paths, and accepts full file
uploads. A generated Markdown derivative therefore enters Zotero through a supported
API and is synchronized by Zotero according to the user's selected attachment policy.

Account linking and sync preferences use a bundled Zotero bootstrap plugin rather than
editing its profile database or storing credentials in Compose. The controller sends
single-use JSON commands over a private runtime volume. Zotero performs account linking,
encrypted WebDAV credential storage, server verification, and synchronization through
its own internal APIs. Request and response files are removed after every operation.

The Desktop image is built from Zotero's official, checksum-pinned native Linux
tarballs for amd64 and arm64. It does not use architecture emulation. The web desktop
has no independent VNC password because it is reachable only through ScholarServer's
authenticated ingress; VNC itself listens on container-localhost.

The automation worker belongs to the Zotero application stack. It owns the curated
Zotero-to-Docling action, its settings, schedule and run history; Docling remains a
reusable conversion service and does not contain Zotero workflow logic.

## Storage adapters

The processor presents two resolver families:

- `managed-zotero`: Zotero Storage, WebDAV, or server-only stored attachments that
  Zotero has made available in its local data directory.
- `linked-folder`: linked attachments below a separately configured and mounted root.

Storage providers such as Google Drive, SMB, Syncthing, or rclone are not Zotero
resolvers. They are ways to make the linked-folder capability available.

## Spike acceptance criteria

1. Open Zotero Desktop through authenticated ScholarServer ingress.
2. Sign in and synchronize a test item with a PDF.
3. Authorize ScholarServer once through Zotero 10's local API prompt.
4. Read the item and attachment through the first-party MCP.
5. Resolve the PDF without reading the Zotero database.
6. Convert it asynchronously with Docling.
7. Upload Markdown as a child attachment through the local API.
8. Observe the derivative on another synchronized Zotero client.
9. Read the derivative through the remote MCP.

The Docling integration imports the generated Markdown as a stored child attachment.
The shared document mount is therefore only a hand-off location: Zotero copies the
derivative into its own attachment storage and applies the user's selected Zotero
Storage, WebDAV, or server-only synchronization policy. ScholarServer never edits
`zotero.sqlite`.
