import type { EndpointAccessOption } from "@scholarserver/ui/endpoint-access";
import { ReadScope } from "@scholarserver/ui/read-resource";
import { type ReaderStatus, readReaderJson } from "./reader-status";

export type ReaderAppearanceValue = { style: "original" | "scholarserver" };
export type ReaderAddresses = {
  options: EndpointAccessOption[];
  selection?: { optionId: string; url: string | null } | null;
};

export function readerAppearance(value: ReaderAppearanceValue): ReaderAppearanceValue {
  if (!value || !["original", "scholarserver"].includes(value.style)) {
    throw new Error("Could not read the saved reader appearance.");
  }
  return value;
}

export function readerAddresses(value: ReaderAddresses): ReaderAddresses {
  if (
    !value ||
    !Array.isArray(value.options) ||
    value.options.some(
      (option) =>
        !option ||
        typeof option.id !== "string" ||
        typeof option.url !== "string" ||
        typeof option.label !== "string" ||
        !option.authentication
    )
  ) {
    throw new Error("Could not read the reader addresses.");
  }
  if (
    value.selection &&
    (typeof value.selection.optionId !== "string" ||
      (value.selection.url !== null && typeof value.selection.url !== "string"))
  ) {
    throw new Error("Could not read the saved reader address.");
  }
  return value;
}

/** One mounted reader owns informational snapshots; forms and writes remain in its panels. */
export function createReaderReads(base: string, instance: string | undefined) {
  const scope = new ReadScope();
  const addressEndpoint = `/api/v1/instances/${encodeURIComponent(instance ?? "")}/endpoints/reader/access-options`;
  async function read<T>(url: string, signal: AbortSignal, failure: string): Promise<T> {
    return readReaderJson<T>(await fetch(url, { signal }), failure);
  }
  const status = scope.create<ReaderStatus>((signal) =>
    read(`${base}/api/status`, signal, "Could not check FreshRSS.")
  );
  const appearance = scope.create<ReaderAppearanceValue>(async (signal) =>
    readerAppearance(await read(`${base}/api/appearance`, signal, "Could not load the reader appearance."))
  );
  const addresses = scope.create<ReaderAddresses>(async (signal) => {
    if (!instance) throw new Error("Open this application from ScholarServer to choose its reader address.");
    return readerAddresses(await read(addressEndpoint, signal, "Could not load the reader addresses."));
  });
  return { status, appearance, addresses, addressEndpoint, block: scope.block };
}
export type ReaderReads = ReturnType<typeof createReaderReads>;
