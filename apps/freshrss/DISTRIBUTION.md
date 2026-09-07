# FreshRSS distribution

FreshRSS is supplied by the FreshRSS project, not rebuilt by ScholarServer.
Our reader image adds startup scripts on top of the official 1.29.1 image pinned
by SHA-256 digest, without modifying its software. FreshRSS is
AGPL-3.0; its source and licence are available at:
https://github.com/FreshRSS/FreshRSS/tree/1.29.1

ScholarServer distributes the separate setup/UI/MCP integration and its startup
adapter under this repository's licence. The adapter invokes upstream PHP code
on the user's server. Upstream notices remain in the unmodified upstream image.
The separate integration image does not embed FreshRSS or access its database directly.

The reader stores subscription URLs, article text, reading state and credentials
on the user's server. Feed providers receive requests from that server. Article
content is untrusted. MCP outputs are bounded and labelled accordingly.

Backups include FreshRSS data and the private integration credentials. They are
sensitive and should be encrypted. No third-party hosted account is required.
