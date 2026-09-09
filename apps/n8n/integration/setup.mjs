import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { atomicJson } from "@scholarserver/controller-runtime/files";
import { N8nClient } from "./client.mjs";

export class N8nSetup {
  constructor({ directory, baseUrl, makeClient = (options) => new N8nClient(options) }) {
    this.directory = directory;
    this.file = path.join(directory, "connection.json");
    this.baseUrl = baseUrl;
    this.makeClient = makeClient;
  }

  async client() {
    let connection;
    try {
      connection = JSON.parse(await readFile(this.file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw new Error("The saved n8n connection needs recovery");
    }
    return this.makeClient({ baseUrl: this.baseUrl, apiKey: connection.apiKey });
  }

  async status() {
    const client = await this.client();
    if (!client) return { connected: false };
    await client.listWorkflows();
    return { connected: true };
  }

  async connect(input) {
    if (
      !input ||
      Object.keys(input).some((key) => key !== "apiKey") ||
      typeof input.apiKey !== "string" ||
      input.apiKey.length > 8192
    ) {
      throw new Error("Enter an n8n API key");
    }
    const apiKey = input.apiKey.trim();
    const client = this.makeClient({ baseUrl: this.baseUrl, apiKey });
    // A failed replacement must not discard the last working credential.
    await client.listWorkflows();
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await atomicJson(this.file, { apiKey });
    return { connected: true };
  }
}
