# n8n for ScholarServer (Beta)

n8n runs workflows on your server. ScholarServer provides an app-owned screen
for installing reviewed workflow templates, choosing their initial schedule,
enabling or disabling them, and viewing recent runs.

## Connect your installation

This candidate is available only in the development catalog. Automatic private
editor access is not yet implemented; see the [release gate](../RELEASE_BLOCKED.md).

1. Install n8n from the development application catalog.
2. Open its separately provisioned private editor address.
3. Create your n8n owner account. In **Settings → n8n API**, create an API key
   with custom scopes: `workflow:create`, `workflow:list`, `workflow:read`,
   `workflow:update`, `workflow:activate`, `workflow:deactivate`, `execution:list`
   and `credential:create`. Full instance-administration access is not required.
4. Return to ScholarServer's n8n screen, paste the key and select **Save connection**.

This initial setup requires opening n8n once. The saved key stays in protected
application storage on the server. Workflow credentials stay in n8n's encrypted
credential store. Do not put secrets directly in workflow parameters or YAML.
Choose a key expiration and replace the saved connection before it expires.

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
