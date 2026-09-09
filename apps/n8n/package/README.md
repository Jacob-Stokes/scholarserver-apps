# n8n for ScholarServer (Beta)

n8n runs workflows on your server. ScholarServer provides an app-owned screen
for installing reviewed workflow templates, choosing their initial schedule,
enabling or disabling them, and viewing recent runs.

## Connect your installation

This candidate is available only in the development catalog. Automatic private
editor access is not yet implemented; see the [release gate](../RELEASE_BLOCKED.md).

1. Install n8n from the development application catalog.
2. Open Automations in ScholarServer and choose a password.
3. Select **Finish installation**. ScholarServer creates the local n8n owner
   account and its restricted automation connection automatically.

You do not need to open n8n or copy an API key. If you use the optional native
editor later, sign in as `owner@scholarserver.invalid` with your chosen password.
This account name is local to the installation; it is not an email inbox.
An existing connected installation shows **n8n is ready** without changing its
owner or workflows. Reconnecting an existing installation requires its existing
owner email and password, plus a two-factor code if enabled.

The generated, non-expiring key stays in protected
application storage on the server. Workflow credentials stay in n8n's encrypted
credential store. Do not put secrets directly in workflow parameters or YAML.
Previously connected installations keep their existing key and expiration.
If a connection expires, enter the existing owner's credentials to reconnect;
ScholarServer creates its own restricted key without deleting unrelated keys.

## Current limits

The initial catalog contains a connection-check workflow. Workflows created in
n8n appear in the inventory; ScholarServer does not overwrite them. Editing an
installed template directly in n8n prevents ScholarServer from enabling an
unexpected revision. Use n8n to review and manage those edits.

Existing Zotero automations are unchanged. Migration, credential onboarding
within ScholarServer, and editing an installed template's settings are not yet
available. Public webhooks and Gateway MCP access are not configured by this
package. n8n can make outbound requests; only configure destinations you trust.

## Data and recovery

Back up n8n's complete state directory and ScholarServer's integration runtime
together. The n8n encryption key is needed to decrypt its saved credentials;
copying the database alone is insufficient. Cache data is reproducible.
Removing the application preserves its declared data by default.

## License

n8n remains subject to its Sustainable Use License; it is not MIT-licensed.
See [n8n's licensing guidance](https://docs.n8n.io/sustainable-use-license/).
This beta is for self-hosted installation. Managed-hosting rights require a
separate assessment and are not granted by ScholarServer's source-code license.
The included icon is from selfh.st/icons under CC-BY-4.0, as declared in the
package manifest.
