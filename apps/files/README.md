# Files

Built-in research file access through the ScholarServer MCP Gateway. Upstream
`@modelcontextprotocol/server-filesystem` owns file operations; our small bridge
adds authenticated HTTP, a fixed tool namespace, bounded requests and a queue.

Files starts with two empty, installation-owned folders. **Change shared storage**
attaches one existing storage resource to each slot: `read-only` or `read-write`.
Keep folders with different permissions in separate storage resources. Detaching
a resource stops exposing it; it does not delete or copy its contents. Read-only
access is enforced by the container mount, not by asking the agent to behave.

Never attach system directories, credentials, live databases or application
profiles. Use application MCP tools for app-managed content. Changing files in a
synced folder can propagate those changes to other devices. Writes can overwrite
existing content; keep backups. Permanent deletion and arbitrary shell execution
are not offered. Moves across separate mounted filesystems are not promised.

The app remains installed and enabled, but users control its shared storage.
Each installation has separate data, credentials and network identity.

## Packaging

Filesystem 2026.8.31 and SDK 1.30.0 are pinned with npm integrity in package-lock.
The npm archive omits its licence file; UPSTREAM-LICENSE preserves the licence
from npm's gitHead a40bc270fb5ece62673f8a1196f57116d885c5eb. That revision uses
Apache-2.0 for consenting/new contributions and MIT for remaining contributions.
Dependencies retain their packaged notices. We do not modify upstream files.

The original folder icon (`icon.svg` and its WebP export) is by ScholarServer,
licensed CC-BY-4.0. It is checksum-locked alongside the catalog's upstream icons.

This is a reference implementation, not a security certification. Folder
permissions, container restrictions and regression tests are our responsibility.
