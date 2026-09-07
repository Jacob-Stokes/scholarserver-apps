import { randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { link, mkdir, open, unlink } from "node:fs/promises";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { connectFilesystem } from "./upstream.mjs";

async function serviceToken(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = `${directory}/service-token`;
  const temporary = `${directory}/.service-token-${randomBytes(12).toString("hex")}`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(randomBytes(32).toString("hex"));
      await file.sync();
    } finally {
      await file.close();
    }
    // Publish a complete credential without replacing one from an earlier start.
    await link(temporary, filename);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  } finally {
    await unlink(temporary).catch(() => {});
  }
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 128) throw new Error("Invalid service credential");
    const token = (await file.readFile("utf8")).trim();
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid service credential");
    return token;
  } finally {
    await file.close();
  }
}

export async function startFiles({ roots, runtime, port = 7014, host = "0.0.0.0", onFailure }) {
  const token = await serviceToken(runtime);
  const backend = await connectFilesystem(roots, onFailure);
  const transports = new Set();
  let active = 0;
  const http = createServer(async (request, response) => {
    const json = (status, value) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (request.url === "/health" && request.method === "GET") {
      try {
        await backend.healthy();
        json(200, { status: "ready" });
      } catch {
        json(503, { status: "unavailable" });
      }
      return;
    }
    const supplied = Buffer.from(request.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return json(401, { error: "Sign-in required" });
    if (request.headers.origin) return json(403, { error: "Use the authenticated ScholarServer Gateway" });
    if (request.url !== "/mcp") return json(404, { error: "Not found" });
    if (request.method !== "POST") return json(405, { error: "Use POST" });
    if (active >= 16) return json(429, { error: "Files is busy. Try again shortly." });
    active++;
    let transport;
    try {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) return json(413, { error: "Request is too large" });
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return json(400, { error: "Invalid request" });
      }
      const server = new Server(
        { name: "scholarserver-files", version: "0.1.0" },
        {
          capabilities: { tools: {} },
          instructions:
            "Only work in explicitly shared research folders. Read before editing. Never move app-managed database or attachment files behind an application's back. Writes can overwrite files. After a timeout, inspect the outcome before retrying."
        }
      );
      server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: backend.tools }));
      server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
        try {
          return await backend.call(params.name, params.arguments);
        } catch {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "The file operation could not be confirmed. Check the path, permissions and current file contents before retrying."
              }
            ]
          };
        }
      });
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      transports.add(transport);
      await server.connect(transport);
      await transport.handleRequest(request, response, body);
    } catch {
      if (!response.headersSent) json(500, { error: "Files could not complete the request" });
    } finally {
      active--;
      if (transport) {
        transports.delete(transport);
        await transport.close();
      }
    }
  });
  http.requestTimeout = 75_000;
  http.headersTimeout = 10_000;
  await new Promise((resolve) => http.listen(port, host, resolve));
  return {
    port: http.address().port,
    async close() {
      for (const transport of transports) await transport.close();
      http.closeAllConnections();
      await new Promise((resolve) => http.close(resolve));
      await backend.close();
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  const app = await startFiles({
    roots: ["/shared/read-only", "/shared/read-write"],
    runtime: "/runtime",
    // Docker restarts the whole service after a worker failure. Persistent data
    // and credentials survive; requests with unknown outcomes are never replayed.
    onFailure: () => setTimeout(() => process.exit(1), 100)
  });
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => void app.close().then(() => process.exit(0)));
}
