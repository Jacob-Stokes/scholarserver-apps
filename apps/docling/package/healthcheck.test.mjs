import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";
import { promisify } from "node:util";
import { parse } from "yaml";

const compose = parse(await readFile(new URL("./compose.yaml", import.meta.url), "utf8"));
const probe = compose.services.controller.healthcheck.test;
const run = promisify(execFile);

test("Docling's lightweight probe checks HTTP health, not just an open port", async (t) => {
  assert.deepEqual(probe.slice(0, 3), ["CMD", "python3", "-c"]);
  let status = 200;
  const server = createServer((request, response) => {
    assert.equal(request.url, "/health");
    response.writeHead(status);
    response.end('{"status":"ok"}');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const code = probe[3].replace("8080", String(server.address().port));
  await run("python3", ["-c", code], { timeout: 5000 });
  status = 503;
  await assert.rejects(run("python3", ["-c", code], { timeout: 5000 }));
  await new Promise((resolve) => server.close(resolve));
  await assert.rejects(run("python3", ["-c", code], { timeout: 5000 }));
});
