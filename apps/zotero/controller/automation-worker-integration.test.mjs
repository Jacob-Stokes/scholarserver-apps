import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createAutomationConfiguration } from "./automation-configuration.mjs";

async function waitFor(check) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {}
    await delay(25);
  }
  throw new Error("The disposable processing worker did not reach the expected state.");
}

test("native configuration saves through the real worker and retains settings and one run after restart", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "zotero-processing-worker-"));
  await mkdir(path.join(root, "linked", "Papers"), { recursive: true });
  let discoveryCalls = 0;
  const manager = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/v1/overview" && request.method === "GET") {
      response.end(
        JSON.stringify({
          instances: [
            {
              workspaceId: "fixture",
              id: "docling-fixture",
              packageId: "org.scholarserver.docling",
              desiredState: "enabled",
              observedState: "healthy"
            }
          ]
        })
      );
    } else if (
      request.url === "/api/v1/instances/fixture/docling-fixture/actions/discover" &&
      request.method === "POST"
    ) {
      discoveryCalls++;
      request.resume();
      response.end(JSON.stringify({ files: [] }));
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: "No real app or data is connected to this fixture." }));
    }
  });
  await new Promise((resolve) => manager.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${manager.address().port}`;
  const portReservation = createServer();
  await new Promise((resolve) => portReservation.listen(0, "127.0.0.1", resolve));
  const port = portReservation.address().port;
  await new Promise((resolve) => portReservation.close(resolve));
  const workerUrl = `http://127.0.0.1:${port}`;
  let worker;
  async function stop() {
    if (!worker || worker.exitCode !== null || worker.signalCode !== null) return;
    const exited = once(worker, "exit");
    worker.kill("SIGTERM");
    await exited;
  }
  context.after(async () => {
    await stop();
    manager.closeAllConnections();
    await new Promise((resolve) => manager.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  async function start() {
    worker = spawn(process.execPath, [fileURLToPath(new URL("../automations/worker.mjs", import.meta.url))], {
      env: {
        ...process.env,
        SCHOLARSERVER_AUTOMATION_PORT: String(port),
        SCHOLARSERVER_AUTOMATION_STATE: path.join(root, "state"),
        SCHOLARSERVER_LINKED_ROOT: path.join(root, "linked"),
        SCHOLARSERVER_MANAGER_URL: origin,
        SCHOLARSERVER_ZOTERO_URL: origin,
        SCHOLARSERVER_WORKSPACE_ID: "fixture"
      },
      stdio: "ignore"
    });
    await waitFor(async () => (await fetch(`${workerUrl}/health`)).ok);
  }
  await start();
  const options = { directory: path.join(root, "receipts"), baseUrl: `${workerUrl}/v1` };
  let api = createAutomationConfiguration(options);
  const fresh = await api.section({ editSettings: true });
  assert.deepEqual(fresh.actions, []);
  assert.match(fresh.description, /Automations/);
  // Seed saved settings only in this disposable worker to exercise previous installations.
  const seed = await fetch(`${workerUrl}/v1/automations/convert-zotero-pdfs`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      active: false,
      enabled: false,
      intervalMinutes: 60,
      configuration: { folder: "Papers", limit: 3, ocr: false, attachMarkdown: true }
    })
  });
  assert.equal(seed.status, 200);
  const initial = await api.section({ editSettings: true });
  const folderField = initial.fields.find((field) => field.id === "folder");
  assert.deepEqual(
    folderField.options.map((option) => option.value),
    ["Papers", "/"]
  );
  const saved = await api.run("save-automation", {
    requestId: "worker-save-processing-0001",
    expectedRevision: initial.revision,
    values: {
      editSettings: true,
      active: true,
      enabled: false,
      folder: "Papers",
      limit: 2,
      ocr: true,
      attachMarkdown: false
    }
  });
  assert.equal(saved.status, "succeeded");
  const beforeRun = await api.section();
  const runInput = { requestId: "worker-run-processing-0001", expectedRevision: beforeRun.revision, values: {} };
  assert.equal((await api.run("run-automation", runInput)).status, "succeeded");
  const readState = async () =>
    JSON.parse(await readFile(path.join(root, "state", "automations.json"), "utf8")).automations["convert-zotero-pdfs"];
  await waitFor(async () => (await readState()).runs[0]?.state === "succeeded");
  await stop();
  await start();
  api = createAutomationConfiguration(options);
  assert.equal((await api.run("run-automation", runInput)).status, "succeeded");
  const current = await readState();
  assert.deepEqual(current.configuration, { folder: "Papers", limit: 2, ocr: true, attachMarkdown: false });
  assert.equal(current.enabled, false);
  assert.equal(current.runs.length, 1);
  assert.equal(discoveryCalls, 1);
  const history = await api.section({ showHistory: true });
  assert.ok(history.summary.some((item) => item.label === "Run result" && item.value === "succeeded"));
});
