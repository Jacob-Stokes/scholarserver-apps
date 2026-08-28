# Obsidian package

This package creates a server replica of an existing Obsidian Sync vault and exposes
the selected folder through ScholarServer's authenticated MCP Gateway.

Enrollment is separate from installation. The stack first starts in setup-required,
then the Manager guides the user through:

1. Obsidian account login, with optional MFA.
2. Remote vault selection.
3. A pull-only initial download.
4. Switching to continuous bidirectional sync after the first pull succeeds.
5. Selecting / for the whole vault or a folder such as ScholarServer for MCP.

The account password, MFA code, and E2EE password are not retained. The package keeps
Obsidian Headless's own session/configuration, the vault replica, and a random internal
service token under ScholarServer-managed data directories.
