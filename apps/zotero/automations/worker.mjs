import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { lstat, mkdir, readFile, readdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const stateRoot = process.env.SCHOLARSERVER_AUTOMATION_STATE ?? "/state";
const linkedRoot = process.env.SCHOLARSERVER_LINKED_ROOT ?? "/linked";
const managerUrl = process.env.SCHOLARSERVER_MANAGER_URL ?? "http://manager:8080";
const zoteroUrl = process.env.SCHOLARSERVER_ZOTERO_URL ?? "http://desktop:8080";
const workspaceId = process.env.SCHOLARSERVER_WORKSPACE_ID ?? "personal";
const port = Number(process.env.SCHOLARSERVER_AUTOMATION_PORT ?? 8081);
const statePath = path.join(stateRoot, "automations.json");
let stateMutation = Promise.resolve();

const definition = Object.freeze({
  id: "convert-zotero-pdfs",
  name: "Convert Zotero PDFs",
  description: "Convert PDFs from Zotero's shared attachment folder to Markdown with Docling, then attach the result to the matching Zotero item.",
  requires: ["org.scholarserver.docling"],
  defaults: { folder: "", limit: 3, ocr: false, attachMarkdown: true },
  scheduling: { defaultIntervalMinutes: 60, minimumIntervalMinutes: 15 }
});

function initialState() {
  return {
    schemaVersion: 1,
    automations: {
      [definition.id]: {
        enabled: false,
        intervalMinutes: definition.scheduling.defaultIntervalMinutes,
        configuration: { ...definition.defaults },
        updatedAt: new Date(0).toISOString(),
        runs: []
      }
    }
  };
}

async function atomicJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, filePath);
}

async function loadState() {
  try {
    const value = JSON.parse(await readFile(statePath, "utf8"));
    if (value?.schemaVersion === 1 && value.automations?.[definition.id]) return value;
  } catch {}
  const value = initialState();
  await atomicJson(statePath, value);
  return value;
}

async function mutateState(mutator) {
  const operation = stateMutation.then(async () => {
    const state = await loadState();
    const result = await mutator(state);
    await atomicJson(statePath, state);
    return result;
  });
  stateMutation = operation.catch(() => undefined);
  return operation;
}

function cleanRelativePath(value) {
  const normalized = typeof value === "string" ? value.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "") : "";
  const parts = normalized ? normalized.split("/") : [];
  if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith("."))) {
    throw new Error("The folder must stay inside shared storage and cannot include hidden folders");
  }
  if (normalized.length > 512 || /[\0\r\n]/.test(normalized)) throw new Error("The folder path is invalid");
  return normalized;
}

async function rootPath() {
  return realpath(linkedRoot);
}

export async function browseFolders(value = "") {
  const relative = cleanRelativePath(value);
  const root = await rootPath();
  let current = root;
  for (const part of relative ? relative.split("/") : []) {
    current = path.join(current, part);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("The selected folder is unavailable");
  }
  const resolved = await realpath(current);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("The selected folder leaves shared storage");
  const entries = await readdir(resolved, { withFileTypes: true });
  const folders = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }))) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const child = path.join(resolved, entry.name);
    if ((await lstat(child)).isSymbolicLink()) continue;
    const childResolved = await realpath(child);
    if (childResolved !== root && !childResolved.startsWith(`${root}${path.sep}`)) continue;
    folders.push({ name: entry.name, path: childRelative });
    if (folders.length === 250) break;
  }
  const parts = relative ? relative.split("/") : [];
  return { path: relative, parent: parts.length ? parts.slice(0, -1).join("/") : null, folders };
}

export function validateConfiguration(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Automation settings must be an object");
  const allowed = new Set(["folder", "limit", "ocr", "attachMarkdown"]);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`Unknown automation setting: ${unknown}`);
  const folder = cleanRelativePath(value.folder ?? "");
  const limit = Number(value.limit ?? 3);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("PDFs per run must be between 1 and 100");
  if (typeof value.ocr !== "boolean" || typeof value.attachMarkdown !== "boolean") throw new Error("OCR and attachment settings must be true or false");
  return { folder, limit, ocr: value.ocr, attachMarkdown: value.attachMarkdown };
}

async function jsonRequest(url, init = {}, timeoutMs = 120_000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.detail ?? body?.error ?? `Request failed with HTTP ${response.status}`);
  return body;
}

async function doclingInstance() {
  const overview = await jsonRequest(`${managerUrl}/api/v1/overview`, {}, 10_000);
  const instance = overview.instances?.find((item) => item.workspaceId === workspaceId && item.packageId === "org.scholarserver.docling" && item.desiredState === "enabled" && item.observedState === "healthy");
  if (!instance) throw new Error("Install and start Docling before running this automation");
  return instance.id;
}

async function doclingAction(instanceId, action, input, timeoutMs = 120_000) {
  return jsonRequest(`${managerUrl}/api/v1/instances/${encodeURIComponent(workspaceId)}/${encodeURIComponent(instanceId)}/actions/${encodeURIComponent(action)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  }, timeoutMs);
}

async function zoteroPost(route, input, timeoutMs = 120_000) {
  return jsonRequest(`${zoteroUrl}/api/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  }, timeoutMs);
}

async function waitForJob(instanceId, jobId) {
  const deadline = Date.now() + 60 * 60_000;
  while (Date.now() < deadline) {
    const job = await doclingAction(instanceId, "job-status", { jobId }, 30_000);
    if (job.state === "succeeded") return job;
    if (job.state === "failed") throw new Error(job.error || "Docling conversion failed");
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("Docling did not finish within one hour");
}

async function execute(configuration) {
  const instanceId = await doclingInstance();
  const discovered = await doclingAction(instanceId, "discover", { folder: configuration.folder, limit: configuration.limit }, 15 * 60_000);
  let matched = 0;
  let converted = 0;
  let attached = 0;
  let skipped = 0;
  for (const file of discovered.files ?? []) {
    const match = await zoteroPost("attachments/match", { sourcePath: file.path });
    if (match.state !== "matched") { skipped += 1; continue; }
    matched += 1;
    const job = await doclingAction(instanceId, "enqueue", {
      sourcePath: file.path,
      sourceAttachmentKey: match.attachmentKey,
      ocr: configuration.ocr
    });
    const result = await waitForJob(instanceId, job.id);
    converted += 1;
    if (configuration.attachMarkdown) {
      await zoteroPost("attachments/attach-docling", {
        sourceAttachmentKey: match.attachmentKey,
        relativePath: result.outputPath
      });
      attached += 1;
    }
  }
  return { discovered: (discovered.files ?? []).length, matched, converted, attached, skipped };
}

async function updateRun(runId, update) {
  await mutateState((state) => {
    const automation = state.automations[definition.id];
    const run = automation.runs.find((candidate) => candidate.id === runId);
    if (!run) return;
    Object.assign(run, update);
    automation.runs = automation.runs.slice(0, 50);
  });
}

async function startRun(trigger = "manual") {
  const { run, configuration } = await mutateState((state) => {
    const automation = state.automations[definition.id];
    if (automation.runs.some((candidate) => candidate.state === "running")) throw new Error("This automation is already running");
    const run = { id: randomUUID(), state: "running", trigger, startedAt: new Date().toISOString(), finishedAt: null, summary: null, error: null };
    automation.runs.unshift(run);
    return { run, configuration: { ...automation.configuration } };
  });
  void execute(configuration).then(
    (summary) => updateRun(run.id, { state: "succeeded", summary, finishedAt: new Date().toISOString() }),
    (error) => updateRun(run.id, { state: "failed", error: error instanceof Error ? error.message : "Automation failed", finishedAt: new Date().toISOString() })
  );
  return run;
}

async function views() {
  const state = await loadState();
  const automation = state.automations[definition.id];
  let readiness = { ready: false, message: "Docling is not available" };
  try { await doclingInstance(); readiness = { ready: true, message: "Zotero and Docling are ready" }; } catch (error) { readiness.message = error instanceof Error ? error.message : readiness.message; }
  return [{ definition, configuration: automation, readiness }];
}

async function saveAutomation(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Automation update must be an object");
  const unknown = Object.keys(input).find((key) => !["enabled", "intervalMinutes", "configuration"].includes(key));
  if (unknown) throw new Error(`Unknown automation update: ${unknown}`);
  if (typeof input.enabled !== "boolean") throw new Error("Schedule must be true or false");
  const intervalMinutes = Number(input.intervalMinutes);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 10080) throw new Error("Schedule interval must be between 15 minutes and one week");
  const configuration = validateConfiguration(input.configuration);
  return mutateState((state) => {
    state.automations[definition.id] = {
      ...state.automations[definition.id],
      enabled: input.enabled,
      intervalMinutes,
      configuration,
      updatedAt: new Date().toISOString()
    };
    return state.automations[definition.id];
  });
}

async function recoverInterruptedRuns() {
  await mutateState((state) => {
    const finishedAt = new Date().toISOString();
    for (const run of state.automations[definition.id].runs) {
      if (run.state !== "running") continue;
      Object.assign(run, {
        state: "failed",
        error: "The automation worker restarted before this run completed",
        finishedAt
      });
    }
  });
}

function send(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(body);
}

async function requestBody(request) {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (!Number.isInteger(declared) || declared < 0 || declared > 1024 * 1024) throw new Error("Request body is too large");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Request body must be an object");
  return value;
}

async function handler(request, response) {
  const url = new URL(request.url ?? "/", "http://localhost");
  try {
    if (request.method === "GET" && url.pathname === "/health") return send(response, 200, { status: "ok" });
    if (request.method === "GET" && url.pathname === "/v1/automations") return send(response, 200, { automations: await views() });
    if (request.method === "GET" && url.pathname === "/v1/folders") return send(response, 200, await browseFolders(url.searchParams.get("path") ?? ""));
    if (request.method === "PUT" && url.pathname === `/v1/automations/${definition.id}`) return send(response, 200, await saveAutomation(await requestBody(request)));
    if (request.method === "POST" && url.pathname === `/v1/automations/${definition.id}/runs`) { await requestBody(request); return send(response, 202, await startRun()); }
    return send(response, 404, { error: "Not found" });
  } catch (error) {
    return send(response, 400, { error: (error instanceof Error ? error.message : "Automation request failed").slice(0, 1000) });
  }
}

async function scheduler() {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    try {
      const state = await loadState();
      const automation = state.automations[definition.id];
      if (!automation.enabled || automation.runs.some((run) => run.state === "running")) continue;
      const latest = automation.runs[0];
      if (latest && Date.now() - new Date(latest.startedAt).getTime() < automation.intervalMinutes * 60_000) continue;
      try { await doclingInstance(); } catch { continue; }
      await startRun("scheduled");
    } catch {}
  }
}

export async function main() {
  await recoverInterruptedRuns();
  createServer((request, response) => { void handler(request, response); }).listen(port, "0.0.0.0");
  void scheduler();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
