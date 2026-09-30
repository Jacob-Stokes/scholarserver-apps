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
    return [vault.id, status?.state, status?.profile, status?.remoteVault, status?.scopePath, status?.lastError];
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

function vaultSection() {
  const registry = readRegistry(runtime);
  return {
    version: 1,
    id: "vaults",
    revision: String(registry.revision),
    title: "Vaults",
    description: "Add vault connections here. Each vault has separate files, sign-in and sync state.",
    notices: [],
    fields: [
      { id: "label", label: "Vault name", type: "text", required: true, maxLength: 120 },
      {
        id: "source",
        label: "Sync method",
        type: "select",
        required: true,
        options: [
          { value: "official", label: "Obsidian Sync (subscription required)" },
          { value: "livesync", label: "Self-hosted LiveSync" }
        ]
      }
    ],
    values: {},
    summary: registry.vaults.map((vault) => ({
      label: vault.label,
      value: vault.source === "official" ? "Obsidian Sync" : "Self-hosted LiveSync"
    })),
    actions: [
      { id: "add-vault", label: "Add vault", kind: "submit", fieldIds: ["label", "source"], target: { kind: "app" } }
    ]
  };
}

async function setupSection(values = {}) {
  const registry = readRegistry(runtime);
  if (registry.vaults.length === 0)
    return {
      version: 1,
      id: "setup",
      revision: savedRevision(),
      title: "Vault connection",
      notices: [{ kind: "info", text: "Add a vault above, then finish its connection here." }],
      fields: [],
      values: {},
      summary: [],
      actions: []
    };
  const selected = connection(values);
  let section;
  try {
    section = await workers.request(selected.id, "/api/configuration/setup");
  } catch {
    const worker = workers.workers.get(selected.id);
    section = {
      version: 1,
      id: "setup",
      title: "Vault connection",
      fields: [],
      values: {},
      summary: [],
      actions: [],
      notices: [
        { kind: worker?.error ? "error" : "info", text: worker?.error || "Starting this vault's sync controller…" }
      ]
    };
  }
  section.revision = savedRevision();
  section.title = "Vault connection";
  section.description = "Configure the selected vault. Other vault connections keep running.";
  section.fields.unshift({
    id: "vaultId",
    label: "Vault connection",
    type: "select",
    required: true,
    selectsContext: true,
    options: registry.vaults.map((vault) => ({ value: vault.id, label: vault.label }))
  });
  section.values.vaultId = selected.id;
  section.actions = section.actions.map((action) => ({
    ...action,
    ...(action.kind === "submit" ? { fieldIds: ["vaultId", ...(action.fieldIds || [])] } : {})
  }));
  section.pollAfterMs = section.pollAfterMs || 3000;
  if (section.outputs)
    section.outputs = section.outputs.map((output) => ({ ...output, id: `${output.id}-${selected.id}` }));
  return section;
}

function accessSection(values = {}) {
  const registry = readRegistry(runtime);
  if (registry.vaults.length === 0)
    return {
      version: 1,
      id: "access",
      revision: savedRevision(),
      title: "Vault settings",
      fields: [],
      values: {},
      summary: [],
      actions: [],
      notices: [{ kind: "info", text: "Add a vault before choosing its AI access." }]
    };
  const selected = connection(values);
  return {
    version: 1,
    id: "access",
    revision: savedRevision(),
    title: "Vault settings",
    pollAfterMs: 3000,
    description:
      "Names and AI access belong to each vault connection. Sync keeps running when AI access is turned off.",
    notices: [
      {
        kind: "warning",
        text: "AI access exposes the connected vault's selected folder through ScholarServer's tools. It does not change device sync or vault encryption."
      }
    ],
    fields: [
      {
        id: "vaultId",
        label: "Vault connection",
        type: "select",
        selectsContext: true,
        required: true,
        options: registry.vaults.map((vault) => ({ value: vault.id, label: vault.label }))
      },
      { id: "label", label: "Vault name", type: "text", required: true, maxLength: 120 },
      { id: "aiEnabled", label: "Allow AI tools to access this vault", type: "boolean", required: true }
    ],
    values: { vaultId: selected.id, label: selected.label, aiEnabled: selected.aiEnabled },
    summary: [],
    actions: [
      {
        id: "save-access",
        label: "Save vault settings",
        kind: "submit",
        fieldIds: ["vaultId", "label", "aiEnabled"],
        target: { kind: "app" }
      }
    ]
  };
}

async function currentSection(sectionId, values = {}) {
  if (sectionId === "vaults") return vaultSection();
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
  if (target.status === "succeeded") return { requestId, actionId: target.actionId, status: "succeeded" };
  if (target.sectionId === "vaults" || target.sectionId === "access") {
    const registry = readRegistry(runtime);
    const selected = registry.vaults.find((vault) => vault.id === target.vaultId);
    const applied =
      target.sectionId === "vaults"
        ? Boolean(selected)
        : selected?.label === target.settings?.label && selected?.aiEnabled === target.settings?.aiEnabled;
    if (applied && registry.revision > target.registryRevision)
      return { requestId, actionId: target.actionId, status: "succeeded" };
    if (registry.revision === target.registryRevision)
      return {
        requestId,
        actionId: target.actionId,
        status: "rejected",
        message: "This change was not applied. You can retry with a new request."
      };
    return { requestId, actionId: target.actionId, status: "unconfirmed" };
  }
  return workers.request(target.vaultId, `/api/configuration/setup/operations/${requestId}`);
}

async function nativeAction(sectionId, actionId, wire) {
  const input = assertConfigurationActionRequest(wire, actionId, sectionId);
  return serialize(async () => {
    const previous = readRegularJson(path.join(targets, `${input.requestId}.json`), { optional: true });
    if (previous) {
      if (
        previous.actionId !== actionId ||
        previous.sectionId !== sectionId ||
        (sectionId !== "vaults" && previous.vaultId !== input.values.vaultId)
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
    if (sectionId === "vaults") {
      if (actionId !== "add-vault") throw new ConfigurationActionError(400, "Unsupported vault action.");
      const reservedId = `vault-${randomUUID()}`;
      try {
        planVaultAddition(runtime, Number(input.expectedRevision), input.values, reservedId);
      } catch (error) {
        throw new ConfigurationActionError(400, error.message);
      }
      const target = { sectionId, actionId, vaultId: reservedId, registryRevision: Number(input.expectedRevision) };
      await atomicJson(path.join(targets, `${input.requestId}.json`), target);
      addVault(runtime, Number(input.expectedRevision), input.values, reservedId);
      workers.reconcile();
      await atomicJson(path.join(targets, `${input.requestId}.json`), { ...target, status: "succeeded" });
      return { requestId: input.requestId, actionId, status: "succeeded" };
    }
    const selected = connection(input.values);
    if (sectionId === "access") {
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
    await atomicJson(path.join(targets, `${input.requestId}.json`), { sectionId, actionId, vaultId: selected.id });
    return workers.request(selected.id, `/api/configuration/setup/actions/${actionId}`, {
      method: "POST",
      body: { requestId: input.requestId, expectedRevision: childSection.revision, values },
      timeoutMs: 16 * 60_000
    });
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
    if (operation === "outputs" && sectionId === "setup" && id && request.method === "POST") {
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
