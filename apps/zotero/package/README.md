# Zotero package

This package provides a native browser-hosted Zotero 10 Desktop, a first-party MCP,
and an attachment resolver. Zotero's localhost API is never published or placed on an
ordinary Docker network. The controller and MCP join only the Desktop service's network
namespace and reach it at `127.0.0.1:23119`.

After installation, Zotero's standalone ScholarServer application page guides
the user through:

1. Connecting a Zotero account through Zotero's own browser authorization page.
2. Selecting one storage mode:
   `zotero-storage`, `webdav`, `linked-folder`, or `server-only`.
3. Supplying WebDAV settings when that storage mode is selected. ScholarServer asks
   Zotero to verify the server before reporting success.
   WebDAV covers the personal library only; group-library files can optionally use
   Zotero Storage and ScholarServer explains the quota implication in the setup UI.
4. Starting local authorization and choosing **Always Allow** in Zotero's prompt.
5. Starting the first synchronization from ScholarServer.

ScholarServer never asks for the Zotero password. The account token and any WebDAV
password stay in Zotero's encrypted credential store inside its persistent profile.
Setup commands pass through a private, single-use filesystem bridge shared only by the
Zotero engine and its controller; their request files are removed before processing.
ScholarServer retains a Zotero-local API authorization key, which is unrelated to the
user's zotero.org API key and is only usable against this local Desktop instance.

The `resolve-attachment` diagnostic action asks Zotero for a supported local file URL,
then verifies that the canonical file remains below `/data` or `/linked`. It never reads
`zotero.sqlite` and never accepts an arbitrary filesystem path.

The controller serves package-owned Overview, Attachments, Automations and
Configuration tabs on port 8080 inside the Desktop network namespace. The
Automations tab is a searchable catalogue of cards rather than one expanded
workflow form. Each card can be activated independently and opens a stable
detail route for configuration, scheduling, manual runs and history. Activation
does not silently enable scheduling. Only the generic Manager proxy can reach
that interface through the restricted `scholarserver-edge` network; neither it
nor Zotero's localhost API has a published host port.

The Zotero stack also owns a small, unprivileged automation worker. Its first
curated action discovers Zotero PDFs in the selected shared-storage folder,
asks an installed Docling application to convert them, and can attach the
resulting Markdown to the matching Zotero item. The worker stores its settings,
schedule and recent run history in a dedicated persistent data slot. It has no
host port, no Docker socket and no arbitrary script or YAML execution surface.
Stopping Zotero stops the worker with the rest of the application stack.
