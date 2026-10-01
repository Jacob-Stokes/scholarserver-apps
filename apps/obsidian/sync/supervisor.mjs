import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import {
  assertConfigurationActionRequest,
  ConfigurationActionError
} from "@scholarserver/controller-runtime/configuration-actions";
import { atomicJson } from "@scholarserver/controller-runtime/files";
import { ensureCouchDbSecrets } from "../vaults/couchdb-secrets.mjs";
import {
  addVault,
  initializeRegistry,
  planVaultAddition,
  planVaultSettings,
  readRegistry,
  readRegularJson,
  updateVaultSettings,
  vaultPaths
} from "../vaults/registry.mjs";
import { VaultWorkers } from "../vaults/workers.mjs";
import { decodeExistingLiveSync } from "./livesync-join.mjs";
import { selectedVaultConfiguration, vaultAccessConfiguration } from "./vault-configuration.mjs";
import { additionMethod, vaultWorkspaceConfiguration } from "./vault-workspace.mjs";

const runtime = process.env.OBSIDIAN_RUNTIME_PATH || "/runtime";
const sharedLiveSync = process.env.OBSIDIAN_SHARED_LIVESYNC_PATH || "/livesync-runtime";
const requests = path.join(runtime, "requests");
const responses = path.join(runtime, "responses");
const targets = path.join(runtime, "configuration-targets");
const workers = new VaultWorkers({ runtime });
let stopping = false;
let registryError = null;
let mutation = Promise.resolve();

function serialize(work) {
  const result = mutation.then(work);
  mutation = result.catch(() => {});
  return result;
}

function savedRevision() {
  const registry = readRegistry(runtime);
  const states = registry.vaults.map((vault) => {
    const paths = vaultPaths(vault, { ...workers.roots, runtime });
    const status = readRegularJson(path.join(paths.runtime, "status.json"), { optional: true });
    const liveSyncWorker = readRegularJson(path.join(paths.liveSync, "livesync-worker-status.json"), {
      optional: true
    });
    return [
      vault.id,
      status?.state,
      status?.profile,
      status?.remoteVault,
      status?.scopePath,
      status?.lastError,
      status?.workerRunning,
      liveSyncWorker?.running,
      liveSyncWorker?.lastError
    ];
  });
  return createHash("sha256")
    .update(JSON.stringify([registry, states]))
    .digest("hex");
}

function connection(values = {}) {
  const registry = readRegistry(runtime);
  const id = values.vaultId ?? registry.vaults[0]?.id;
  const vault = registry.vaults.find((candidate) => candidate.id === id);
  if (!vault) throw new ConfigurationActionError(409, "Choose an existing vault connection.");
  return vault;
}

async function setupSection(values = {}) {
  const registry = readRegistry(runtime);
  const revision = savedRevision();
  if (registry.vaults.length === 0) return selectedVaultConfiguration(registry, null, revision);
  const selected = connection(values);
  let childSection = null;
  let workerError = null;
  try {
    childSection = await workers.request(selected.id, "/api/configuration/setup");
  } catch {
    workerError = workers.workers.get(selected.id)?.error || null;
  }
  return selectedVaultConfiguration(registry, selected, savedRevision(), { childSection, workerError });
}

function accessSection(values = {}) {
  const registry = readRegistry(runtime);
  const selected = registry.vaults.length > 0 ? connection(values) : null;
  return vaultAccessConfiguration(registry, selected, savedRevision());
}

async function workspaceSection(values = {}) {
  const registry = readRegistry(runtime);
  const statuses = {};
  const errors = {};
  for (const vault of registry.vaults) {
    const paths = vaultPaths(vault, { ...workers.roots, runtime });
    try {
      const status = readRegularJson(path.join(paths.runtime, "status.json"), { optional: true });
      const liveSyncWorker = readRegularJson(path.join(paths.liveSync, "livesync-worker-status.json"), {
        optional: true
      });
      statuses[vault.id] = status ? { ...status, liveSyncWorker } : null;
      if (workers.workers.get(vault.id)?.error) errors[vault.id] = workers.workers.get(vault.id).error;
    } catch {
      errors[vault.id] = "This vault's saved state needs recovery.";
    }
  }
  const view = values.vaultId || "overview";
  let childSection;
  const selected = registry.vaults.find((vault) => vault.id === view);
  if (selected) {
    // Evaluation needs only presentation choices, never sign-in or setup secrets.
    const childValues = {};
    if (values.livesyncMode !== undefined) childValues.livesyncMode = values.livesyncMode;
    if (values.repairConnection !== undefined) childValues.repairConnection = values.repairConnection;
    if (selected.setupMode && childValues.livesyncMode === undefined) childValues.livesyncMode = selected.setupMode;
    try {
      childSection = await workers.request(selected.id, "/api/configuration/setup/evaluate", {
        method: "POST",
        body: { values: childValues }
      });
    } catch {
      errors[selected.id] ||= "Could not read this vault's connection. Check it again before making a change.";
    }
  }
  return vaultWorkspaceConfiguration(registry, savedRevision(), view, { childSection, statuses, errors });
}

async function currentSection(sectionId, values = {}) {
  if (sectionId === "vaults") return workspaceSection(values);
  if (sectionId === "access") return accessSection(values);
  return setupSection(values);
}
async function targetReceipt(requestId, expectedSectionId = null) {
  const target = readRegularJson(path.join(targets, `${requestId}.json`), { optional: true });
  if (!target) return null;
  if (expectedSectionId && target.sectionId !== expectedSectionId)
    throw new ConfigurationActionError(404, "Operation not found in this section.");
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(target.vaultId || "") || !["vaults", "access", "setup"].includes(target.sectionId))
    throw new Error("The saved configuration request needs recovery.");
  if (target.status === "succeeded") {
    const result = { requestId, actionId: target.actionId, status: "succeeded" };
    if (target.sectionId === "vaults" && ["add-vault", "save-access"].includes(target.actionId))
      result.section = await workspaceSection({ vaultId: target.vaultId });
    return result;
  }
  if (target.status === "rejected")
    return {
      requestId,
      actionId: target.actionId,
      status: "rejected",
      message: "This change was not applied. Check the fields and try again."
    };
  if (target.actionId === "add-vault" || target.actionId === "save-access") {
    const registry = readRegistry(runtime);
    const selected = registry.vaults.find((vault) => vault.id === target.vaultId);
    const applied =
      target.actionId === "add-vault"
        ? Boolean(selected)
        : selected?.label === target.settings?.label && selected?.aiEnabled === target.settings?.aiEnabled;
    if (applied && registry.revision > target.registryRevision) {
      const result = { requestId, actionId: target.actionId, status: "succeeded" };
      if (target.sectionId === "vaults") result.section = await workspaceSection({ vaultId: target.vaultId });
      return result;
    }
    if (registry.revision === target.registryRevision)
      return {
        requestId,
        actionId: target.actionId,
        status: "rejected",
        message: "This change was not applied. You can retry with a new request."
      };
    return { requestId, actionId: target.actionId, status: "unconfirmed" };
  }
  const result = await workers.request(target.vaultId, `/api/configuration/setup/operations/${requestId}`);
  if (target.sectionId === "vaults" && result.section) {
    return { ...result, section: await workspaceSection({ vaultId: target.vaultId }) };
  }
  return result;
}

async function nativeAction(sectionId, actionId, wire) {
  const input = assertConfigurationActionRequest(wire, actionId, sectionId);
  return serialize(async () => {
    const previous = readRegularJson(path.join(targets, `${input.requestId}.json`), { optional: true });
    if (previous) {
      if (
        previous.actionId !== actionId ||
        previous.sectionId !== sectionId ||
        (actionId !== "add-vault" && previous.vaultId !== input.values.vaultId)
      ) {
        throw new ConfigurationActionError(409, "This request belongs to another vault action.");
      }
      return (await targetReceipt(input.requestId)) || { requestId: input.requestId, actionId, status: "unconfirmed" };
    }
    const section = await currentSection(sectionId, input.values);
    if (section.revision !== input.expectedRevision)
      throw new ConfigurationActionError(409, "Vault settings changed. Refresh before saving.");
    const action = section.actions.find(
      (candidate) => candidate.id === actionId && candidate.kind === "submit" && !candidate.disabled
    );
    if (!action || Object.keys(input.values).some((id) => !action.fieldIds.includes(id))) {
      throw new ConfigurationActionError(400, "This action is unavailable or contains an unsupported field.");
    }
    if (actionId === "add-vault") {
      const registry = readRegistry(runtime);
      const method = additionMethod(input.values.vaultId);
      if (!method) throw new ConfigurationActionError(400, "Choose how to connect this vault.");
      let label = input.values.label?.trim() || method.label;
      let suffix = 2;
      while (
        !input.values.label?.trim() &&
        registry.vaults.some((vault) => vault.label.toLocaleLowerCase() === label.toLocaleLowerCase())
      ) {
        label = `${method.label} ${suffix++}`;
      }
      const addition = { label, source: method.source, ...(method.setupMode ? { setupMode: method.setupMode } : {}) };
      const reservedId = `vault-${randomUUID()}`;
      try {
        planVaultAddition(runtime, registry.revision, addition, reservedId);
      } catch (error) {
        throw new ConfigurationActionError(400, error.message);
      }
      const target = { sectionId, actionId, vaultId: reservedId, registryRevision: registry.revision };
      await atomicJson(path.join(targets, `${input.requestId}.json`), target);
      addVault(runtime, registry.revision, addition, reservedId);
      workers.reconcile();
      await atomicJson(path.join(targets, `${input.requestId}.json`), { ...target, status: "succeeded" });
      return {
        requestId: input.requestId,
        actionId,
        status: "succeeded",
        section: await workspaceSection({ vaultId: reservedId })
      };
    }
    const selected = connection(input.values);
    if (actionId === "save-access") {
      const registry = readRegistry(runtime);
      const { vaultId: ignored, ...settings } = input.values;
      try {
        planVaultSettings(runtime, registry.revision, selected.id, settings);
      } catch (error) {
        throw new ConfigurationActionError(400, error.message);
      }
      const target = { sectionId, actionId, vaultId: selected.id, registryRevision: registry.revision, settings };
      await atomicJson(path.join(targets, `${input.requestId}.json`), target);
      updateVaultSettings(runtime, registry.revision, selected.id, settings);
      await atomicJson(path.join(targets, `${input.requestId}.json`), { ...target, status: "succeeded" });
      return { requestId: input.requestId, actionId, status: "succeeded" };
    }
    if (actionId === "join-livesync") {
      let imported;
      try {
        imported = await decodeExistingLiveSync(input.values.setupURI, input.values.setupPassphrase);
      } catch (error) {
        // Refuse a bad import before recording or mutating a connection.
        throw new ConfigurationActionError(400, error.message);
      }
      for (const vault of readRegistry(runtime).vaults) {
        if (vault.id === selected.id || vault.source !== "livesync") continue;
        const paths = vaultPaths(vault, { ...workers.roots, runtime });
        const enrollment = readRegularJson(path.join(paths.runtime, "enrollment.json"), { optional: true });
        if (
          enrollment?.database === imported.database &&
          enrollment.connectionUrl?.replace(/\/$/, "") === imported.connectionUrl
        )
          throw new ConfigurationActionError(
            409,
            "This LiveSync database already has a connection here. Configure that vault instead."
          );
      }
    }
    if (actionId === "connect-vault") {
      for (const vault of readRegistry(runtime).vaults) {
        if (vault.id === selected.id || vault.source !== "official") continue;
        const paths = vaultPaths(vault, { ...workers.roots, runtime });
        const binding = readRegularJson(path.join(paths.runtime, "vault-binding.json"), { optional: true });
        if (binding?.profile === "official" && binding.vaultId === input.values.vault)
          throw new ConfigurationActionError(
            409,
            "This remote vault already has a connection in this installation. Choose that connection instead."
          );
      }
    }
    const childSection = await workers.request(selected.id, "/api/configuration/setup");
    const { vaultId: ignored, ...values } = input.values;
    const target = { sectionId, actionId, vaultId: selected.id };
    await atomicJson(path.join(targets, `${input.requestId}.json`), target);
    const result = await workers.request(selected.id, `/api/configuration/setup/actions/${actionId}`, {
      method: "POST",
      body: { requestId: input.requestId, expectedRevision: childSection.revision, values },
      timeoutMs: 16 * 60_000,
      expectedAction: { requestId: input.requestId, actionId }
    });
    if (result.status === "rejected") {
      await atomicJson(path.join(targets, `${input.requestId}.json`), { ...target, status: "rejected" });
    }
    if (sectionId === "vaults" && result.section) {
      return { ...result, section: await workspaceSection({ vaultId: selected.id }) };
    }
    return result;
  });
}

async function body(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 64 * 1024) throw new ConfigurationActionError(400, "Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function reply(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

async function handle(request, response) {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/health")
      return reply(response, stopping || registryError ? 503 : 200, {
        status: stopping ? "stopping" : registryError ? "recovery-required" : "ok",
        ...(registryError ? { error: registryError } : {})
      });
    const match = url.pathname.match(
      /^\/api\/configuration\/(vaults|setup|access)(?:\/(evaluate|actions|operations|outputs)(?:\/([a-zA-Z0-9-]+))?)?$/
    );
    if (!match) return reply(response, 404, { error: "Use Configuration in Manager to manage vault connections." });
    const [, sectionId, operation, id] = match;
    if (!operation && request.method === "GET") return reply(response, 200, await currentSection(sectionId));
    if (operation === "evaluate" && request.method === "POST") {
      const input = await body(request);
      if (
        !input.values ||
        typeof input.values !== "object" ||
        input.navigateActionId ||
        Object.keys(input).some((key) => key !== "values")
      ) {
        throw new ConfigurationActionError(400, "Invalid configuration evaluation.");
      }
      return reply(response, 200, await currentSection(sectionId, input.values));
    }
    if (operation === "actions" && id && request.method === "POST") {
      const wire = await body(request);
      try {
        return reply(response, 200, await nativeAction(sectionId, id, wire));
      } catch (error) {
        if (
          error instanceof ConfigurationActionError &&
          /^[a-zA-Z0-9-]{16,80}$/.test(wire.requestId || "") &&
          !fs.existsSync(path.join(targets, `${wire.requestId}.json`))
        ) {
          return reply(response, error.status, {
            requestId: wire.requestId,
            actionId: id,
            status: "rejected-before-change"
          });
        }
        throw error;
      }
    }
    if (operation === "operations" && id && request.method === "GET") {
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(id)) throw new ConfigurationActionError(400, "Invalid request identity.");
      const result = await targetReceipt(id, sectionId);
      return reply(response, result ? 200 : 404, result || { error: "Operation not found" });
    }
    if (operation === "outputs" && ["setup", "vaults"].includes(sectionId) && id && request.method === "POST") {
      const selected = readRegistry(runtime).vaults.find((vault) => id.endsWith(`-${vault.id}`));
      if (!selected) throw new ConfigurationActionError(404, "Output not found.");
      const input = await body(request);
      if (Object.keys(input).length > 0) {
        if (
          Object.keys(input).some((key) => key !== "values") ||
          !input.values ||
          Object.keys(input.values).some((key) => key !== "vaultId") ||
          input.values.vaultId !== selected.id
        )
          throw new ConfigurationActionError(400, "Choose this output's vault connection.");
      }
      const outputId = id.slice(0, -(selected.id.length + 1));
      const result = await workers.request(selected.id, `/api/configuration/setup/outputs/${outputId}`, {
        method: "POST",
        body: {}
      });
      return reply(response, 200, { ...result, id });
    }
    return reply(response, 404, { error: "Operation not found" });
  } catch (error) {
    return reply(response, error instanceof ConfigurationActionError ? error.status : 503, { error: error.message });
  }
}

for (const directory of [runtime, sharedLiveSync, requests, responses, targets])
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const enrollment = readRegularJson(path.join(runtime, "enrollment.json"), { optional: true });
const legacyVariant = process.env.SCHOLARSERVER_VARIANT;
let legacySource = enrollment ? enrollment.profile || "official" : null;
if (!legacySource && legacyVariant === "obsidian-sync") legacySource = "official";
if (!legacySource && legacyVariant === "self-hosted-livesync") legacySource = "livesync";
initializeRegistry({ runtime, legacySource, legacyVault: workers.roots.legacyVault });
await ensureCouchDbSecrets(sharedLiveSync);
try {
  const token = fs.readFileSync(path.join(runtime, "service-token"), "utf8").trim();
  if (token.length < 32) throw new Error("Saved service credentials need recovery.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  fs.writeFileSync(path.join(runtime, "service-token"), `${randomBytes(32).toString("base64url")}\n`, {
    flag: "wx",
    mode: 0o600
  });
}
workers.reconcile();
async function processMountedRequests() {
  const names = fs
    .readdirSync(requests)
    .filter((name) => /^[a-z0-9-]+\.json$/.test(name))
    .sort();
  for (const name of names) {
    const filename = path.join(requests, name);
    let outcome;
    try {
      const request = readRegularJson(filename, { maximumBytes: 1024 * 1024 });
      if (!["browse-folders", "create-research-note", "status"].includes(request.action))
        throw new Error("Use Configuration in Manager for vault setup.");
      const vaults = readRegistry(runtime).vaults;
      const input = request.input || {};
      const id = input.vaultId || (vaults.length === 1 ? vaults[0].id : null);
      if (!id || !vaults.some((vault) => vault.id === id))
        throw new Error("Choose the vault connection for this action.");
      const { vaultId: ignored, ...values } = input;
      outcome = {
        ok: true,
        result: await workers.request(id, `/api/onboarding/${request.action}`, {
          method: "POST",
          body: values,
          timeoutMs: 30_000
        })
      };
    } catch (error) {
      outcome = { ok: false, error: error.message };
    }
    fs.rmSync(filename, { force: true });
    await atomicJson(path.join(responses, name), outcome);
  }
}
let readingMountedRequests = false;
const mountedTimer = setInterval(() => {
  if (readingMountedRequests || stopping) return;
  readingMountedRequests = true;
  void processMountedRequests()
    .catch(() => {})
    .finally(() => {
      readingMountedRequests = false;
    });
}, 250);
const timer = setInterval(() => {
  try {
    workers.reconcile();
    registryError = null;
  } catch {
    registryError = "The vault registry needs recovery; it has not been replaced.";
  }
}, 2000);
createServer((request, response) => {
  void handle(request, response);
}).listen(Number(process.env.OBSIDIAN_SUPERVISOR_PORT || "8080"), "0.0.0.0");
process.once("SIGTERM", () => {
  stopping = true;
  clearInterval(timer);
  clearInterval(mountedTimer);
  void workers.stop().finally(() => process.exit(0));
});
