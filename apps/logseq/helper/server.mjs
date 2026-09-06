import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { GraphError, graphCommand } from "./operations.mjs";
import { GraphRunner } from "./runner.mjs";

function authorized(request, token) {
  const supplied = Buffer.from(request.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function body(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 100_000) throw new GraphError("request-too-large", "The request is too large.", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new GraphError("invalid-json", "Provide a valid JSON request.");
  }
}

export function graphServer({ runner, token, ready = () => true }) {
  return createServer(async (request, response) => {
    const send = (status, result) => {
      response.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      });
      response.end(JSON.stringify(result));
    };
    try {
      if (request.method === "GET" && request.url === "/health") return send(ready() ? 200 : 503, { ready: ready() });
      if (!authorized(request, token)) return send(401, { error: "Sign-in required." });
      if (!ready()) return send(503, { error: "Logseq is starting. Try again shortly." });
      if (request.method !== "POST" || request.url !== "/v1/graph") return send(404, { error: "Not found." });
      const input = await body(request);
      const command = graphCommand(input?.operation, input?.input);
      const result = await runner.run(command);
      send(200, { data: result });
    } catch (error) {
      if (error instanceof GraphError) return send(error.status, { code: error.code, error: error.message });
      send(500, { error: "The graph operation could not be completed." });
    }
  });
}

async function serviceToken(runtime) {
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const target = `${runtime}/service-token`;
  try {
    const file = await open(target, "wx", 0o600);
    try {
      await file.writeFile(randomBytes(32).toString("base64url"));
      await file.sync();
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const token = (await readFile(target, "utf8")).trim();
  if (token.length < 32) throw new Error("Invalid service credential.");
  return token;
}

export async function initializeGraph(runner) {
  const directory = `${runner.root}/graphs/${runner.graph}`;
  try {
    await stat(directory);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await runner.run(["graph", "create"]);
  }
  // An existing but damaged graph is an error, never permission to reset it.
  await runner.run(["graph", "info"]);
}

async function main() {
  const runner = new GraphRunner({
    graph: process.env.LOGSEQ_GRAPH ?? "Research",
    root: process.env.LOGSEQ_GRAPH_ROOT ?? "/graph"
  });
  const token = await serviceToken(process.env.LOGSEQ_RUNTIME ?? "/runtime");
  let ready = false;
  const server = graphServer({ runner, token, ready: () => ready });
  server.requestTimeout = 90_000;
  server.headersTimeout = 10_000;
  server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
  try {
    await initializeGraph(runner);
    ready = true;
    console.log("Logseq graph is ready.");
  } catch {
    console.error("Logseq could not open the graph. Existing data was preserved.");
    server.close(() => process.exit(1));
  }
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, async () => {
      ready = false;
      server.close();
      try {
        await runner.run(["server", "stop"]);
      } finally {
        process.exit(0);
      }
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
