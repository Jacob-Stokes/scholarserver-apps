# Obsidian package

This package keeps one server-side Obsidian vault and exposes the folder the
user chooses through ScholarServer's authenticated MCP Gateway.

Setup offers exactly one sync profile:

1. **Obsidian Sync** uses the official paid service through Obsidian Headless.
   The first server sync is download-only before two-way sync begins.
2. **Self-hosted LiveSync** runs a separate CouchDB container and LiveSync CLI
   worker. ScholarServer creates an encrypted Setup URI, then guides the user
   through installing and enabling the community plugin on their own device.

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
