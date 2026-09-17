import { constants } from "node:fs";
import { open, readdir } from "node:fs/promises";
import path from "node:path";

const recoveryMessage =
  "The saved vault connection needs recovery. Do not repeat setup or replace its files. Restore this installation's connection records, or add a separate Obsidian installation for another vault.";
const replacementMessage =
  "This installation is already assigned to a vault. Use Configuration to check it. To connect a different vault, add a separate Obsidian installation with its own permissions.";

async function readRecord(file) {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile() || info.size > 16_384) throw new Error(recoveryMessage);
    const record = JSON.parse(await handle.readFile("utf8"));
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(recoveryMessage);
    return record;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(recoveryMessage);
  } finally {
    await handle?.close();
  }
}

function identity(profile, vaultId) {
  if (
    (profile !== "official" && profile !== "livesync") ||
    typeof vaultId !== "string" ||
    vaultId.length === 0 ||
    vaultId.length > 1024 ||
    /[\x00-\x1f\x7f]/.test(vaultId)
  ) {
    throw new Error(recoveryMessage);
  }
  return { version: 1, profile, vaultId };
}

function enrollmentIdentity(enrollment) {
  const profile = enrollment.profile === undefined ? "official" : enrollment.profile;
  return identity(profile, profile === "livesync" ? enrollment.database : enrollment.remoteVault);
}

function sameIdentity(left, right) {
  return left.profile === right.profile && left.vaultId === right.vaultId;
}

function isPristineWorkerStatus(status) {
  return (
    Object.keys(status).length === 5 &&
    status.state === "waiting" &&
    status.running === false &&
    status.activeRevision === null &&
    status.lastError === null &&
    status.lastStartedAt === null
  );
}

// One controller owns this installation. Persist the reservation before any
// remote setup so a restart or lost acknowledgement cannot select another vault.
// Manager still owns who may use it; this record never grants access.
export function createVaultBinding({ runtimePath, liveSyncRuntimePath, vaultPath }) {
  const bindingPath = path.join(runtimePath, "vault-binding.json");
  const enrollmentPath = path.join(runtimePath, "enrollment.json");

  async function readBinding() {
    const record = await readRecord(bindingPath);
    if (record === null) return null;
    if (record.version !== 1 || Object.keys(record).length !== 3) throw new Error(recoveryMessage);
    return identity(record.profile, record.vaultId);
  }

  async function claim(value) {
    let handle;
    try {
      handle = await open(bindingPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(value)}\n`);
      await handle.sync();
    } catch (error) {
      if (error.code === "EEXIST") throw new Error(replacementMessage);
      throw new Error(recoveryMessage);
    } finally {
      await handle?.close();
    }
    try {
      const directory = await open(runtimePath, constants.O_RDONLY | constants.O_DIRECTORY);
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } catch {
      throw new Error(recoveryMessage);
    }
  }

  async function requireEmptyReplica() {
    try {
      if ((await readdir(vaultPath)).length !== 0) throw new Error(recoveryMessage);
      for (const name of ["livesync-worker.json", "livesync-onboarding.json"]) {
        if ((await readRecord(path.join(liveSyncRuntimePath, name))) !== null) throw new Error(recoveryMessage);
      }
      // The separate worker publishes this exact initial status before any
      // setup. A waiting worker with a prior start or revision is not pristine.
      const worker = await readRecord(path.join(liveSyncRuntimePath, "livesync-worker-status.json"));
      if (worker !== null && !isPristineWorkerStatus(worker)) throw new Error(recoveryMessage);
    } catch {
      throw new Error(recoveryMessage);
    }
  }

  async function restore() {
    const enrollment = await readRecord(enrollmentPath);
    const binding = await readBinding();
    if (enrollment) {
      const saved = enrollmentIdentity(enrollment);
      if (binding && !sameIdentity(binding, saved)) throw new Error(recoveryMessage);
      if (!binding) await claim(saved);
      return enrollment;
    }
    if (binding) {
      // Official Sync can retry an incomplete pull only for the same remote ID.
      // LiveSync provisioning has no such reconciliation API: never create a
      // second database after an uncertain first attempt.
      if (binding.profile === "livesync") throw new Error(recoveryMessage);
      return null;
    }
    await requireEmptyReplica();
    return null;
  }

  async function begin(value) {
    const requested = identity(value.profile, value.vaultId);
    if (await readRecord(enrollmentPath)) throw new Error(replacementMessage);
    const binding = await readBinding();
    if (binding) {
      if (binding.profile === "official" && sameIdentity(binding, requested)) return;
      throw new Error(replacementMessage);
    }
    await requireEmptyReplica();
    await claim(requested);
  }

  async function assertCurrent() {
    const enrollment = await readRecord(enrollmentPath);
    const binding = await readBinding();
    if (!enrollment || !binding || !sameIdentity(enrollmentIdentity(enrollment), binding)) {
      throw new Error(recoveryMessage);
    }
  }

  return { restore, begin, assertCurrent };
}
