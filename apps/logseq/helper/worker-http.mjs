import transit from "transit-js";
import { GraphError } from "./operations.mjs";

export const keyword = transit.keyword;
export const symbol = transit.symbol;
export const uuid = transit.uuid;
export const list = (...values) => transit.list(values);
export const map = (values = {}) =>
  transit.map(Object.entries(values).flatMap(([key, value]) => [keyword(key), value]));

export function jsonValue(value) {
  if (transit.isKeyword(value)) return value.toString().slice(1);
  if (transit.isUUID(value) || transit.isSymbol(value)) return value.toString();
  if (transit.isMap(value)) {
    const entries = [];
    value.forEach((item, key) => entries.push([jsonValue(key), jsonValue(item)]));
    return Object.fromEntries(entries);
  }
  if (transit.isList(value)) return value.rep.map(jsonValue);
  if (transit.isTaggedValue(value)) {
    if (value.tag === "datascript/Entity") return jsonValue(value.rep);
    throw new GraphError("unsupported-value", "Logseq returned an unsupported data type.", 502);
  }
  if (transit.isSet(value)) {
    const result = [];
    value.forEach((item) => result.push(jsonValue(item)));
    return result;
  }
  if (Array.isArray(value)) return value.map(jsonValue);
  return value;
}

// The endpoint is discovered by the official CLI, never accepted from an MCP caller.
export class WorkerHttp {
  constructor({ endpoint, graph, root, fetchImpl = fetch }) {
    const url = new URL(endpoint["base-url"]);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      !url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      throw new GraphError("invalid-worker", "Logseq returned an unexpected local worker address.", 503);
    }
    if (
      endpoint.repo !== `logseq_db_${graph}` ||
      endpoint.revision !== "b09316a" ||
      endpoint["root-dir"] !== root ||
      !Number.isSafeInteger(endpoint.pid)
    ) {
      throw new GraphError("invalid-worker", "Logseq's worker does not match this graph or supported version.", 503);
    }
    this.endpoint = endpoint;
    this.url = url;
    this.fetch = fetchImpl;
  }

  async request(path, options, signal) {
    const response = await this.fetch(new URL(path, this.url), { ...options, signal, redirect: "error" });
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2_000_000)
          throw new GraphError("result-too-large", "The result is too large. Request a smaller page or search.", 413);
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel();
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }

  async check(signal) {
    const health = await this.request("/healthz", {}, signal);
    for (const key of ["repo", "pid", "revision", "root-dir"]) {
      if (health[key] !== this.endpoint[key])
        throw new GraphError(
          "worker-changed",
          "Logseq's worker changed. Restart the helper before making changes.",
          503
        );
    }
    if (health.status !== "ready") throw new GraphError("not-ready", "Logseq is not ready yet.", 503);
  }

  async invoke(method, args, signal) {
    const result = await this.request(
      "/v1/invoke",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method: `thread-api/${method}`,
          argsTransit: transit.writer("json").write([this.endpoint.repo, ...args])
        })
      },
      signal
    );
    if (!result.ok)
      throw new GraphError(
        "worker-rejected",
        "Logseq could not complete this operation. Check the graph before retrying a change.",
        502
      );
    return jsonValue(transit.reader("json").read(result.resultTransit));
  }
}
