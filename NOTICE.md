# Notices

The Obsidian Headless container began from the public Docker packaging work in
[Belphemur/obsidian-headless-sync-docker](https://github.com/Belphemur/obsidian-headless-sync-docker).
Its history is retained in this repository. ScholarServer's controller and package
integration replace the original environment-variable enrollment flow.

Obsidian and Obsidian Sync are products of Dynalist Inc. They are not open-source
software and are not distributed by this repository. The package installs the official
`obsidian-headless` client from npm; use of Obsidian services remains subject to
Obsidian's terms and any required paid plan.

The optional Self-hosted LiveSync profile integrates
[vrtmrz/obsidian-livesync](https://github.com/vrtmrz/obsidian-livesync), including
its LiveSync CLI image and the Setup URI/provisioning flow adapted from the
upstream utilities. Self-hosted LiveSync is licensed under the MIT License.

The LiveSync database service derives from the official Apache CouchDB image.
Apache CouchDB is licensed under the Apache License 2.0.
