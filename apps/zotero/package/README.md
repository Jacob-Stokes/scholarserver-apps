# Zotero package

This package provides a native browser-hosted Zotero 10 Desktop, a first-party MCP,
and an attachment resolver. Zotero's localhost API is never published or placed on an
ordinary Docker network. The controller and MCP join only the Desktop service's network
namespace and reach it at `127.0.0.1:23119`.

After installation, ScholarServer guides the user through:

1. Opening the authenticated Zotero desktop.
2. Signing into Zotero and allowing the first synchronization to finish.
3. Enabling **Allow other applications on this computer to communicate with Zotero**
   in Zotero's Advanced settings.
4. Entering the numeric Zotero user ID and selecting one storage mode:
   `zotero-storage`, `webdav`, `linked-folder`, or `server-only`.
5. Starting local authorization and choosing **Always Allow** in Zotero's prompt.

The Zotero password and any WebDAV credentials stay in Zotero's own persistent profile.
ScholarServer retains a Zotero-local API authorization key, which is unrelated to the
user's zotero.org API key and is only usable against this local Desktop instance.

The `resolve-attachment` diagnostic action asks Zotero for a supported local file URL,
then verifies that the canonical file remains below `/data` or `/linked`. It never reads
`zotero.sqlite` and never accepts an arbitrary filesystem path.
