export class MetadataError extends Error {
  constructor(code, retryAfterMs = null) {
    super(code);
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

// One connector process owns both source gates; callers never queue or retry.
export class MetadataHttp {
  constructor({ fetchImpl = fetch, now = Date.now, contact = "", timeoutMs = 15000 } = {}) {
    this.fetch = fetchImpl;
    this.now = now;
    this.contact = contact;
    this.timeoutMs = timeoutMs;
    this.gates = {
      crossref: { busy: false, next: 0, delay: 1000, host: "api.crossref.org" },
      arxiv: { busy: false, next: 0, delay: 3100, host: "export.arxiv.org" }
    };
  }

  async get(source, url) {
    const gate = this.gates[source];
    if (!gate || url.protocol !== "https:" || url.hostname !== gate.host || url.port || url.username || url.password)
      throw new MetadataError("invalid_destination");
    if (gate.blocked) throw new MetadataError("upstream_blocked");
    if (gate.busy) throw new MetadataError("busy", gate.delay);
    if (this.now() < gate.next) throw new MetadataError("rate_limited", gate.next - this.now());
    gate.busy = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = {
        "User-Agent": "ScholarServer-Literature-Draft/0.0.0",
        Accept: "application/json, application/atom+xml"
      };
      if (this.contact && source === "crossref") headers["User-Agent"] += ` (mailto:${this.contact})`;
      const response = await this.fetch(url, { headers, redirect: "error", signal: controller.signal });
      const interval = /^(\d+(?:\.\d+)?)s$/.exec(response.headers.get("x-rate-limit-interval") ?? "");
      const limit = Number(response.headers.get("x-rate-limit-limit"));
      if (source === "crossref" && interval && limit > 0)
        gate.delay = Math.max(gate.delay, Math.ceil((Number(interval[1]) * 1000) / limit));
      if (response.status === 429 || response.status === 503) {
        const retry = response.headers.get("retry-after");
        let delay = 60000;
        if (retry && /^\d+$/.test(retry)) delay = Math.max(delay, Number(retry) * 1000);
        else if (retry && Number.isFinite(Date.parse(retry))) delay = Math.max(delay, Date.parse(retry) - this.now());
        gate.next = this.now() + delay;
        await response.body?.cancel();
        throw new MetadataError("rate_limited", delay);
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 403) {
          gate.blocked = true;
          throw new MetadataError("upstream_blocked");
        }
        throw new MetadataError(response.status === 404 ? "not_found" : "upstream_unavailable");
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > 1024 * 1024) {
          controller.abort();
          throw new MetadataError("response_too_large");
        }
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString("utf8");
    } catch (error) {
      if (error instanceof MetadataError) throw error;
      if (controller.signal.aborted) throw new MetadataError("timeout");
      throw new MetadataError("upstream_unavailable");
    } finally {
      clearTimeout(timer);
      gate.next = Math.max(gate.next, this.now() + gate.delay);
      gate.busy = false;
    }
  }
}
