# Obsidian package

This package keeps one server-side Obsidian vault and exposes the folder the
user chooses through ScholarServer's authenticated MCP Gateway.

Choose one sync method:

1. **Obsidian Sync** uses the official paid service through Obsidian Headless.
   Choose **Install and connect** to download the approved client directly from
   npm to your server. Requires your own Sync subscription; Obsidian's terms
   apply. The client is not bundled in new ScholarServer images.
   The first server sync is download-only before two-way sync begins.
2. **Self-hosted LiveSync** runs a separate CouchDB container and LiveSync CLI
   worker. ScholarServer creates an encrypted Setup URI, then guides the user
   through installing and enabling the community plugin on their own device.
   This option does not install or run official Obsidian Headless.

Never enable Obsidian Sync, iCloud, Git/Syncthing, or another vault sync engine
at the same time as Self-hosted LiveSync. Additional devices should generate a
fresh Setup URI from an already-connected Obsidian device.

LiveSync requires an HTTPS address accessible to every Obsidian device. Route
that hostname to `http://obsidian-livesync:5984` on the shared edge network.

LiveSync offers two connection methods:

- **Private Tailscale (recommended):** ScholarServer publishes CouchDB only to
  the installation's tailnet. Every Obsidian device must run Tailscale.
- **Public HTTPS:** Cloudflare Tunnel or direct HTTPS publishes CouchDB for
  devices that cannot join the tailnet. The generated client is restricted to
  its single vault database and LiveSync uses end-to-end encryption.

The platform access layer owns Tailscale and public routing. The application
container never receives the Docker socket or Tailscale administrator access.
CouchDB uses generated native credentials, so an interactive login proxy must
not sit between the plugin and CouchDB replication.

Account passwords, MFA codes, and one-time Setup URI passwords are not retained
after onboarding. Persistent vault data, CouchDB data, the headless client
state, and the local LiveSync database remain in ScholarServer-managed paths.

On migration from the bundled client, official Sync pauses until you confirm
the download. Existing notes, sign-in and vault enrollment remain unchanged.
Updating the approved client is explicit, never an automatic latest download.

Application backups include vaults, credentials and the recorded client version,
but exclude the downloaded executable directory. Restore to a new server asks
before reinstalling. Keep older backups private; they are not rewritten.
This packaging separation does not establish permission for managed hosting.
