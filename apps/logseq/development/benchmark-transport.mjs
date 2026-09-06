import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { GraphRunner } from "/app/runner.mjs";

// Read-only engineering probe inside the disposable helper, not a production adapter.
// Worker invocation omits CLI discovery/validation/formatting, so this is a latency
// floor comparison, not proof of an equivalent replacement or a throughput benchmark.
const graph = process.env.LOGSEQ_GRAPH ?? "Research";
const runner = new GraphRunner({ graph });
const lockPath = `/graph/graphs/${graph}/db-worker.lock`;
const lock = JSON.parse(await readFile(lockPath, "utf8"));
const servers = (await readFile("/graph/server-list", "utf8")).trim().split("\n");
const port = servers.map((line) => line.split(" ")).find(([pid]) => Number(pid) === lock.pid)?.[1];
assert.match(port, /^\d+$/);
const base = `http://127.0.0.1:${port}`;
const health = await (await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(5000) })).json();
assert.equal(health.repo, `logseq_db_${graph}`);
const samples = { cli: [], workerHttp: [] };
for (let index = 0; index < 11; index++) {
  let started = performance.now();
  await runner.run(["list", "page", "--limit=20"]);
  if (index) samples.cli.push(Math.round(performance.now() - started));
  started = performance.now();
  const response = await fetch(`${base}/v1/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      method: "thread-api/cli-list-pages",
      argsTransit: JSON.stringify([health.repo, ["^ ", "~:limit", 20]])
    }),
    signal: AbortSignal.timeout(5000)
  });
  const result = await response.json();
  assert.ok(response.ok && result.ok);
  if (index) samples.workerHttp.push(Math.round(performance.now() - started));
}
assert.equal(JSON.parse(await readFile(lockPath, "utf8")).pid, lock.pid);
const desktop = await fetch(`${base}/api`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ method: "logseq.Editor.getAllPages", args: [] }),
  signal: AbortSignal.timeout(5000)
});
console.log(JSON.stringify({ milliseconds: samples, sameWorker: true, desktopApiStatus: desktop.status }));
