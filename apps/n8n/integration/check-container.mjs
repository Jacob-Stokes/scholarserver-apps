import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { readTemplate, workflowFromTemplate } from "./templates.mjs";

// Deliberately restricted to the disposable test container, never the user's trial.
const container = "scholarserver-n8n-package-check-20260909";
function remote(command, input) {
  const result = spawnSync("ssh", ["freelove", command], {
    input,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`Container check failed: ${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

const source = await readFile(new URL("../templates/connection-check.yaml", import.meta.url), "utf8");
const workflow = { ...workflowFromTemplate(readTemplate(source)), id: "scholarserverConnectionCheck", active: false };
remote(
  `sudo -n docker exec -i ${container} node -e 'let input=""; process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => require("node:fs").writeFileSync("/tmp/connection-check.json", input, {mode:384}));'`,
  JSON.stringify([workflow])
);
remote(`sudo -n docker exec ${container} n8n import:workflow --input=/tmp/connection-check.json`);
// The running server owns its runner port; the separate CLI process needs its own.
const output = remote(
  `sudo -n docker exec -e N8N_RUNNERS_BROKER_PORT=5680 ${container} n8n execute --id=scholarserverConnectionCheck`
);
assert.match(output, /Automation execution is working/);
console.log("Native n8n imported and executed the packaged YAML test workflow.");
