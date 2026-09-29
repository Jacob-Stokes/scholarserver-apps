// Loopback-only, synthetic app workspace preview. No requests leave this server.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readCatalog } from "../apps/n8n/integration/catalog.mjs";
import { scheduleConfiguration } from "../apps/n8n/integration/configuration.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const apps = ["obsidian", "logseq", "freshrss", "zotero", "docling", "n8n"];
const scenarios = [
  "ready",
  "online",
  "setup",
  "denied",
  "failed-read",
  "failed-write",
  "missing-defaults",
  "missing-permission"
];
const escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

export async function createAppWorkspacePreview(port = 0) {
  const templates = (await readCatalog(new URL("../apps/n8n/templates/", import.meta.url))).map((template) => ({
    ...template,
    schedule: scheduleConfiguration(template)
  }));
  const state = { scenario: "ready", calls: [], installations: {}, jobs: [] };
  const readingTemplate = templates.find((template) => template.research === "reading-notes");
  if (!readingTemplate) throw new Error("Reading-notes fixture requires the packaged template.");
  const workspaceRoutes = {
    zotero: "/apps/zotero/attachments",
    docling: "/apps/docling/process",
    n8n: `/apps/n8n/automation-setup?managerSetup=1&templateId=${encodeURIComponent(readingTemplate.id)}`
  };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const path = url.pathname;
    const json = (value, status = 200) =>
      response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
    const html = (body) =>
      response
        .writeHead(200, { "content-type": "text/html", "cache-control": "no-store" })
        .end(
          `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>App workspace preview</title></head><body><main>${body}</main></body></html>`
        );
    try {
      if (path === "/") {
        return html(`<h1>App workspace preview</h1><p>Synthetic data only. Manager destinations are navigation placeholders.</p>
          <h2>Configuration bookmarks</h2><ul>${apps.map((app) => `<li><a href="/apps/${app}/configuration">${app} Configuration</a> · <a href="/apps/${app}/overview">Overview</a></li>`).join("")}</ul>
          <h2>Retained workspaces</h2>${scenarios
            .map(
              (scenario) =>
                `<h3>${scenario}</h3><ul>${Object.entries(workspaceRoutes)
                  .map(
                    ([app]) =>
                      `<li><a href="/__preview/open?app=${app}&scenario=${scenario}">${app} ${scenario}</a></li>`
                  )
                  .join("")}</ul>`
            )
            .join("")}`);
      }
      if (path === "/__preview/open") {
        const target = workspaceRoutes[url.searchParams.get("app")];
        const scenario = url.searchParams.get("scenario");
        if (!target || !scenarios.includes(scenario)) return json({ error: "Unknown fixture" }, 404);
        state.scenario = scenario;
        state.installations = {};
        state.jobs = [];
        return response.writeHead(303, { location: target }).end();
      }
      if (path === "/__preview/requests") return json(state.calls);
      if (path === "/applications" || path.startsWith("/applications/manage/") || path.startsWith("/automations")) {
        return html(
          `<h1>Manager navigation target</h1><p>${escapeHtml(path + url.search)}</p><a href="/">Back to fixtures</a>`
        );
      }
      const match = /^\/apps\/([a-z0-9-]+)(?:\/(.*))?$/.exec(path);
      const app = match?.[1]?.replace(/-two$/, "");
      const route = match?.[2] ?? "";
      if (path.startsWith("/api/") || route.startsWith("api/")) {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of request) {
          bytes += chunk.length;
          if (bytes > 65536) return json({ error: "Fixture body too large" }, 413);
          chunks.push(chunk);
        }
        const input = bytes ? JSON.parse(Buffer.concat(chunks).toString()) : null;
        state.calls.push({ path, method: request.method, input });
        if (state.scenario === "denied") return json({ error: "Synthetic access denied" }, 401);
        if (state.scenario === "failed-read" && request.method === "GET")
          return json({ error: "Synthetic read failure" }, 503);
        if (state.scenario === "failed-write" && request.method !== "GET")
          return json({ error: "Synthetic write failure" }, 503);
        if (path === "/api/v1/catalog") return json({ applications: [] });
        if (app === "zotero") {
          if (route === "api/status")
            return json({
              state: state.scenario === "setup" ? "account-required" : "ready",
              connectionMode: state.scenario === "online" ? "online-library" : "complete-workspace",
              lastError: null,
              features: { desktop: true, automations: true, localAttachments: true }
            });
          if (request.method === "POST" && ["api/attachments/resolve", "api/attachments/match"].includes(route)) {
            return json({
              attachmentKey: input.attachmentKey ?? "ABCD1234",
              available: true,
              relativePath: "Papers/synthetic.pdf"
            });
          }
        }
        if (app === "docling") {
          if (route === "api/status")
            return json({
              state: "ready",
              engine: "available",
              workerConcurrency: 1,
              counts: { queued: state.jobs.length, running: 0, failed: 0, succeeded: 0 },
              jobs: state.jobs,
              outputFolder: "output",
              updatedAt: "2026-09-29T12:00:00Z"
            });
          if (route === "api/settings" && request.method === "GET") {
            if (state.scenario === "missing-defaults") return json({ error: "Synthetic defaults unavailable" }, 503);
            return json({ defaultOcr: true });
          }
          if (route === "api/files") return json({ files: [{ path: "Papers/synthetic.pdf", bytes: 1024 }] });
          if (route === "api/jobs" && request.method === "POST") {
            const job = {
              id: `synthetic-${state.jobs.length + 1}`,
              ...input,
              state: "queued",
              attempts: 0,
              createdAt: "2026-09-29T12:00:00Z",
              updatedAt: "2026-09-29T12:00:00Z",
              outputPath: null
            };
            state.jobs.push(job);
            return json(job);
          }
          if (route === "api/jobs/backfill" && request.method === "POST")
            return json({ discovered: 1, queued: 1, existing: 0 });
        }
        if (app === "n8n") {
          if (route === "api/status")
            return json({
              connected: state.scenario !== "setup",
              phase: state.scenario === "setup" ? "recovery-required" : "ready"
            });
          if (route === "api/automations")
            return json({ templates, installations: state.installations, workflows: [], moreAvailable: false });
          if (route === "api/research-applications") {
            if (state.scenario === "missing-permission") return json({ code: "research_connection_required" }, 409);
            const required = new Map();
            for (const template of templates)
              for (const requirement of template.requirements ?? []) {
                const actions = required.get(requirement.packageId) ?? new Set();
                for (const action of requirement.actions) actions.add(action);
                required.set(requirement.packageId, actions);
              }
            return json(
              [...required].map(([packageId, actions]) => ({
                id: packageId.split(".").at(-1),
                workspaceId: "personal",
                packageId,
                actions: [...actions]
              }))
            );
          }
          if (route === "api/install" && request.method === "POST") {
            const receipt = { ...input, state: "installed", workflowId: "synthetic", operationId: "synthetic" };
            state.installations[input.automationId] = receipt;
            return json(receipt);
          }
        }
        return json({ error: "Unexpected synthetic API request" }, 404);
      }
      if (!apps.includes(app)) return json({ error: "Unknown preview route" }, 404);
      const asset = /^assets\/([\w.-]+)$/.exec(route)?.[1];
      if (route.startsWith("assets/") && !asset) return json({ error: "Invalid asset path" }, 404);
      const file = join(root, "apps", app, "ui", "dist", asset ? `assets/${asset}` : "index.html");
      const content = await readFile(file);
      let type = "text/html";
      if (asset?.endsWith(".js")) type = "text/javascript";
      else if (asset?.endsWith(".css")) type = "text/css";
      else if (asset?.endsWith(".woff2")) type = "font/woff2";
      else if (asset?.endsWith(".woff")) type = "font/woff";
      response.writeHead(200, { "content-type": type }).end(content);
    } catch (error) {
      json(
        {
          error:
            error.code === "ENOENT" ? "Build the application UI before previewing it." : "Invalid synthetic request"
        },
        400
      );
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    state,
    workspaceRoutes,
    templates,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const preview = await createAppWorkspacePreview(Number(process.env.PORT ?? 5188));
  console.log(`Synthetic workspace preview: ${preview.origin}`);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await preview.close();
      process.exit(0);
    });
}
