import { lstat, readFile } from "node:fs/promises";

export class PaperlessError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export async function readSecret(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.size > 4096 || (info.mode & 0o077) !== 0) {
    throw new PaperlessError("private_secret_file_required");
  }
  const value = (await readFile(file, "utf8")).trim();
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(value)) throw new PaperlessError("invalid_secret");
  return value;
}

export class PaperlessClient {
  constructor(tokenFile, fetchImpl = fetch) {
    this.tokenFile = tokenFile;
    this.fetch = fetchImpl;
    this.inflight = 0;
  }

  // Only named methods build paths; tool callers never supply hosts, URLs or headers.
  async request(path) {
    const token = await readSecret(this.tokenFile);
    if (this.inflight >= 4) throw new PaperlessError("busy");
    this.inflight += 1;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 10_000);
    try {
      const response = await this.fetch(`http://paperless:8000/api/${path}`, {
        method: "GET",
        headers: { Authorization: `Token ${token}`, Accept: "application/json" },
        redirect: "error",
        signal: abort.signal
      });
      if (response.status === 401 || response.status === 403) throw new PaperlessError("access_denied");
      if (response.status === 404) throw new PaperlessError("not_found_or_not_visible");
      if (!response.ok) throw new PaperlessError("upstream_unavailable");
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new PaperlessError("invalid_upstream_response");
      }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > 1_048_576) {
          abort.abort();
          throw new PaperlessError("response_too_large");
        }
        chunks.push(Buffer.from(chunk));
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
      if (error instanceof PaperlessError) throw error;
      throw new PaperlessError("upstream_unavailable");
    } finally {
      clearTimeout(timeout);
      abort.abort();
      this.inflight -= 1;
    }
  }

  async search(query, page, limit) {
    const params = new URLSearchParams({ query, page: String(page), page_size: String(limit) });
    const value = await this.request(`documents/?${params}`);
    if (!Array.isArray(value.results) || value.results.length > limit) {
      throw new PaperlessError("invalid_upstream_response");
    }
    return {
      untrusted: true,
      documents: value.results.map(metadata),
      nextPage: value.next ? page + 1 : null
    };
  }

  async document(id, text = false) {
    const value = await this.request(`documents/${id}/`);
    if (value.id !== id) throw new PaperlessError("invalid_upstream_response");
    const result = { untrusted: true, document: metadata(value) };
    if (text) {
      const content = typeof value.content === "string" ? value.content : "";
      result.text = content.slice(0, 32_000);
      result.truncated = content.length > 32_000;
    }
    return result;
  }
}

function metadata(value) {
  if (!Number.isSafeInteger(value.id) || value.id < 1) throw new PaperlessError("invalid_upstream_response");
  return { id: value.id, title: String(value.title ?? "").slice(0, 500) };
}
