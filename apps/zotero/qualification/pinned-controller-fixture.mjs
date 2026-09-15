import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { researchWindow, runResearchCases } from "./research-cases.mjs";

// This entry point is only for a disposable, network-none container with an
// empty /runtime tmpfs. It must never be run inside an installed app container.
assert.equal(process.env.SCHOLARSERVER_SYNTHETIC_QUALIFICATION, "1");
assert.equal(process.getuid(), 10001);
for (const [file, expected] of [
  ["research-items.mjs", process.argv[2]],
  ["controller.mjs", process.argv[3]]
]) {
  const actual = createHash("sha256")
    .update(await readFile(`/app/${file}`))
    .digest("hex");
  assert.equal(actual, expected, `Pinned image ${file} must match the reviewed source`);
}

const config = JSON.stringify({ userId: "123", storageMode: "linked-folder" });
await writeFile("/runtime/configuration.json", config, { flag: "wx", mode: 0o600 });
await writeFile("/runtime/local-api-key", "SYNTHETIC_LOCAL_KEY", { flag: "wx", mode: 0o600 });
await writeFile("/runtime/local-api-bridge-token", "SYNTHETIC_BRIDGE_TOKEN", { flag: "wx", mode: 0o600 });
await mkdir("/runtime/requests", { mode: 0o700 });
await mkdir("/runtime/responses", { mode: 0o700 });
let pages = [];
let queries = [];
let badRequests = 0;
let metadataGets = 0;
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  response.setHeader("content-type", "application/json");
  if (request.method !== "GET" || request.headers["x-scholarserver-bridge"] !== "SYNTHETIC_BRIDGE_TOKEN") {
    badRequests += 1;
    response.writeHead(403).end("{}");
    return;
  }
  // A failed ping avoids any setup-bridge operation. Metadata reads still use
  // the real controller's existing local API adapter and synthetic credentials.
  if (url.pathname === "/connector/ping") return response.writeHead(503).end("{}");
  if (request.headers["zotero-api-key"] !== "SYNTHETIC_LOCAL_KEY") {
    badRequests += 1;
    return response.writeHead(403).end("{}");
  }
  if (url.pathname === "/api/users/123/items") return response.end("[]");
  if (url.pathname !== "/api/users/123/items/top") {
    badRequests += 1;
    return response.writeHead(404).end("{}");
  }
  metadataGets += 1;
  queries.push(`${url.pathname.slice(4)}${url.search}`);
  const offset = Number(url.searchParams.get("start"));
  response.end(JSON.stringify(pages[offset / 100] ?? []));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;
let child;
let childExit;

async function startController() {
  child = spawn(process.execPath, ["/app/controller.mjs"], {
    env: {
      ...process.env,
      SCHOLARSERVER_VARIANT: "complete-workspace",
      ZOTERO_LOCAL_BASE_URL: `${origin}/api`,
      ZOTERO_CONNECTOR_PING_URL: `${origin}/connector/ping`
    },
    stdio: "ignore"
  });
  childExit = once(child, "exit");
  await once(child, "spawn");
}

async function stopController() {
  if (!child) return;
  child.kill("SIGKILL");
  await childExit;
  child = null;
}

async function execute(input, nextPages) {
  pages = nextPages;
  queries = [];
  const id = randomUUID();
  const request = `/runtime/requests/${id}.json`;
  const response = `/runtime/responses/${id}.json`;
  await writeFile(`${request}.tmp`, JSON.stringify({ action: "research-items", input }), { flag: "wx", mode: 0o600 });
  await rename(`${request}.tmp`, request);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error("Pinned controller exited during qualification");
    try {
      const result = JSON.parse(await readFile(response, "utf8"));
      await rm(response);
      return { ...result, queries: [...queries] };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Pinned controller did not return the synthetic action before the deadline");
}

try {
  await startController();
  const result = await runResearchCases(execute);
  await stopController();
  await startController();
  const restarted = await execute(researchWindow, [[]]);
  assert.deepEqual(restarted.result, { items: [] });
  assert.equal(restarted.ok, true);
  assert.equal(await readFile("/runtime/configuration.json", "utf8"), config);
  assert.equal(await readFile("/runtime/local-api-key", "utf8"), "SYNTHETIC_LOCAL_KEY");
  assert.equal(await readFile("/runtime/local-api-bridge-token", "utf8"), "SYNTHETIC_BRIDGE_TOKEN");
  assert.equal(badRequests, 0);
  console.log(
    JSON.stringify({
      ...result,
      actualControllerMailbox: true,
      restart: true,
      metadataGets,
      unexpectedOrMutatingRequests: badRequests,
      realLibraryAcceptance: false
    })
  );
} finally {
  await stopController();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
