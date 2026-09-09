// The caller supplies an installation-owned address, never a browser-supplied URL.
// All mutations are single attempts: a lost response may hide a successful write.
export class N8nRequestError extends Error {
  constructor(message, { status = null, outcome = "rejected" } = {}) {
    super(message);
    this.name = "N8nRequestError";
    this.status = status;
    this.outcome = outcome;
  }
}

export class N8nClient {
  constructor({ baseUrl, apiKey, fetchImplementation = fetch, timeoutMs = 15000 }) {
    const address = new URL(baseUrl);
    if (
      !["http:", "https:"].includes(address.protocol) ||
      address.username ||
      address.password ||
      address.search ||
      address.hash
    ) {
      throw new Error("Invalid n8n installation address");
    }
    if (typeof apiKey !== "string" || !apiKey.trim() || /[\r\n]/.test(apiKey)) {
      throw new Error("An n8n API key is required");
    }
    this.address = `${address.href.replace(/\/$/, "")}/api/v1/`;
    this.apiKey = apiKey;
    this.fetchImplementation = fetchImplementation;
    this.timeoutMs = timeoutMs;
  }

  async request(route, { method = "GET", body } = {}) {
    const mutation = method !== "GET";
    let response;
    try {
      response = await this.fetchImplementation(`${this.address}${route}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { "X-N8N-API-KEY": this.apiKey, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new N8nRequestError("Could not confirm the n8n response", {
        outcome: mutation ? "unconfirmed" : "unavailable"
      });
    }
    if (!response.ok) {
      // Upstream error bodies can contain submitted credentials or workflow data.
      await response.body?.cancel();
      let outcome = "rejected";
      if (mutation && response.status >= 500) outcome = "unconfirmed";
      throw new N8nRequestError(`n8n returned HTTP ${response.status}`, { status: response.status, outcome });
    }
    if (response.status === 204) return null;
    try {
      if (!response.body) throw new Error("Missing response body");
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2 * 1024 * 1024) throw new Error("Response exceeds limit");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new N8nRequestError("n8n returned an unreadable response", {
        outcome: mutation ? "unconfirmed" : "unavailable"
      });
    }
  }

  listWorkflows(cursor) {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    return this.request(`workflows?${query}`);
  }

  getWorkflow(id) {
    return this.request(`workflows/${encodeURIComponent(id)}`);
  }

  createWorkflow(workflow) {
    return this.request("workflows", { method: "POST", body: workflow });
  }

  updateWorkflow(id, workflow) {
    return this.request(`workflows/${encodeURIComponent(id)}`, { method: "PUT", body: workflow });
  }

  setEnabled(id, enabled) {
    if (typeof enabled !== "boolean") throw new Error("Enabled must be a boolean");
    const operation = enabled ? "activate" : "deactivate";
    return this.request(`workflows/${encodeURIComponent(id)}/${operation}`, { method: "POST" });
  }

  listExecutions(workflowId) {
    const query = new URLSearchParams({ workflowId, limit: "20", includeData: "false" });
    return this.request(`executions?${query}`);
  }

  async createCredential({ name, type, data }) {
    const credential = await this.request("credentials", { method: "POST", body: { name, type, data } });
    if (typeof credential?.id !== "string") {
      throw new N8nRequestError("n8n did not return a credential reference", { outcome: "unconfirmed" });
    }
    // Never return upstream data, even if an upstream version adds it to responses.
    return { id: credential.id, name, type };
  }
}
