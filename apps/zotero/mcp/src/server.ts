import { startMcp } from "mcp-common";
import { readFile } from "node:fs/promises";
import { ZoteroClient, ZoteroError } from "./zotero-client.js";
import { ITEMS_TOOL, ItemsInput, handleItems } from "./tools/items.js";
import { COLLECTIONS_TOOL, CollectionsInput, handleCollections } from "./tools/collections.js";
import { ATTACHMENTS_TOOL, AttachmentsInput, handleAttachments } from "./tools/attachments.js";
import { NOTES_TOOL, NotesInput, handleNotes } from "./tools/notes.js";
import { TAGS_TOOL, TagsInput, handleTags } from "./tools/tags.js";

const PORT = parseInt(process.env.PORT || "7012", 10);
const runtimePath = process.env.ZOTERO_RUNTIME_PATH || "/runtime";
const variant = process.env.SCHOLARSERVER_VARIANT || "complete-workspace";
const onlineLibrary = variant === "online-library";
const ZOTERO_LOCAL_BASE_URL = process.env.ZOTERO_LOCAL_BASE_URL || "http://desktop:23119/api";

async function requiredFile(name: string): Promise<string> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const value = (await readFile(`${runtimePath}/${name}`, "utf8")).trim();
      if (value) return value;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`ScholarServer runtime file was not created: ${name}`);
}

const MCP_BEARER_TOKEN = process.env.MCP_BEARER_TOKEN || await requiredFile("service-token");

const client = new ZoteroClient(async () => {
  let configuration: { userId?: string | number };
  try {
    configuration = JSON.parse(await readFile(`${runtimePath}/configuration.json`, "utf8"));
  } catch {
    throw new Error("Zotero setup is incomplete; configure the local library in ScholarServer first");
  }
  if (!configuration.userId) throw new Error("Zotero user ID is not configured");
  let token = "";
  try { token = (await readFile(`${runtimePath}/${onlineLibrary ? "web-api-key" : "local-api-key"}`, "utf8")).trim(); } catch {}
  if (onlineLibrary && !token) throw new Error("Zotero online-library setup is incomplete; connect the account in ScholarServer first");
  return {
    baseUrl: onlineLibrary ? "https://api.zotero.org" : ZOTERO_LOCAL_BASE_URL,
    userId: configuration.userId,
    token,
    local: !onlineLibrary,
  };
});

const MIXED_WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } as const;
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const oauth = process.env.MCP_OAUTH_ISSUER
  ? {
      issuer: process.env.MCP_OAUTH_ISSUER,
      canonicalUrl: process.env.MCP_OAUTH_CANONICAL_URL!,
      audience: process.env.MCP_OAUTH_AUDIENCE,
      scopesSupported: (process.env.MCP_OAUTH_SCOPES || "openid email profile").split(/\s+/),
    }
  : undefined;

await startMcp({
  name: "zotero-mcp",
  version: "1.0.0",
  port: PORT,
  bearerToken: MCP_BEARER_TOKEN,
  oauth,
  instructions:
    `This is the remote ScholarServer Zotero integration backed by the user's ${onlineLibrary ? "zotero.org online library" : "private server-side Zotero Desktop"}. ` +
    "Prefer focused reads before mutation, use item versions for optimistic concurrency when available, and keep generated derivatives attached to their source item.",
  tools: [
    { def: { ...ITEMS_TOOL, inputSchema: ItemsInput, annotations: MIXED_WRITE }, handler: (i) => handleItems(client, i) },
    { def: { ...COLLECTIONS_TOOL, inputSchema: CollectionsInput, annotations: MIXED_WRITE }, handler: (i) => handleCollections(client, i) },
    { def: { ...ATTACHMENTS_TOOL, inputSchema: AttachmentsInput, annotations: READ_ONLY }, handler: (i) => handleAttachments(client, i) },
    { def: { ...NOTES_TOOL, inputSchema: NotesInput, annotations: MIXED_WRITE }, handler: (i) => handleNotes(client, i) },
    { def: { ...TAGS_TOOL, inputSchema: TagsInput, annotations: MIXED_WRITE }, handler: (i) => handleTags(client, i) },
  ],
  onBackendError: (e) => {
    if (e instanceof ZoteroError) {
      return `zotero error: ${e.method} ${e.path} → HTTP ${e.status}: ${JSON.stringify(e.detail).slice(0, 200)}`;
    }
    return null;
  },
});
