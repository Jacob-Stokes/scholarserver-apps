import { readFile } from "node:fs/promises";
import { startMcp } from "mcp-common";
import { VaultConnections } from "./lib/connections.js";
import { ObsidianError } from "./obsidian-client.js";
import { obsidianTools } from "./vault-tools.js";

const PORT = parseInt(process.env.PORT || "7002", 10);
const OBSIDIAN_BASE_URL = process.env.OBSIDIAN_BASE_URL || "http://api:3000";

async function serviceToken(): Promise<string> {
  if (process.env.MCP_BEARER_TOKEN) return process.env.MCP_BEARER_TOKEN;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const token = (await readFile("/runtime/service-token", "utf8")).trim();
      if (token) return token;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("ScholarServer service token was not created");
}

const MCP_BEARER_TOKEN = await serviceToken();
const apiKey = process.env.OBSIDIAN_API_KEY || MCP_BEARER_TOKEN;

const connections = new VaultConnections(OBSIDIAN_BASE_URL, apiKey);
const maximumAttachmentBytes = parseInt(process.env.OBSIDIAN_MAX_ATTACHMENT_BYTES || String(10 * 1024 * 1024), 10);
if (!Number.isSafeInteger(maximumAttachmentBytes) || maximumAttachmentBytes <= 0) {
  throw new Error("OBSIDIAN_MAX_ATTACHMENT_BYTES must be a positive integer");
}

try {
  new Intl.DateTimeFormat("en-CA", { timeZone: process.env.OBSIDIAN_TIMEZONE || "UTC" }).format(new Date());
} catch {
  console.error(`FATAL: invalid OBSIDIAN_TIMEZONE: ${process.env.OBSIDIAN_TIMEZONE || "UTC"}`);
  process.exit(1);
}

for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    await connections.list();
    console.log(`obsidian connectivity: ok (${OBSIDIAN_BASE_URL})`);
    break;
  } catch (error: any) {
    if (attempt === 59) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// OAuth is opt-in. Set MCP_OAUTH_ISSUER + MCP_OAUTH_CANONICAL_URL to enable.
// Bot + CLI continue working on static bearer regardless.
const oauth = process.env.MCP_OAUTH_ISSUER
  ? {
      issuer: process.env.MCP_OAUTH_ISSUER,
      canonicalUrl: process.env.MCP_OAUTH_CANONICAL_URL!,
      jwksUri: process.env.MCP_OAUTH_JWKS_URI,
      audience: process.env.MCP_OAUTH_AUDIENCE, // e.g. Authentik client_id
      scopesSupported: (process.env.MCP_OAUTH_SCOPES || "openid email profile offline_access").split(/\s+/)
    }
  : undefined;

await startMcp({
  name: "obsidian-mcp",
  version: "1.0.0",
  port: PORT,
  bearerToken: MCP_BEARER_TOKEN,
  oauth,
  instructions:
    "This is the remote, server-side Obsidian vault integration. Call obsidian_list_vaults and choose an explicit vault_id before every content operation. Read Home.md when present before choosing where to write. " +
    "Prefer focused tools over deprecated compatibility tools; use expected_hash for read-modify-write work and dry_run for broad changes. " +
    "Desktop UI, workspace and command-palette operations require the separate local companion and are intentionally unavailable here.",
  tools: obsidianTools(connections),
  onBackendError: (e) => {
    if (e instanceof ObsidianError) {
      const detail = typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail);
      return `obsidian API error: ${e.method} ${e.path} → HTTP ${e.status}: ${detail}`;
    }
    return null;
  }
});
