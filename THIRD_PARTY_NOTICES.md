# Third-party notices

## Applications and integrations

Upstream application images retain their original files and notices. See
`docs/image-packaging.md` for which images we maintain and why.

- CouchDB: Apache-2.0, https://github.com/apache/couchdb/blob/main/LICENSE.
  Our thin wrapper inherits the upstream image and does not remove its notices.
- Self-hosted LiveSync and LiveSync CLI: MIT,
  https://github.com/vrtmrz/obsidian-livesync/blob/main/LICENSE and
  https://github.com/vrtmrz/livesync-cli. The CLI image retains upstream files;
  installed npm dependencies retain their packaged licence files.
- Zotero: AGPL-3.0, https://www.zotero.org/support/licensing and corresponding
  upstream source https://github.com/zotero/zotero. ZotMoov source/licence:
  https://github.com/wileyyugioh/zotmoov. Packaging exceptions do not remove
  corresponding-source obligations; complete distribution compliance before
  public release.
- Obsidian Headless is proprietary, not licensed as part of ScholarServer.
  New controller builds do not contain it. When requested, the user's server
  downloads it from npm under https://obsidian.md/terms. Its README/package
  notices are preserved in that installation. Older published controller images
  still contain the previously bundled client; this source change does not
  retroactively alter those immutable images.
- The official-client adapter's bundled dependencies `better-sqlite3`,
  `commander` and `tar` are MIT-licensed. Their licence files remain in
  `node_modules`; they are not the proprietary Obsidian client.

## Application icons

The packaged Docling, Obsidian and Zotero icons are sourced from
[selfh.st/icons](https://selfh.st/icons/) at the commit recorded in
`icons.lock.json`. The icon collection is distributed under
[CC BY 4.0](https://github.com/selfhst/icons/blob/main/LICENSE).

Product names and logos remain the property of their respective owners.
