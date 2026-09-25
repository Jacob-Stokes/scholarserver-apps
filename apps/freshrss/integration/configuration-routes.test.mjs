import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { ConfigurationActions } from "@scholarserver/controller-runtime/configuration-actions";
import { handleConfiguration } from "./configuration-routes.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "freshrss-routes-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let style = "original";
  let writes = 0;
  const setup = {
    status: async () => ({ phase: "ready", ready: true, username: "researcher", signIn: "scholarserver" }),
    appearance: async () => ({ style }),
    saveAppearance: async (values) => {
      style = values.style;
      writes += 1;
    }
  };
  const actions = new ConfigurationActions(directory, "appearance");
  async function request(method, url, input, authorized = true) {
    const raw = input === undefined ? "" : JSON.stringify(input);
    const stream = Readable.from(raw ? [Buffer.from(raw)] : []);
    stream.method = method;
    stream.url = url;
    stream.headers = {
      "content-type": "application/json",
      ...(authorized ? { "x-requested-with": "ScholarServer" } : {})
    };
    const response = {
      status: null,
      headers: null,
      body: null,
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
      },
      end(body) {
        this.body = JSON.parse(body);
      }
    };
    await handleConfiguration(stream, response, setup, actions);
    return response;
  }
  return {
    actions,
    request,
    setup,
    get writes() {
      return writes;
    }
  };
}

test("FreshRSS configuration handler authorizes evaluation and preserves secret-free sections", async (t) => {
  const context = await fixture(t);
  const section = await context.request("GET", "/api/configuration/appearance");
  assert.equal(section.status, 200);
  assert.equal(section.body.values.style, "original");
  const unauthorized = await context.request("POST", "/api/configuration/appearance/evaluate", { values: {} }, false);
  assert.equal(unauthorized.status, 403);
  const evaluated = await context.request("POST", "/api/configuration/appearance/evaluate", {
    values: { password: "sensitive" }
  });
  assert.equal(evaluated.status, 200);
  assert.equal(JSON.stringify(evaluated.body).includes("sensitive"), false);
});

test("FreshRSS configuration handler rejects bad input before receipt and reads duplicate result", async (t) => {
  const context = await fixture(t);
  const section = (await context.request("GET", "/api/configuration/appearance")).body;
  const base = { requestId: "request-12345678", expectedRevision: section.revision };
  const invalid = await context.request("POST", "/api/configuration/appearance/actions/save-appearance", {
    ...base,
    values: { style: "unsupported" }
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body, {
    requestId: base.requestId,
    actionId: "save-appearance",
    status: "rejected-before-change"
  });
  assert.equal(await context.actions.read(base.requestId), null);
  const input = { ...base, requestId: "request-87654321", values: { style: "scholarserver" } };
  const saved = await context.request("POST", "/api/configuration/appearance/actions/save-appearance", input);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body, { requestId: input.requestId, actionId: "save-appearance", status: "succeeded" });
  assert.deepEqual(
    (await context.request("POST", "/api/configuration/appearance/actions/save-appearance", input)).body,
    saved.body
  );
  assert.deepEqual(
    (await context.request("GET", `/api/configuration/appearance/operations/${input.requestId}`)).body,
    saved.body
  );
  assert.equal(context.writes, 1);
  const stale = await context.request("POST", "/api/configuration/appearance/actions/save-appearance", {
    ...input,
    requestId: "request-99999999"
  });
  assert.equal(stale.status, 409);
  assert.equal(context.writes, 1);
});

test("FreshRSS uncertain app save returns a safe receipt and blocks another write", async (t) => {
  const context = await fixture(t);
  context.setup.saveAppearance = async () => {
    throw new Error("raw sensitive upstream detail");
  };
  const section = (await context.request("GET", "/api/configuration/appearance")).body;
  const input = {
    requestId: "request-12345678",
    expectedRevision: section.revision,
    values: { style: "scholarserver" }
  };
  const result = await context.request("POST", "/api/configuration/appearance/actions/save-appearance", input);
  assert.deepEqual(result.body, { requestId: input.requestId, actionId: "save-appearance", status: "unconfirmed" });
  assert.equal(JSON.stringify(result.body).includes("raw sensitive"), false);
  const next = await context.request("POST", "/api/configuration/appearance/actions/save-appearance", {
    ...input,
    requestId: "request-87654321"
  });
  assert.equal(next.status, 409);
});

test("successful save keeps its receipt if a later section read fails", async (t) => {
  const context = await fixture(t);
  const section = (await context.request("GET", "/api/configuration/appearance")).body;
  const originalSave = context.setup.saveAppearance;
  context.setup.saveAppearance = async (values) => {
    await originalSave(values);
    context.setup.appearance = async () => {
      throw new Error("later status read failed");
    };
  };
  const input = {
    requestId: "request-12345678",
    expectedRevision: section.revision,
    values: { style: "scholarserver" }
  };
  const saved = await context.request("POST", "/api/configuration/appearance/actions/save-appearance", input);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.status, "succeeded");
  assert.equal((await context.request("GET", "/api/configuration/appearance")).status, 502);
  assert.deepEqual(
    (await context.request("GET", "/api/configuration/appearance/operations/request-12345678")).body,
    saved.body
  );
  assert.deepEqual(
    (await context.request("POST", "/api/configuration/appearance/actions/save-appearance", input)).body,
    saved.body
  );
  assert.equal(context.writes, 1);
});
