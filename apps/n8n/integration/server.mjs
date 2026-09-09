import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SetupError } from "./bootstrap-client.mjs";
import { AutomationConfigurationError, scheduleConfiguration, workflowScheduleHours } from "./configuration.mjs";
import { PasswordSetup } from "./password-setup.mjs";
import { N8nSetup } from "./setup.mjs";
import { startSetupActions } from "./setup-actions.mjs";
import { assertWorkflowUnchanged, readTemplate, WorkflowEditConflict } from "./templates.mjs";
import { WorkflowInstallations } from "./workflows.mjs";

const runtime = process.env.N8N_INTEGRATION_STATE ?? "/runtime";
const setup = new N8nSetup({ directory: runtime, baseUrl: "http://n8n:5678" });
const passwordSetup = new PasswordSetup({ directory: runtime, setup, baseUrl: "http://n8n:5678" });
await startSetupActions(runtime, passwordSetup);
const template = readTemplate(await readFile(new URL("../templates/connection-check.yaml", import.meta.url), "utf8"));
const ui = fileURLToPath(new URL("./ui/", import.meta.url));
// Keep a single journal owner across HTTP requests, even when the key is rotated.
const client = {
  async createWorkflow(workflow) {
    return (await requiredClient()).createWorkflow(workflow);
  },
  async listWorkflows(cursor) {
    return (await requiredClient()).listWorkflows(cursor);
  },
  async getWorkflow(id) {
    return (await requiredClient()).getWorkflow(id);
  }
};
const installations = new WorkflowInstallations({
  statePath: path.join(runtime, "installations.json"),
  client,
  templates: [template]
});

async function requiredClient() {
  const connected = await setup.client();
  if (!connected) throw new Error("Connect n8n first");
  return connected;
}

function json(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

async function body(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 16384) throw new Error("Request exceeds limit");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  try {
    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { healthy: true });
    if (url.pathname.startsWith("/api/")) {
      if (
        request.method !== "GET" &&
        (request.headers["x-requested-with"] !== "ScholarServer" ||
          request.headers["content-type"] !== "application/json")
      ) {
        return json(response, 403, { error: "Use the application setup form" });
      }
      if (request.method === "GET" && url.pathname === "/api/status")
        return json(response, 200, await passwordSetup.status());
      if (request.method === "GET" && url.pathname === "/api/automations") {
        const state = await installations.read();
        const inventory = await (await requiredClient()).listWorkflows();
        return json(response, 200, {
          templates: [
            {
              id: template.id,
              name: template.name,
              description: template.description,
              schedule: scheduleConfiguration(template)
            }
          ],
          installations: state.installations,
          workflows: inventory.data.map((workflow) => ({
            id: workflow.id,
            name: workflow.name,
            active: workflow.active,
            hoursInterval:
              workflow.id === state.installations[template.id]?.workflowId
                ? workflowScheduleHours(template, workflow)
                : null
          })),
          moreAvailable: Boolean(inventory.nextCursor)
        });
      }
      if (request.method === "POST" && url.pathname === "/api/install") {
        const input = await body(request);
        await requiredClient();
        return json(
          response,
          200,
          await installations.install(input.templateId, input.settings, input.retryOperationId)
        );
      }
      if (request.method === "POST" && url.pathname === "/api/reconcile") {
        const input = await body(request);
        return json(response, 200, await installations.reconcile(input.templateId));
      }
      if (request.method === "POST" && url.pathname === "/api/enabled") {
        const input = await body(request);
        if (typeof input.enabled !== "boolean")
          return json(response, 400, { error: "Choose whether to enable the schedule" });
        const receipt = (await installations.read()).installations[input.templateId];
        if (receipt?.state !== "installed")
          return json(response, 409, { error: "Resolve the installation before changing its schedule" });
        const upstream = await requiredClient();
        let versionId;
        if (input.enabled) {
          const workflow = await upstream.getWorkflow(receipt.workflowId);
          assertWorkflowUnchanged(workflow, receipt.fingerprint);
          versionId = workflow.versionId;
          if (typeof versionId !== "string" || !versionId) throw new Error("Cannot verify the workflow version");
        }
        // Publish the version we inspected, not a newer draft edited concurrently.
        await upstream.setEnabled(receipt.workflowId, input.enabled, versionId);
        return json(response, 200, { enabled: (await upstream.getWorkflow(receipt.workflowId)).active });
      }
      if (request.method === "GET" && url.pathname === "/api/runs") {
        const receipt = (await installations.read()).installations[url.searchParams.get("templateId")];
        if (receipt?.state !== "installed") return json(response, 409, { error: "Automation is not installed" });
        const result = await (await requiredClient()).listExecutions(receipt.workflowId);
        return json(response, 200, {
          runs: result.data.map((run) => ({
            id: run.id,
            status: run.status,
            startedAt: run.startedAt,
            stoppedAt: run.stoppedAt
          }))
        });
      }
      return json(response, 404, { error: "Not found" });
    }
    if (request.method !== "GET") return json(response, 405, { error: "Method not allowed" });
    const asset = url.pathname.match(/\/assets\/([a-zA-Z0-9_.-]+)$/);
    const target = asset ? path.join(ui, "assets", asset[1]) : path.join(ui, "index.html");
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };
    let content;
    try {
      content = await readFile(target);
    } catch (error) {
      if (error.code === "ENOENT") return json(response, 404, { error: "Not found" });
      throw error;
    }
    response.writeHead(200, {
      "content-type": types[path.extname(target)] ?? "application/octet-stream",
      "x-content-type-options": "nosniff"
    });
    response.end(content);
  } catch (error) {
    // No upstream message, body or submitted credential may enter the response.
    if (response.headersSent) return response.end();
    if (error instanceof AutomationConfigurationError) return json(response, 400, { error: error.message });
    if (error instanceof SetupError) return json(response, 409, { error: error.message });
    if (error instanceof WorkflowEditConflict) return json(response, 409, { error: error.message });
    const unconfirmed = error.outcome === "unconfirmed";
    json(response, 502, {
      error: unconfirmed
        ? "The result is unconfirmed. Refresh status before making another change."
        : "Could not complete the request. Check the n8n connection and current status.",
      unconfirmed
    });
  }
}).listen(8080, "0.0.0.0");
