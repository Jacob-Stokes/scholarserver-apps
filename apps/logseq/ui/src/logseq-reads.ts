import { ReadScope } from "@scholarserver/ui/read-resource";
import { readAccess } from "./private-connection";

/** The app chooses related readers; shared UI owns their lifecycle and access loss. */
export function createLogseqReads<T>(instanceId: string, readStatus: (signal: AbortSignal) => Promise<T>) {
  const scope = new ReadScope();
  const status = scope.create(readStatus, 2000);
  const sync = scope.create((signal) => readAccess(instanceId, "sync", false, signal));
  const editor = scope.create((signal) => readAccess(instanceId, "editor", false, signal));
  return { status, sync, editor, block: scope.block, accessSignal: scope.signal };
}

export type PrivateAddressReads = Pick<
  ReturnType<typeof createLogseqReads>,
  "sync" | "editor" | "block" | "accessSignal"
>;
