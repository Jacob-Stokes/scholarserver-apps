import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { createServer, request as nodeHttpRequest } from "node:http";
import { pathToFileURL } from "node:url";

const tokenPath = "/runtime/local-api-bridge-token";

async function localApiBridgeToken() {
  try {
    return (await readFile(tokenPath, "utf8")).trim();
  } catch {
    return "";
  }
}

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

function bridgeTokenMatches(candidate, expected) {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

export async function handleLocalApiBridge(
  request,
  response,
  { readToken = localApiBridgeToken, send = nodeHttpRequest } = {}
) {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && url.pathname === "/health") {
    return json(response, 200, { status: "ok" });
  }
  if (!(url.pathname === "/api" || url.pathname.startsWith("/api/") || url.pathname === "/connector/ping")) {
    return json(response, 404, { error: "Not found" });
  }
  const expected = await readToken();
  const suppliedHeader = request.headers["x-scholarserver-bridge"];
  const supplied = Array.isArray(suppliedHeader) ? suppliedHeader[0] : (suppliedHeader ?? "");
  if (!expected || !bridgeTokenMatches(supplied, expected)) {
    return json(response, 401, { error: "Unauthorized" });
  }

  const upstreamHeaders = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (!hopByHopHeaders.has(name) && name !== "host" && name !== "x-scholarserver-bridge" && value !== undefined) {
      upstreamHeaders[name] = value;
    }
  }
  const upstreamRequest = send(
    {
      hostname: "127.0.0.1",
      port: 23119,
      path: `${url.pathname}${url.search}`,
      method: request.method,
      headers: upstreamHeaders
    },
    (upstreamResponse) => {
      response.statusCode = upstreamResponse.statusCode ?? 502;
      for (const [name, value] of Object.entries(upstreamResponse.headers)) {
        if (!hopByHopHeaders.has(name) && value !== undefined) response.setHeader(name, value);
      }
      response.setHeader("Cache-Control", "no-store");
      upstreamResponse.pipe(response);
    }
  );
  upstreamRequest.on("error", () => {
    if (!response.headersSent) json(response, 502, { error: "Zotero local API is unavailable" });
    else response.destroy();
  });
  request.on("aborted", () => upstreamRequest.destroy());
  request.pipe(upstreamRequest);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir("/runtime", { recursive: true });
  // Never replace an existing credential shared with the MCP and controller.
  let file;
  try {
    file = await open(tokenPath, "wx", 0o600);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  if (file) {
    try {
      await file.writeFile(randomBytes(32).toString("base64url") + "\n");
      await file.sync();
    } finally {
      await file.close();
    }
  }
  if (!(await localApiBridgeToken())) throw new Error("Local API bridge token is unavailable");
  createServer((request, response) => {
    void handleLocalApiBridge(request, response).catch(() => {
      if (!response.headersSent) json(response, 500, { error: "Local API bridge failed" });
      else response.destroy();
    });
  }).listen(8082, "0.0.0.0");
}
