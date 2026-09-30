import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const identifier = /^[a-z][a-z0-9-]{0,62}$/;
const sources = new Set(["official", "livesync"]);
const maximumVaults = 32;

export function validateRegistry(value) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !Array.isArray(value.vaults) ||
    value.vaults.length > maximumVaults
  ) {
    throw new Error("The saved vault registry needs recovery; it has not been replaced.");
  }
  const seen = new Set();
  const labels = new Set();
  let legacy = false;
  for (const vault of value.vaults) {
    if (
      !vault ||
      !identifier.test(vault.id) ||
      seen.has(vault.id) ||
      !sources.has(vault.source) ||
      !["legacy", "managed"].includes(vault.layout) ||
      typeof vault.label !== "string" ||
      !vault.label.trim() ||
      vault.label.length > 120 ||
      /[\x00-\x1f\x7f]/.test(vault.label) ||
      typeof vault.aiEnabled !== "boolean" ||
      Object.keys(vault).some((key) => !["id", "label", "source", "layout", "aiEnabled"].includes(key))
    ) {
      throw new Error("The saved vault registry contains an invalid connection.");
    }
    if (vault.layout === "legacy") {
      if (legacy) throw new Error("The saved vault registry assigns two vaults to legacy storage.");
      legacy = true;
    }
    const label = vault.label.trim().toLocaleLowerCase();
    if (labels.has(label)) throw new Error("The saved vault registry repeats a connection name.");
    labels.add(label);
    seen.add(vault.id);
  }
  if (Object.keys(value).some((key) => !["schemaVersion", "revision", "vaults"].includes(key))) {
    throw new Error("The saved vault registry uses an unsupported format.");
  }
  return value;
}

export function readRegularJson(filename, { optional = false, maximumBytes = 128 * 1024 } = {}) {
  let descriptor;
  try {
    descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > maximumBytes) throw new Error("Saved vault state is not a bounded regular file.");
    return JSON.parse(fs.readFileSync(descriptor, "utf8"));
  } catch (error) {
    if (optional && error.code === "ENOENT") return null;
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

export function vaultPaths(vault, roots = {}) {
  if (!identifier.test(vault?.id) || !["legacy", "managed"].includes(vault?.layout))
    throw new Error("Invalid vault identity.");
  const runtime = roots.runtime || "/runtime";
  const liveSync = roots.liveSync || "/livesync-runtime";
  const database = roots.database || "/livesync-db";
  const home = roots.home || "/home/obsidian";
  const vaults = roots.vaults || "/vaults";
  if (vault.layout === "legacy") {
    return { vault: roots.legacyVault || "/vault", runtime, liveSync, database, home };
  }
  return {
    vault: path.join(vaults, vault.id),
    runtime: path.join(runtime, "vaults", vault.id),
    liveSync: path.join(liveSync, "vaults", vault.id),
    database: path.join(database, "vaults", vault.id),
    home: path.join(home, ".config", "vaults", vault.id)
  };
}

export function readRegistry(runtime = "/runtime") {
  return validateRegistry(readRegularJson(path.join(runtime, "vaults.json")));
}

function writeRegistry(runtime, registry) {
  validateRegistry(registry);
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  const filename = path.join(runtime, "vaults.json");
  const temporary = path.join(runtime, `.vaults-${randomUUID()}.json`);
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(registry)}\n`);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    fs.renameSync(temporary, filename);
    const directory = fs.openSync(runtime, "r");
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

// The single supervisor is the only registry writer. API and MCP never create a
// missing registry or infer permissions from directories that happen to exist.
export function initializeRegistry({
  runtime = "/runtime",
  legacySource = null,
  legacyLabel = "Existing vault",
  legacyVault = "/vault"
} = {}) {
  try {
    return readRegistry(runtime);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!legacySource) {
    const savedCredentials = ["enrollment.json", "vault-binding.json", "secrets.json"].some((name) =>
      fs.existsSync(path.join(runtime, name))
    );
    const hasFiles = fs.existsSync(legacyVault) && fs.readdirSync(legacyVault).length > 0;
    if (savedCredentials || hasFiles) {
      throw new Error("Existing vault data needs an identified sync method before registry initialization.");
    }
  }
  const registry = { schemaVersion: 1, revision: 1, vaults: [] };
  if (legacySource) {
    if (!sources.has(legacySource)) throw new Error("Invalid legacy sync method.");
    registry.vaults.push({
      id: "existing",
      label: legacyLabel,
      source: legacySource,
      layout: "legacy",
      aiEnabled: true
    });
  }
  writeRegistry(runtime, registry);
  return registry;
}

export function planVaultAddition(runtime, expectedRevision, { label, source }, reservedId = `vault-${randomUUID()}`) {
  const registry = readRegistry(runtime);
  if (registry.revision !== expectedRevision)
    throw new Error("Vault connections changed. Refresh before adding another.");
  if (
    !sources.has(source) ||
    typeof label !== "string" ||
    !label.trim() ||
    label.trim().length > 120 ||
    /[\x00-\x1f\x7f]/.test(label)
  )
    throw new Error("Choose a vault name and a supported sync method.");
  if (registry.vaults.length >= maximumVaults) throw new Error("This installation has reached its 32-vault limit.");
  if (registry.vaults.some((vault) => vault.label.toLocaleLowerCase() === label.trim().toLocaleLowerCase())) {
    throw new Error("Choose a distinct name for this vault connection.");
  }
  if (!identifier.test(reservedId) || registry.vaults.some((vault) => vault.id === reservedId))
    throw new Error("Invalid or existing vault identity.");
  const vault = { id: reservedId, label: label.trim(), source, layout: "managed", aiEnabled: true };
  const next = { ...registry, revision: registry.revision + 1, vaults: [...registry.vaults, vault] };
  return { vault, registry: next };
}

export function addVault(runtime, expectedRevision, values, reservedId) {
  const planned = planVaultAddition(runtime, expectedRevision, values, reservedId);
  writeRegistry(runtime, planned.registry);
  return planned.vault;
}

export function availableVaults({ runtime = "/runtime", roots = {} } = {}) {
  const registry = readRegistry(runtime);
  const available = [];
  for (const vault of registry.vaults) {
    if (!vault.aiEnabled) continue;
    const paths = vaultPaths(vault, { ...roots, runtime });
    let enrollment, status, binding;
    try {
      enrollment = readRegularJson(path.join(paths.runtime, "enrollment.json"), { optional: true });
      status = readRegularJson(path.join(paths.runtime, "status.json"), { optional: true });
      binding = readRegularJson(path.join(paths.runtime, "vault-binding.json"), { optional: true });
    } catch {
      // One damaged connection cannot grant access or hide unrelated vaults.
      continue;
    }
    if (!enrollment || !status || !binding || status.state !== "ready") continue;
    const source = enrollment.profile || "official";
    const remoteId = source === "livesync" ? enrollment.database : enrollment.remoteVault;
    if (
      source !== vault.source ||
      binding.version !== 1 ||
      Object.keys(binding).length !== 3 ||
      binding.profile !== source ||
      binding.vaultId !== remoteId ||
      typeof remoteId !== "string" ||
      !remoteId ||
      remoteId.length > 1024 ||
      /[\x00-\x1f\x7f]/.test(remoteId)
    )
      continue;
    if (typeof enrollment.scopePath !== "string" || !enrollment.scopePath.trim()) continue;
    const scope = enrollment.scopePath.trim().replace(/^\/+|\/+$/g, "");
    if (
      scope &&
      (scope.includes("\\") ||
        /[\x00-\x1f\x7f]/.test(scope) ||
        scope.split("/").some((part) => !part || part === "." || part === ".." || part.startsWith(".")))
    )
      continue;
    available.push({ id: vault.id, name: vault.label, source: vault.source, scopePath: enrollment.scopePath });
  }
  return available;
}

export function planVaultSettings(runtime, expectedRevision, id, values) {
  const registry = readRegistry(runtime);
  if (registry.revision !== expectedRevision) throw new Error("Vault connections changed. Refresh before saving.");
  const selected = registry.vaults.find((vault) => vault.id === id);
  if (!selected) throw new Error("Choose an existing vault connection.");
  if (
    typeof values.label !== "string" ||
    !values.label.trim() ||
    values.label.trim().length > 120 ||
    /[\x00-\x1f\x7f]/.test(values.label) ||
    typeof values.aiEnabled !== "boolean"
  ) {
    throw new Error("Choose a vault name and whether AI tools can access this vault.");
  }
  const label = values.label.trim();
  if (registry.vaults.some((vault) => vault.id !== id && vault.label.toLocaleLowerCase() === label.toLocaleLowerCase()))
    throw new Error("Choose a distinct name for this vault connection.");
  const vault = { ...selected, label, aiEnabled: values.aiEnabled };
  return {
    vault,
    registry: {
      ...registry,
      revision: registry.revision + 1,
      vaults: registry.vaults.map((existing) => (existing.id === id ? vault : existing))
    }
  };
}

export function updateVaultSettings(runtime, expectedRevision, id, values) {
  const planned = planVaultSettings(runtime, expectedRevision, id, values);
  writeRegistry(runtime, planned.registry);
  return planned.vault;
}
