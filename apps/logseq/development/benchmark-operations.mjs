import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { HttpOperations } from "/app/http-operations.mjs";
import { graphCommand } from "/app/operations.mjs";
import { GraphRunner } from "/app/runner.mjs";
import { WorkerHttp } from "/app/worker-http.mjs";

// Run inside the disposable helper. Both paths use the same worker and graph.
const graph = process.env.LOGSEQ_GRAPH ?? "Research";
const runner = new GraphRunner({ graph });
const { servers } = await runner.run(["server", "list"]);
const endpoint = servers.find((entry) => entry.graph === graph);
const http = new HttpOperations({ graph, worker: new WorkerHttp({ endpoint, graph, root: "/graph" }) });
const page = `ScholarServer speed proof ${Date.now()}`;
await http.execute("create-page", { page });
const {
  result: [id]
} = await http.execute("append-block", { page, content: "Synthetic timed block" });
const {
  result: [taskId]
} = await http.execute("create-task", { page, content: "Synthetic timed task" });
const samples = 20;
const definitions = [
  ["list-pages", { limit: 20 }, (x) => x.items.map((item) => item["db/id"])],
  ["read-page", { page }, (x) => x.root["block/children"].map((item) => [item["db/id"], item["block/title"]])],
  ["search-blocks", { query: "Synthetic timed block" }, (x) => x.items.map((item) => item["db/id"])],
  ["update-block", { id, content: "Synthetic timed block edited αβγ" }, (x) => x.result],
  ["append-block", { page, content: "Synthetic timed append αβγ" }, (x) => x.result.length],
  ["set-task-status", { id: taskId, status: "logseq.property/status.done" }, (x) => x.result]
];
const results = [];
function stats(values) {
  values.sort((a, b) => a - b);
  return { medianMs: +((values[9] + values[10]) / 2).toFixed(2), p95Ms: +values[18].toFixed(2) };
}
for (const [operation, input, normalize] of definitions) {
  const cli = () => runner.run(graphCommand(operation, input));
  const direct = () => http.execute(operation, input);
  assert.deepEqual(normalize(await direct()), normalize(await cli()), `${operation} semantic equivalence`);
  const timings = { cli: [], http: [] };
  for (let index = 0; index < samples; index++) {
    for (const name of index % 2 ? ["http", "cli"] : ["cli", "http"]) {
      const start = performance.now();
      await (name === "cli" ? cli() : direct());
      timings[name].push(performance.now() - start);
    }
  }
  const old = stats(timings.cli),
    current = stats(timings.http);
  results.push({
    operation,
    samplesPerPath: samples,
    cli: old,
    http: current,
    medianSpeedup: +(old.medianMs / current.medianMs).toFixed(1)
  });
}
const persisted = (await http.execute("read-page", { page })).root["block/children"];
assert.equal(persisted.find((item) => item["db/id"] === id)["block/title"], "Synthetic timed block edited αβγ");
assert.equal(
  persisted.find((item) => item["db/id"] === taskId)["logseq.property/status"]["db/ident"],
  "logseq.property/status.done"
);
assert.equal(persisted.filter((item) => item["block/title"] === "Synthetic timed append αβγ").length, 2 + samples * 2);
assert.equal((await runner.run(["server", "list"])).servers.find((entry) => entry.graph === graph).pid, endpoint.pid);
console.log(JSON.stringify({ graph, workerPidUnchanged: true, results }, null, 2));
