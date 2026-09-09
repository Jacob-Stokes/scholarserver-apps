import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const [container, workflowId] = process.argv.slice(2);
assert.match(container ?? "", /^scholarserver-n8n-ci-\d+-app$/);
assert.match(workflowId ?? "", /^[a-zA-Z0-9-]+$/);
// CLI output contains complete execution data. Inspect it only in memory and
// print the result, not workflow payloads or n8n's internal resume token.
const output = execFileSync(
  "docker",
  ["exec", "-e", "N8N_RUNNERS_BROKER_PORT=5680", container, "n8n", "execute", `--id=${workflowId}`],
  { encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }
);
const divider = output.indexOf("====================================");
assert.ok(divider >= 0, "n8n must return its execution result");
const execution = JSON.parse(output.slice(output.indexOf("{", divider)));
assert.equal(execution.status, "success");
assert.equal(execution.finished, true);
console.log(`Native workflow ${workflowId} completed successfully.`);
