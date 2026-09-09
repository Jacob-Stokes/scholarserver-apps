import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { atomicJson } from "@scholarserver/controller-runtime/files";
import { AutomationConfigurationError } from "./configuration.mjs";

export const researchKinds = ["reading-notes", "research-digest", "convert-pdfs"];

export function researchConfiguration(template, settings) {
  if (!template.research) return null;
  if (!researchKinds.includes(template.research)) throw new Error("Unknown research template kind");
  const bindings = settings.research;
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
    throw new AutomationConfigurationError("Choose the applications and output folder first");
  }
  const destination = template.research === "convert-pdfs" ? "docling" : "obsidian";
  const allowed = ["workspaceId", "zotero", destination, "folder"];
  if (Object.keys(bindings).some((key) => !allowed.includes(key))) {
    throw new AutomationConfigurationError("Unknown research connection setting");
  }
  for (const field of ["workspaceId", "zotero", destination]) {
    if (typeof bindings[field] !== "string" || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(bindings[field])) {
      throw new AutomationConfigurationError("Choose an installed application");
    }
  }
  const folder = bindings.folder;
  if (
    typeof folder !== "string" ||
    !folder ||
    folder.length > 200 ||
    folder.split("/").some((part) => !part || part.startsWith(".") || /[\\\x00-\x1f]/.test(part))
  ) {
    throw new AutomationConfigurationError("Choose a relative folder, without hidden folders or parent paths");
  }
  return { kind: template.research, ...bindings };
}

function digest(token) {
  return createHash("sha256").update(token).digest("hex");
}

// n8n keeps the bearer value in its encrypted credential store. This separate
// journal holds only a verifier and the exact applications/folder it authorizes.
// A lost credential-create reply is not replayed: the unconfirmed grant is inert.
export class ResearchAccess {
  constructor({ directory, client }) {
    this.directory = directory;
    this.client = client;
    this.pending = Promise.resolve();
  }

  file(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid research connection identity");
    return path.join(this.directory, `${id}.json`);
  }

  async read(id) {
    const grant = JSON.parse(await readFile(this.file(id), "utf8"));
    if (grant.schemaVersion !== 1 || grant.id !== id) throw new Error("Research connection needs recovery");
    return grant;
  }

  serialise(operation) {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }

  provision(id, scope) {
    return this.serialise(() => this.createCredential(id, scope));
  }

  async createCredential(id, scope) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      const existing = await this.read(id);
      if (existing.state === "ready" && JSON.stringify(existing.scope) === JSON.stringify(scope)) return existing;
      throw new Error("Research credential creation needs review; it will not be retried automatically");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const token = randomBytes(32).toString("hex");
    const grant = { schemaVersion: 1, id, scope, tokenHash: digest(token), state: "creating", credential: null };
    await atomicJson(this.file(id), grant);
    try {
      const credential = await this.client.createCredential({
        name: `ScholarServer research ${id}`,
        type: "httpHeaderAuth",
        data: { name: "X-ScholarServer-Workflow", value: `${id}.${token}` }
      });
      if (typeof credential?.id !== "string") throw new Error("Missing credential receipt");
      grant.credential = { id: credential.id, name: credential.name };
      grant.state = "ready";
      await atomicJson(this.file(id), grant);
      return grant;
    } catch (error) {
      grant.state = "unconfirmed";
      await atomicJson(this.file(id), grant);
      throw error;
    }
  }

  async authorize(header) {
    if (typeof header !== "string" || !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(header)) {
      throw new Error("Research connection is not authorized");
    }
    const [id, token] = header.split(".");
    const grant = await this.read(id);
    const expected = Buffer.from(grant.tokenHash, "hex");
    const actual = Buffer.from(digest(token), "hex");
    if (grant.state !== "ready" || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new Error("Research connection is not authorized");
    }
    return grant.scope;
  }

  revoke(id) {
    return this.serialise(async () => {
      const grant = await this.read(id);
      grant.state = "revoked";
      await atomicJson(this.file(id), grant);
    });
  }
}
