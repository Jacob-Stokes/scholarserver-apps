# Logseq beta: software and source

ScholarServer's integration code is MIT-licensed (repository LICENSE). Logseq
and the community self-host packaging are AGPL-3.0; this notice does not relicense
them. Original notices and dependency licence files remain in the images.
Electron's licence and Chromium notices are retained in /opt/logseq. The helper
contains the official desktop archive running in Node mode, not a new GUI fork.

Exact corresponding upstream sources and build recipes:

| Component | Source |
| --- | --- |
| Official client 2.0.1 | https://github.com/logseq/logseq/tree/2.0.1 |
| Sync runtime | https://github.com/logseq/logseq/tree/4e88418b85bbaca326220af1f276697b7735d7a3 |
| Sync packaging | https://github.com/yshalsager/logseq-selfhost/tree/3c894de08098169466ddba57fc8e7befc236ed39 |
| Browser runtime | https://github.com/logseq/logseq/tree/d2ab7726ab74402c14fdbc33041a89ac55c899ae |
| Browser packaging | https://github.com/yshalsager/logseq-selfhost/tree/6e7845732560b9f8e169bc1f9886adfd395dc0ee |
| ScholarServer integration/builds | https://github.com/Jacob-Stokes/scholarserver-apps |

The source trees include dependency lockfiles and build instructions. The sync
and browser refs were verified against successful public build runs
33962665244 and 33962673328, not inferred from packaging labels alone.
Source archives for these revisions must accompany the catalog release, together
with the integration source commit and final image digests.

The upstream browser image's inherited Apache-2.0 label describes its Nginx base,
not Logseq. It does not replace Logseq's AGPL licence.

## Beta limitations

For Logseq 2 database notebooks, not legacy Markdown graphs. Start with a
disposable notebook. A Logseq account and Tailscale are required. Self-hosted sync
retains upstream account authentication and encryption. Physical-device and final
public OAuth/MCP acceptance are incomplete. No automatic conversion, enrollment,
or migration of existing notebooks occurs.

Source availability and retained notices are engineering distribution measures,
not a legal opinion or upstream endorsement of a managed-hosting service.
