import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const [container, workflowId, expected = "success"] = process.argv.slice(2);
assert.ok(["success", "denied"].includes(expected));
assert.match(container ?? "", /^scholarserver-n8n-ci-\d+-app$/);
assert.match(workflowId ?? "", /^[a-zA-Z0-9-]+$/);
// CLI output contains complete execution data. Inspect it only in memory and
// print the result, not workflow payloads or n8n's internal resume token.
let output;
try {
  output = execFileSync(
    "docker",
    ["exec", "-e", "N8N_RUNNERS_BROKER_PORT=5680", container, "n8n", "execute", `--id=${workflowId}`],
    { encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }
  );
} catch (error) {
  if (expected !== "denied") throw new Error("Native workflow execution failed; raw output withheld");
  const text = String(error.stdout ?? "");
  assert.match(text, /Research operation refused or unavailable/);
  console.log(`Native workflow ${workflowId} rejected missing app grants.`);
  process.exit(0);
}
const divider = output.indexOf("====================================");
assert.ok(divider >= 0, "n8n must return its execution result");
const execution = JSON.parse(output.slice(output.indexOf("{", divider)));
if (expected === "denied") {
  assert.equal(execution.status, "error");
  assert.match(JSON.stringify(execution), /Research operation refused or unavailable/);
  console.log(`Native workflow ${workflowId} rejected missing app grants.`);
} else {
  assert.equal(execution.status, "success");
  assert.equal(execution.finished, true);
  console.log(`Native workflow ${workflowId} completed successfully.`);
}
