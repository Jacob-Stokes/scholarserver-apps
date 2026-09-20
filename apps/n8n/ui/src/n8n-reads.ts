import { ReadAccessRequired, type ReadResource, ReadScope } from "@scholarserver/ui/read-resource";
import { catalogAppIcons } from "./app-icons";
import type { Application, Inventory, Run } from "./automation-types";
import type { ConnectionStatus } from "./ConnectionSetup";

export function createN8nReads(base: string) {
  const scope = new ReadScope();
  async function json<T>(url: string, init?: RequestInit): Promise<T> {
    const signal = init?.signal ? AbortSignal.any([init.signal, scope.signal]) : scope.signal;
    const response = await fetch(url, { ...init, signal });
    signal.throwIfAborted();
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.redirected ||
      response.headers.get("content-type")?.includes("text/html")
    ) {
      const error = new ReadAccessRequired("Open ScholarServer and sign in again, then retry.");
      scope.block(error.message);
      throw error;
    }
    const result = await response.json().catch(() => null);
    signal.throwIfAborted();
    if (!response.ok || result === null) {
      if (result?.code === "research_connection_required")
        throw new Error("Allow research app access in n8n Configuration before choosing apps.");
      throw new Error(result?.error ?? result?.detail ?? "The request could not be completed");
    }
    return result as T;
  }
  function request<T>(route: string, body?: unknown, signal?: AbortSignal) {
    return json<T>(`${base}/api/${route}`, {
      signal,
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", "x-requested-with": "ScholarServer" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }
  const status = scope.create<ConnectionStatus>(async (signal) => {
    const value = await request<ConnectionStatus>("status", undefined, signal);
    if (typeof value.connected !== "boolean" || typeof value.phase !== "string")
      throw new Error("Could not read n8n status.");
    return { connected: value.connected, phase: value.phase, ownerEmail: value.ownerEmail };
  }, 2000);
  const inventory = scope.create(async (signal) => {
    const value = await request<Inventory>("automations", undefined, signal);
    if (!Array.isArray(value.templates) || !Array.isArray(value.workflows) || !value.installations)
      throw new Error("Could not read automation inventory.");
    return value;
  }, 10000);
  const applications = scope.create(async (signal) => {
    const value = await request<Application[]>("research-applications", undefined, signal);
    if (!Array.isArray(value))
      throw new Error("Research app discovery returned an invalid response. Retry app discovery.");
    return value;
  }, 30000);
  const icons = scope.create(
    async (signal) => {
      const value = await json<{ applications?: unknown }>("/api/v1/catalog", { signal });
      return catalogAppIcons(value.applications);
    },
    60000,
    5000
  );
  const runReaders = new Map<string, ReadResource<Run[]>>();
  function runs(automationId: string) {
    let reader = runReaders.get(automationId);
    if (!reader) {
      reader = scope.create(async (signal) => {
        const result = await request<{ runs: Run[] }>(
          `runs?automationId=${encodeURIComponent(automationId)}`,
          undefined,
          signal
        );
        if (!Array.isArray(result.runs)) throw new Error("Could not read recent runs.");
        return result.runs;
      }, 10000);
      runReaders.set(automationId, reader);
    }
    return reader;
  }
  return { status, inventory, applications, icons, runs, request, json, accessSignal: scope.signal };
}
export type N8nReads = ReturnType<typeof createN8nReads>;
