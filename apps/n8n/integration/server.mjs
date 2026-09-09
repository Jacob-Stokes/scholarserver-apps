import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SetupError } from "./bootstrap-client.mjs";
import { readCatalog } from "./catalog.mjs";
import { AutomationConfigurationError, scheduleConfiguration, workflowScheduleHours } from "./configuration.mjs";
import { ManagerConnection } from "./manager-connection.mjs";
import { PasswordSetup } from "./password-setup.mjs";
import { ResearchAccess } from "./research-access.mjs";
import { ResearchBridge } from "./research-bridge.mjs";
import { N8nSetup } from "./setup.mjs";
import { startSetupActions } from "./setup-actions.mjs";
import { assertWorkflowUnchanged, WorkflowEditConflict } from "./templates.mjs";
import { WorkflowInstallations } from "./workflows.mjs";

const runtime = process.env.N8N_INTEGRATION_STATE ?? "/runtime";
const setup = new N8nSetup({ directory: runtime, baseUrl: "http://n8n:5678" });
const passwordSetup = new PasswordSetup({ directory: runtime, setup, baseUrl: "http://n8n:5678" });
const managerConnection = new ManagerConnection(runtime);
await startSetupActions(runtime, passwordSetup, managerConnection);
const templates = await readCatalog(new URL("../templates/", import.meta.url));
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
  },
  async createCredential(credential) {
    return (await requiredClient()).createCredential(credential);
  }
};
const researchAccess = new ResearchAccess({ directory: path.join(runtime, "research-access"), client });
const researchBridge = new ResearchBridge({ managerConnection });
const installations = new WorkflowInstallations({
  statePath: path.join(runtime, "installations.json"),
  client,
  templates,
  validateResearch: (scope) => researchBridge.validateScope(scope),
  async prepareResearch(workflow, receipt, scope) {
    const grant = await researchAccess.provision(receipt.operationId, scope);
    for (const node of workflow.nodes) {
      if (node.type !== "n8n-nodes-base.httpRequest") continue;
      if (!node.parameters.url.startsWith("http://integration:8081/research/")) {
        throw new Error("Research templates may only call the local research connection");
      }
      node.credentials = { httpHeaderAuth: grant.credential };
    }
  }
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
    if (length > 300000) throw new Error("Request exceeds limit");
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
        for (const template of templates.filter((candidate) => candidate.research)) {
          const receipt = state.installations[template.id];
          if (!receipt) continue;
          try {
            receipt.researchAccess = (await researchAccess.read(receipt.operationId)).state;
          } catch {
            receipt.researchAccess = "unavailable";
          }
        }
        const inventory = await (await requiredClient()).listWorkflows();
        return json(response, 200, {
          templates: templates.map((template) => ({
            id: template.id,
            name: template.name,
            description: template.description,
            research: template.research ?? null,
            schedule: scheduleConfiguration(template)
          })),
          installations: state.installations,
          workflows: inventory.data.map((workflow) => ({
            id: workflow.id,
            name: workflow.name,
            active: workflow.active,
            hoursInterval: installedSchedule(workflow, state.installations)
          })),
          moreAvailable: Boolean(inventory.nextCursor)
        });
      }
      if (request.method === "GET" && url.pathname === "/api/research-applications") {
        return json(response, 200, await researchBridge.applications());
      }
      if (request.method === "POST" && url.pathname === "/api/revoke-research") {
        const input = await body(request);
        const receipt = (await installations.read()).installations[input.templateId];
        if (!receipt) return json(response, 404, { error: "Automation is not installed" });
        await researchAccess.revoke(receipt.operationId);
        return json(response, 200, { revoked: true });
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
          const template = templates.find((candidate) => candidate.id === input.templateId);
          if (template?.research && (await researchAccess.read(receipt.operationId)).state !== "ready") {
            return json(response, 409, {
              error: "Research access is disconnected. Review the connection before enabling this workflow."
            });
          }
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

function installedSchedule(workflow, receipts) {
  const template = templates.find((candidate) => receipts[candidate.id]?.workflowId === workflow.id);
  return template ? workflowScheduleHours(template, workflow) : null;
}

// Not an app-UI route: Manager does not forward workflow bearer credentials.
// This listener has no host port or catalog endpoint and authorizes every call.
createServer(async (request, response) => {
  try {
    const scope = await researchAccess.authorize(request.headers["x-scholarserver-workflow"]);
    const url = new URL(request.url, "http://localhost");
    const match = url.pathname.match(/^\/research\/([a-z-]+)$/);
    if (request.method !== "POST" || !match || request.headers["content-type"] !== "application/json") {
      return json(response, 404, { error: "Research operation not found" });
    }
    return json(response, 200, await researchBridge.execute(scope, match[1], await body(request)));
  } catch {
    return json(response, 403, {
      error: "Research operation refused or unavailable. Check the connection, selected apps and folder."
    });
  }
}).listen(8081, "0.0.0.0");
