import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { atomicJson, atomicWrite } from "@scholarserver/controller-runtime/files";
import { Enrollment } from "./enrollment.mjs";
import { HttpOperations } from "./http-operations.mjs";
import { GraphError, validateGraphName } from "./operations.mjs";
import { GraphRunner } from "./runner.mjs";
import { privateSyncAddress, readSyncAddress } from "./sync-launcher.mjs";
import { WorkerHttp } from "./worker-http.mjs";

export function selectedRemote(graphs, id) {
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id)) {
    throw new GraphError("invalid-notebook", "Choose a notebook from the list.");
  }
  const matches = graphs.filter((graph) => graph["graph-id"] === id);
  if (matches.length !== 1 || matches[0]["graph-e2ee?"] !== true || matches[0]["graph-ready-for-use?"] !== true) {
    throw new GraphError("graph-unavailable", "Choose an available, encrypted notebook from this server.");
  }
  const selected = matches[0];
  const graph = validateGraphName(selected["graph-name"]);
  if (graphs.filter((entry) => entry["graph-name"] === graph).length !== 1) {
    throw new GraphError(
      "ambiguous-graph",
      "These notebooks have the same name. Give them different names in Logseq first."
    );
  }
  return { graph, remoteId: id };
}

export function verifyReplica(info, selected) {
  if (info?.kv?.["logseq.kv/graph-uuid"] !== selected.remoteId || info?.kv?.["logseq.kv/graph-rtc-e2ee?"] !== true) {
    throw new GraphError(
      "graph-mismatch",
      "This local notebook does not match the selected encrypted notebook. It was left untouched.",
      409
    );
  }
}

export function syncObservation(value, remoteId) {
  if (!value || value["graph-id"] !== remoteId) return "unavailable";
  if (value["last-error"]) return "needs-attention";
  if (value["ws-state"] !== "open") return "reconnecting";
  const pending = ["pending-local", "pending-asset", "pending-server"].map((key) => value[key]);
  if (pending.some((count) => typeof count !== "number" || count < 0)) return "checking";
  if (pending.some((count) => count > 0)) return "syncing";
  if (!value["local-checksum"] || value["local-checksum"] !== value["remote-checksum"]) return "checking";
  return "up-to-date";
}

async function exists(file) {
  try {
    return await lstat(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function preserveIncompleteDownload(root, selection, stopWorker) {
  if (selection.phase !== "downloading")
    throw new GraphError("already-connected", "A connected notebook cannot be replaced.", 409);
  const graph = validateGraphName(selection.graph);
  const directory = path.join(root, "graphs", graph);
  const entry = await exists(directory);
  if (!entry) return null;
  if (!entry.isDirectory() || entry.isSymbolicLink())
    throw new GraphError("invalid-data", "The notebook folder needs attention. It was left untouched.", 409);
  await stopWorker();
  const recovery = path.join(root, "recovery");
  await mkdir(recovery, { recursive: true, mode: 0o700 });
  if ((await lstat(recovery)).isSymbolicLink())
    throw new GraphError("invalid-data", "The recovery folder needs attention.", 409);
  const saved = path.join(recovery, `${graph}-${randomUUID()}`);
  // Only our uncompleted first download can be moved. Never delete it or upload over the remote.
  await rename(directory, saved);
  return saved;
}

async function requestBody(request) {
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    throw new GraphError("invalid-request", "Send a JSON request.", 415);
  }
  if (request.headers["sec-fetch-site"] === "cross-site")
    throw new GraphError("invalid-request", "Open setup in ScholarServer.", 403);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 12_000) throw new GraphError("request-too-large", "The setup request is too large.", 413);
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("object required");
    return value;
  } catch {
    throw new GraphError("invalid-request", "The setup request could not be read.");
  }
}

export async function startManaged({ graphServer, serviceToken }) {
  const root = process.env.LOGSEQ_GRAPH_ROOT ?? "/graph";
  const runtime = process.env.LOGSEQ_RUNTIME ?? "/runtime";
  const uiRoot = process.env.LOGSEQ_UI_ROOT ?? "/app/ui";
  const syncConfig = process.env.LOGSEQ_SYNC_CONFIG;
  let syncAddress = null;
  if (syncConfig) {
    await mkdir(syncConfig, { recursive: true, mode: 0o755 });
    // The upstream sync image mounts only this public configuration directory,
    // never the helper's credentials or notebook. It runs our small launcher.
    await atomicWrite(
      path.join(syncConfig, "launcher.mjs"),
      await readFile(new URL("./sync-launcher.mjs", import.meta.url)),
      0o644
    );
    syncAddress = await readSyncAddress(path.join(syncConfig, "address.json"));
  }
  await mkdir(root, { recursive: true, mode: 0o700 });
  const configPath = path.join(root, "scholarserver.json");
  const cliPath = path.join(root, "cli.edn");
  if (!(await exists(cliPath))) {
    await atomicWrite(
      cliPath,
      `{:auth-path ${JSON.stringify(path.join(root, "auth.json"))}
:oauth-authorize-endpoint "https://logseq-prod.auth.us-east-1.amazoncognito.com/oauth2/authorize"
:oauth-token-endpoint "https://logseq-prod.auth.us-east-1.amazoncognito.com/oauth2/token"
:http-base "http://sync:8787"
:ws-url "ws://sync:8787/sync/%s"}\n`
    );
  }
  let selection = null;
  if (await exists(configPath)) selection = JSON.parse(await readFile(configPath, "utf8"));
  const accountRoot = path.join(runtime, "account");
  await mkdir(accountRoot, { recursive: true, mode: 0o700 });
  const accountRunner = new GraphRunner({ graph: "Account", root: accountRoot, timeoutMs: 330_000 });
  const enrollment = new Enrollment({
    root,
    runtime,
    runLogin: (config, signal) => accountRunner.run(["--config", config, "login"], { signal })
  });
  const token = await serviceToken(runtime);
  let graphRunner;
  let worker;
  let operations;
  let ready = false;
  let phase = selection ? "starting" : "setup";
  let sync = "unavailable";
  let lastError = null;
  let joining = false;
  let observing = false;
  let closing = false;

  const api = graphServer({
    token,
    ready: () => ready,
    execute: (operation, input) => operations.execute(operation, input)
  });
  api.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");

  async function status() {
    return {
      phase,
      addressRequired: Boolean(syncConfig),
      syncAddress,
      browserAvailable: process.env.LOGSEQ_BROWSER_EDITOR === "1",
      ready,
      sync,
      graph: selection?.graph ?? null,
      canRetry: selection?.phase === "downloading" && phase === "needs-attention" && !joining,
      accountConnected: Boolean(await exists(path.join(root, "auth.json"))),
      account: enrollment.status(),
      error: lastError,
      updatedAt: new Date().toISOString()
    };
  }

  async function remoteGraphs() {
    requireSyncAddress();
    if (["waiting", "authenticating"].includes(enrollment.status().state)) {
      throw new GraphError("busy", "Finish signing in first.", 409);
    }
    try {
      const { graphs } = await accountRunner.run(["--config", cliPath, "sync", "remote-graphs"]);
      return graphs;
    } finally {
      // Discovery must not leave a second worker running or occupy a real notebook name.
      await accountRunner.run(["server", "stop"]);
    }
  }

  function requireSyncAddress() {
    if (syncConfig && !syncAddress)
      throw new GraphError("address-required", "Set up the private sync address first.", 409);
  }

  async function configureAddress(value) {
    if (!syncConfig) throw new GraphError("unavailable", "This installation manages its address separately.", 409);
    let next;
    try {
      next = privateSyncAddress(value);
    } catch {
      throw new GraphError("invalid-address", "Choose the private sync address supplied by ScholarServer.");
    }
    if (selection && next !== syncAddress)
      throw new GraphError("already-connected", "The connected notebook's server address was not changed.", 409);
    await atomicJson(path.join(syncConfig, "address.json"), { url: next }, 0o644);
    syncAddress = next;
    return status();
  }

  async function openReplica() {
    graphRunner = new GraphRunner({ graph: selection.graph, root, timeoutMs: 180_000 });
    const database = await exists(path.join(root, "graphs", selection.graph, "db.sqlite"));
    if (!database?.isFile() || database.isSymbolicLink() || !database.size) {
      throw new GraphError(
        "incomplete-download",
        "The notebook download is incomplete. Existing files were preserved; do not reset the remote notebook.",
        409
      );
    }
    const info = await graphRunner.run(["graph", "info"]);
    verifyReplica(info, selection);
    const { servers } = await graphRunner.run(["server", "list"]);
    const endpoint = servers.find((entry) => entry.repo === `logseq_db_${selection.graph}`);
    worker = new WorkerHttp({ endpoint, graph: selection.graph, root });
    await worker.check(AbortSignal.timeout(10_000));
    await graphRunner.run(["sync", "start"]);
    const connected = { ...selection, phase: "connected" };
    await atomicJson(configPath, connected);
    // Do not let the health observer promote a half-completed enrollment to ready.
    selection = connected;
    operations = new HttpOperations({ worker, graph: selection.graph });
    ready = true;
    phase = "ready";
    lastError = null;
  }

  async function join({ remoteId, password }) {
    if (joining || selection)
      throw new GraphError("already-selected", "A notebook has already been selected. It will not be replaced.", 409);
    if (typeof password !== "string" || !password.length || password.length > 4096) {
      throw new GraphError("password-required", "Enter the encryption password for this notebook.");
    }
    joining = true;
    try {
      const selected = selectedRemote(await remoteGraphs(), remoteId);
      if (await exists(path.join(root, "graphs", selected.graph))) {
        throw new GraphError(
          "existing-data",
          "A local notebook with this name already exists. It was left untouched.",
          409
        );
      }
      selection = { ...selected, phase: "downloading" };
      await atomicJson(configPath, selection);
      phase = "downloading";
      graphRunner = new GraphRunner({ graph: selected.graph, root, timeoutMs: 180_000 });
      // The request ends promptly; the controller owns the job, not the browser tab.
      void downloadReplica(password);
      return status();
    } catch (error) {
      joining = false;
      throw error;
    }
  }

  async function downloadReplica(password) {
    try {
      await graphRunner.run(["sync", "download", "--e2ee-password", password]);
      password = "";
      await openReplica();
    } catch (error) {
      phase = "needs-attention";
      lastError =
        error instanceof GraphError
          ? error.message
          : "The notebook could not be connected. Existing data was preserved.";
    } finally {
      password = "";
      joining = false;
    }
  }

  async function retryDownload({ password }) {
    if (joining || phase !== "needs-attention" || selection?.phase !== "downloading") {
      throw new GraphError("retry-unavailable", "This notebook is not awaiting a download retry.", 409);
    }
    if (typeof password !== "string" || !password.length || password.length > 4096) {
      throw new GraphError("password-required", "Enter the encryption password for this notebook.");
    }
    joining = true;
    try {
      const remote = selectedRemote(await remoteGraphs(), selection.remoteId);
      if (remote.graph !== selection.graph)
        throw new GraphError("graph-changed", "The remote notebook name changed. Its files were left untouched.", 409);
      graphRunner = new GraphRunner({ graph: selection.graph, root, timeoutMs: 180_000 });
      const database = await exists(path.join(root, "graphs", selection.graph, "db.sqlite"));
      if (database?.isFile() && !database.isSymbolicLink() && database.size) {
        const info = await graphRunner.run(["graph", "info"]);
        if (info?.kv?.["logseq.kv/graph-uuid"]) {
          verifyReplica(info, selection);
          await openReplica();
          joining = false;
          return status();
        }
      }
      await preserveIncompleteDownload(root, selection, () => graphRunner.run(["server", "stop"]));
      phase = "downloading";
      lastError = null;
      void downloadReplica(password);
      return status();
    } catch (error) {
      joining = false;
      throw error;
    }
  }

  async function sendStatic(url, response) {
    const assets = url.pathname.indexOf("/assets/");
    const suffix = assets >= 0 ? url.pathname.slice(assets + 1) : "index.html";
    const file = path.resolve(uiRoot, suffix);
    if (!file.startsWith(`${path.resolve(uiRoot)}/`)) throw new GraphError("not-found", "Not found.", 404);
    const content = await readFile(file);
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
    response.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    response.end(content);
  }

  const ui = createServer(async (request, response) => {
    const send = (code, value) => {
      response.writeHead(code, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer");
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") return send(200, { ready: true });
      if (request.method === "GET" && url.pathname === "/api/status") return send(200, await status());
      if (request.method === "GET" && url.pathname === "/api/graphs")
        return send(200, { graphs: await remoteGraphs() });
      if (request.method === "POST") {
        const body = await requestBody(request);
        if (url.pathname === "/api/address") return send(200, await configureAddress(body.url));
        if (url.pathname === "/api/account/start") {
          requireSyncAddress();
          if (selection)
            throw new GraphError(
              "already-selected",
              "The notebook is already linked. Sign-in changes are not available during this setup.",
              409
            );
          return send(200, await enrollment.start());
        }
        if (url.pathname === "/api/account/complete") return send(200, await enrollment.complete(body.returnLink));
        if (url.pathname === "/api/account/cancel") {
          await enrollment.cancel();
          return send(200, enrollment.status());
        }
        if (url.pathname === "/api/join") return send(202, await join(body));
        if (url.pathname === "/api/retry") return send(202, await retryDownload(body));
      }
      if (request.method === "GET" && !url.pathname.startsWith("/api/")) return await sendStatic(url, response);
      return send(404, { error: "Not found." });
    } catch (error) {
      send(error instanceof GraphError ? error.status : 503, {
        error:
          error instanceof GraphError
            ? error.message
            : "Logseq setup could not complete this request. Please try again."
      });
    }
  });
  ui.requestTimeout = 30_000;
  ui.headersTimeout = 10_000;
  ui.listen(Number(process.env.LOGSEQ_SETUP_PORT ?? 8081), "0.0.0.0");

  if (selection)
    void openReplica().catch((error) => {
      phase = "needs-attention";
      lastError =
        error instanceof GraphError
          ? error.message
          : "The saved notebook could not be reopened. Existing data was preserved.";
    });
  const timer = setInterval(async () => {
    if (!operations || observing || closing || joining) return;
    observing = true;
    try {
      await worker.check(AbortSignal.timeout(3000));
      ready = true;
      sync = syncObservation(await graphRunner.run(["sync", "status"]), selection.remoteId);
    } catch {
      ready = false;
      sync = "unavailable";
    } finally {
      observing = false;
    }
  }, 5000);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      closing = true;
      ready = false;
      clearInterval(timer);
      ui.close();
      api.close();
      await enrollment.cancel();
      try {
        if (graphRunner) await graphRunner.run(["server", "stop"]);
      } finally {
        process.exit(0);
      }
    });
}
