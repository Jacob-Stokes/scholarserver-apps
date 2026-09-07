import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { MetadataHttp } from "./http.mjs";
import { LiteratureClient, parseAtom } from "./metadata.mjs";
import { literatureTools } from "./tools.mjs";

const record = { DOI: "10.1234/example", title: ["Synthetic title"], author: [{ given: "A", family: "Example" }] };
const atom = (id = "2401.01234v2") =>
  `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:os="http://a9.com/-/spec/opensearch/1.1/"><os:totalResults>1</os:totalResults><entry><id>http://arxiv.org/abs/${id}</id><title>Version &amp; metadata</title><updated>2024-02-01T00:00:00Z</updated><published>2024-01-01T00:00:00Z</published></entry></feed>`;

test("Crossref search preserves provenance and ambiguity, bounds results and requests", async () => {
  let destination;
  const client = new LiteratureClient(
    new MetadataHttp({
      fetchImpl: async (url, options) => {
        destination = url;
        assert.equal(options.redirect, "error");
        return Response.json({ message: { items: [record], "total-results": 200 } });
      }
    })
  );
  const result = await client.execute("crossref_search", { query: "Synthetic title", limit: 1 });
  assert.equal(destination.host, "api.crossref.org");
  assert.equal(destination.searchParams.get("rows"), "1");
  assert.equal(result.partial, true);
  assert.match(result.ambiguity, /not a confirmed match/);
  assert.equal(result.records[0].doi, record.DOI);
  assert.equal(result.input.start, 0);
  assert.ok(result.retrievedAt);
});

test("invalid DOI, URLs, extra fields and unbounded paging make no network requests", async () => {
  const client = new LiteratureClient(
    new MetadataHttp({
      fetchImpl: () => {
        throw new Error("must not fetch");
      }
    })
  );
  for (const doi of ["https://evil.test", "10.1234/a?url=foo", "10.1234/a\nb"]) {
    await assert.rejects(client.execute("crossref_lookup", { doi }));
  }
  await assert.rejects(client.execute("arxiv_lookup", { id: "https://arxiv.org/abs/2401.01234" }));
  await assert.rejects(client.execute("crossref_search", { query: "x", start: 101 }));
  await assert.rejects(client.execute("crossref_search", { query: "x", limit: 11 }));
  await assert.rejects(client.execute("arxiv_search", { query: "x", url: "http://localhost" }));
});

test("arXiv parses modern and old IDs and preserves exact versions with fixed source links", async () => {
  for (const id of ["2401.01234v2", "hep-th/9901001v3"]) {
    const client = new LiteratureClient(new MetadataHttp({ fetchImpl: async () => new Response(atom(id)) }));
    const result = await client.execute("arxiv_lookup", { id });
    assert.equal(result.records[0].id, id);
    assert.equal(result.records[0].title, "Version & metadata");
    assert.equal(result.records[0].sourceArchiveUrl, `https://arxiv.org/src/${id}`);
    assert.equal(result.partial, false);
  }
});

test("arXiv rejects wrong returned version and malformed XML/DTD; no silent completeness", async () => {
  const client = new LiteratureClient(new MetadataHttp({ fetchImpl: async () => new Response(atom()) }));
  await assert.rejects(client.execute("arxiv_lookup", { id: "2401.01234v1" }), { code: "identity_mismatch" });
  assert.throws(() => parseAtom("<feed>"), { code: "invalid_metadata" });
  assert.throws(() => parseAtom('<!DOCTYPE feed [<!ENTITY x "boom">]><feed/>'), { code: "invalid_metadata" });
  assert.equal(parseAtom(atom("http://evil.test")).skipped, 1);
});

test("one in-flight request, source-specific spacing and Retry-After with no replay", async () => {
  let now = 0;
  let calls = 0;
  let release;
  const http = new MetadataHttp({
    now: () => now,
    fetchImpl: async () => {
      calls++;
      await new Promise((resolve) => {
        release = resolve;
      });
      return new Response("", { status: 429, headers: { "Retry-After": "120" } });
    }
  });
  const url = new URL("https://export.arxiv.org/api/query");
  const first = http.get("arxiv", url);
  await assert.rejects(http.get("arxiv", url), { code: "busy" });
  release();
  await assert.rejects(first, { code: "rate_limited", retryAfterMs: 120000 });
  now = 119999;
  await assert.rejects(http.get("arxiv", url), { code: "rate_limited" });
  assert.equal(calls, 1);
});

test("Crossref headers slow subsequent calls; contact is sent only to Crossref", async () => {
  let now = 0;
  const http = new MetadataHttp({
    now: () => now,
    contact: "test@example.org",
    fetchImpl: async (url, options) => {
      if (url.host === "api.crossref.org") assert.match(options.headers["User-Agent"], /mailto:test@example.org/);
      else assert.doesNotMatch(options.headers["User-Agent"], /mailto/);
      return new Response("{}", {
        headers: { "x-rate-limit-limit": "1", "x-rate-limit-interval": "20s", "x-concurrency-limit": "1" }
      });
    }
  });
  const url = new URL("https://api.crossref.org/works");
  await http.get("crossref", url);
  now = 1000;
  await assert.rejects(http.get("crossref", url), { code: "rate_limited" });
  await http.get("arxiv", new URL("https://export.arxiv.org/api/query"));
  now = 20000;
  await http.get("crossref", url);
});

test("bounded body and deadline, fixed HTTPS hosts and blocked source circuit", async () => {
  const oversized = new MetadataHttp({ fetchImpl: async () => new Response("x".repeat(1024 * 1024 + 1)) });
  const url = new URL("https://api.crossref.org/works");
  await assert.rejects(oversized.get("crossref", url), { code: "response_too_large" });
  await assert.rejects(oversized.get("crossref", new URL("https://127.0.0.1/")), { code: "invalid_destination" });
  const timeout = new MetadataHttp({
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) =>
      new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))))
  });
  await assert.rejects(timeout.get("crossref", url), { code: "timeout" });
  let calls = 0;
  const blocked = new MetadataHttp({
    fetchImpl: async () => {
      calls++;
      return new Response("secret upstream body", { status: 403 });
    }
  });
  await assert.rejects(blocked.get("crossref", url), { code: "upstream_blocked" });
  await assert.rejects(blocked.get("crossref", url), { code: "upstream_blocked" });
  assert.equal(calls, 1);
});

test("tool names match draft namespace; all four are read-only with validated input", async () => {
  const tools = literatureTools(
    new LiteratureClient(new MetadataHttp({ fetchImpl: async () => new Response("private", { status: 404 }) }))
  );
  assert.equal(tools.length, 4);
  const manifest = await readFile(new URL("../development/scholarserver-app.yaml", import.meta.url), "utf8");
  assert.match(manifest, /namespace: literature/);
  for (const { def } of tools) {
    assert.match(def.name, /^literature_/);
    assert.equal(def.annotations.readOnlyHint, true);
    assert.equal(def.annotations.destructiveHint, false);
    assert.equal(def.inputSchema.safeParse({ arbitrary: true }).success, false);
  }
  const result = await tools[0].handler({ doi: "10.1234/example" });
  assert.equal(result.code, "not_found");
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("draft stays outside release discovery and uses unusable image placeholder", async () => {
  await assert.rejects(access(new URL("../package/scholarserver-app.yaml", import.meta.url)));
  await access(new URL("../RELEASE_BLOCKED.md", import.meta.url));
  const compose = await readFile(new URL("../development/compose.yaml", import.meta.url), "utf8");
  assert.match(compose, /RELEASE_BLOCKED:NO_APPROVED_CONNECTOR_IMAGE/);
  assert.doesNotMatch(compose, /ports:/);
});

test("deadline also aborts a stalled response body", async () => {
  const http = new MetadataHttp({
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("partial"));
            signal.addEventListener("abort", () => controller.error(new Error("aborted")));
          }
        })
      )
  });
  await assert.rejects(http.get("arxiv", new URL("https://export.arxiv.org/api/query")), { code: "timeout" });
});

test("Retry-After HTTP dates impose cooldown without exposing upstream bodies", async () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const http = new MetadataHttp({
    now: () => now,
    fetchImpl: async () =>
      new Response("private", {
        status: 503,
        headers: { "Retry-After": "Thu, 01 Jan 2026 00:02:00 GMT" }
      })
  });
  await assert.rejects(http.get("crossref", new URL("https://api.crossref.org/works")), {
    code: "rate_limited",
    retryAfterMs: 120000
  });
});

test("malformed optional Crossref fields do not discard other valid candidates", async () => {
  const client = new LiteratureClient(
    new MetadataHttp({
      fetchImpl: async () =>
        Response.json({
          message: {
            items: [{ ...record, author: [null], published: { "date-parts": [{}] } }, { DOI: "invalid" }],
            "total-results": 2
          }
        })
    })
  );
  const result = await client.execute("crossref_search", { query: "Synthetic" });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].published, null);
  assert.deepEqual(result.records[0].authors, []);
  assert.equal(result.skipped, 1);
  assert.equal(result.partial, true);
});
