// Operator-only acceptance. Run in the isolated rootless CI toolchain container
// with the test directory mounted at the same absolute path on host and runner.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = process.env.N8N_UPDATE_TEST_ROOT;
assert.match(root ?? "", /^\/home\/scholar-ci\/n8n-update-[a-zA-Z0-9]+$/);
const binary = path.join(root, "executor");
const state = path.join(root, "state");
const socket = path.join(root, "run", "executor.sock");
assert.ok(!existsSync(state), "Use a fresh disposable state directory");

function docker(args, input) {
  try {
    return execFileSync("docker", args, {
      input,
      encoding: "utf8",
      timeout: 180000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch {
    throw new Error(`Isolated Docker ${args[0]} failed; output withheld to protect credentials`);
  }
}
const securityOptions = docker(["info", "--format", "{{json .SecurityOptions}}"]);
assert.match(securityOptions, /name=rootless/);
const architecture = docker(["info", "--format", "{{.Architecture}}"]);
assert.equal(architecture, "x86_64");
mkdirSync(path.dirname(socket), { recursive: true });
const networkNames = docker(["network", "ls", "--format", "{{.Name}}"]).split("\n");
const edgeExisted = networkNames.includes("scholarserver-edge");
if (!edgeExisted) {
  docker(["network", "create", "--internal", "scholarserver-edge"]);
}
const executor = spawn(
  binary,
  [
    "--state-root",
    state,
    "--catalog-root",
    path.join(root, "catalog"),
    "--socket",
    socket,
    "--readiness-timeout",
    "3m",
    "--rollback-timeout",
    "3m"
  ],
  {
    stdio: ["ignore", "ignore", "pipe"]
  }
);
// Executor logs are deliberately not echoed: failures are reported by phase.
executor.stderr.resume();
let appliedPlan;
let revision = 0;
let version = "0.1.0-beta.2";

async function request(route, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: socket,
        path: route,
        method: "POST",
        headers: { "content-type": "application/json" },
        timeout: 600000
      },
      (response) => {
        let text = "";
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          if (response.statusCode !== 200) {
            reject(new Error(`${route} returned HTTP ${response.statusCode}: ${text}`));
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new Error(`${route} returned invalid JSON`));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Executor request timed out")));
    req.end(JSON.stringify(body));
  });
}

async function apply(enabled = true) {
  revision += 1;
  const desired = {
    schemaVersion: 1,
    revision,
    instanceId: "n8n",
    workspaceId: "upgrade-test",
    package: { id: "org.scholarserver.n8n", version },
    state: enabled ? "enabled" : "removed",
    architecture: "amd64",
    settings: {}
  };
  appliedPlan = await request("/v1/instances/plan", desired);
  const result = await request("/v1/instances/apply", desired);
  appliedPlan = result.plan;
}

function container(service) {
  const id = docker([
    "ps",
    "-q",
    "--filter",
    `label=com.docker.compose.project=${appliedPlan.projectName}`,
    "--filter",
    `label=com.docker.compose.service=${service}`
  ]);
  assert.match(id, /^[a-f0-9]+$/);
  return id;
}

function integrationCheck(phase) {
  const scriptPath = new URL("./integration/check-upgrade-state.mjs", import.meta.url);
  const script = readFileSync(scriptPath, "utf8");
  const integrationContainer = container("integration");
  const argumentsForCheck = [
    "exec",
    "-i",
    "-w",
    "/app/integration",
    integrationContainer,
    "node",
    "--input-type=module",
    "-",
    phase
  ];
  const output = docker(argumentsForCheck, script);
  return JSON.parse(output);
}

function verify() {
  for (const directory of Object.values(appliedPlan.dataBindings)) {
    const metadata = statSync(directory);
    assert.equal(metadata.uid, 1000, "Managed data must retain the app's non-root UID");
    assert.equal(metadata.gid, 1000, "Managed data must retain the app's non-root GID");
    assert.equal(metadata.mode & 0o777, 0o700);
  }
  const saved = integrationCheck("verify");
  const workflowId = saved.workflowId;
  assert.match(workflowId, /^[a-zA-Z0-9-]+$/);
  const runtime = container("n8n");
  docker([
    "exec",
    runtime,
    "n8n",
    "export:credentials",
    "--all",
    "--decrypted",
    "--output=/tmp/upgrade-credentials.json"
  ]);
  const credentials = JSON.parse(docker(["exec", runtime, "cat", "/tmp/upgrade-credentials.json"]));
  const credential = credentials.find((item) => item.id === saved.credentialId);
  assert.equal(credential?.data.value, "synthetic-upgrade-only");
  docker(["exec", runtime, "rm", "/tmp/upgrade-credentials.json"]);
  const output = docker([
    "exec",
    "-e",
    "N8N_RUNNERS_BROKER_PORT=5680",
    runtime,
    "n8n",
    "execute",
    `--id=${workflowId}`
  ]);
  const divider = output.indexOf("====================================");
  assert.ok(divider >= 0);
  const result = JSON.parse(output.slice(output.indexOf("{", divider)));
  assert.equal(result.status, "success");
  console.log("Workflow identity, execution, saved API connection and credential decryption passed.");
}

try {
  for (let attempt = 0; !existsSync(socket); attempt++) {
    assert.ok(attempt < 100 && executor.exitCode === null, "Executor did not start");
    await delay(100);
  }
  await apply();
  console.log("Installed exact beta.2 package through executor.");
  await request("/v1/instances/upgrade-test/n8n/actions/setup", {
    password: `Check9${randomBytes(24).toString("hex")}`
  });
  integrationCheck("seed");
  verify();
  version = "0.1.0-beta.4";
  await apply();
  console.log("Updated exact beta.2 to beta.4 through the backup-bound executor transaction.");
  verify();
  const journal = JSON.parse(readFileSync(path.join(state, "recovery", "platform-transaction.json"), "utf8"));
  assert.equal(journal.done, true);
  console.log("n8n package update acceptance passed; upstream n8n version remains 2.38.1.");
} finally {
  try {
    if (appliedPlan) {
      await apply(false);
    }
  } finally {
    executor.kill("SIGTERM");
    if (!edgeExisted) {
      docker(["network", "rm", "scholarserver-edge"]);
    }
  }
}
