import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const pending = new Map();

// Serialise writes to one file in this process. Readers see complete old or new
// contents. This is not a cross-process lock or a read/modify/write transaction.
export function atomicWrite(filePath, content, mode = 0o600) {
  const target = path.resolve(filePath);
  const operation = (pending.get(target) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, content, { mode, flag: "wx" });
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true }).catch(() => {});
      }
    });
  pending.set(target, operation);
  const clear = () => {
    if (pending.get(target) === operation) pending.delete(target);
  };
  operation.then(clear, clear);
  return operation;
}

export function atomicJson(filePath, value, mode = 0o600) {
  return atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`, mode);
}
