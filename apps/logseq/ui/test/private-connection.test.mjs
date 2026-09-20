import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

function moduleUrl(source) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const shared = moduleUrl(await readFile(new URL(import.meta.resolve("@scholarserver/ui/read-resource")), "utf8"));
const source = (await readFile(new URL("../src/private-connection.ts", import.meta.url), "utf8")).replace(
  '"@scholarserver/ui/read-resource"',
  JSON.stringify(shared)
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
});
const { connectPrivateAddresses, readAccess } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const address = (endpoint) => ({ options: [], selection: { url: `https://${endpoint}.example.test/` } });
const { ReadAccessRequired } = await import(shared);

test("both routes must exist before the notebook address is configured", async () => {
  const calls = [];
  const editor = await connectPrivateAddresses({
    browserAvailable: true,
    signal: new AbortController().signal,
    access: async (endpoint) => {
      calls.push(endpoint);
      return address(endpoint);
    },
    configure: async (url) => calls.push(url)
  });
  assert.deepEqual(calls, ["sync", "editor", "https://sync.example.test/"]);
  assert.equal(editor, "https://editor.example.test/");
});

test("a failed editor route stops setup; an explicit retry reuses the stable sync address", async () => {
  let failEditor = true;
  const configured = [];
  const options = {
    browserAvailable: true,
    signal: new AbortController().signal,
    access: async (endpoint) => {
      if (endpoint === "editor" && failEditor) throw new Error("route unavailable");
      return address(endpoint);
    },
    configure: async (url) => configured.push(url)
  };
  await assert.rejects(connectPrivateAddresses(options), /route unavailable/);
  assert.deepEqual(configured, []);
  failEditor = false;
  await connectPrivateAddresses(options);
  assert.deepEqual(configured, ["https://sync.example.test/"]);
});

test("navigation cancellation stops subsequent writes even if a request ignores abort", async () => {
  const controller = new AbortController();
  const calls = [];
  await assert.rejects(
    connectPrivateAddresses({
      browserAvailable: true,
      signal: controller.signal,
      access: async (endpoint) => {
        calls.push(endpoint);
        controller.abort();
        return address(endpoint);
      },
      configure: async () => calls.push("configure")
    }),
    { name: "AbortError" }
  );
  assert.deepEqual(calls, ["sync"]);
});

test("devices-only setup never requests an editor", async () => {
  const calls = [];
  const editor = await connectPrivateAddresses({
    browserAvailable: false,
    signal: new AbortController().signal,
    access: async (endpoint) => {
      calls.push(endpoint);
      return address(endpoint);
    },
    configure: async () => calls.push("configure")
  });
  assert.deepEqual(calls, ["sync", "configure"]);
  assert.equal(editor, null);
});

test("authentication and conflict failures are classified without exposing upstream output", async () => {
  for (const [status, message] of [
    [401, /sign in again/],
    [403, /sign in again/],
    [409, /another change/],
    [500, /activity/]
  ]) {
    await assert.rejects(
      readAccess(
        "logseq",
        "sync",
        false,
        new AbortController().signal,
        async () => new Response("sensitive upstream diagnostic", { status })
      ),
      message
    );
  }
});

test("a lost write response is not retried and does not claim the address was unsaved", async () => {
  let calls = 0;
  await assert.rejects(
    readAccess("logseq", "sync", true, new AbortController().signal, async () => {
      calls++;
      throw new Error("private network details");
    }),
    /may already be saved/
  );
  assert.equal(calls, 1);
});

test("HTML or incomplete success responses cannot advance setup", async () => {
  for (const body of ["<html>Login</html>", "{}", '{"options":[]}']) {
    await assert.rejects(
      readAccess("logseq", "sync", false, new AbortController().signal, async () => new Response(body)),
      /incomplete/
    );
  }
});

test("login redirects and HTML revoke access without following an external redirect", async () => {
  for (const response of [
    new Response("", { status: 302, headers: { location: "https://login.example.test" } }),
    new Response("Login", { headers: { "content-type": "text/html" } })
  ]) {
    await assert.rejects(
      readAccess("logseq", "sync", false, new AbortController().signal, async (_url, init) => {
        assert.equal(init.redirect, "manual");
        return response;
      }),
      ReadAccessRequired
    );
  }
});

const readsSource = (await readFile(new URL("../src/logseq-reads.ts", import.meta.url), "utf8"))
  .replace('"@scholarserver/ui/read-resource"', JSON.stringify(shared))
  .replace('"./private-connection"', JSON.stringify(moduleUrl(source)));
const { createLogseqReads } = await import(moduleUrl(readsSource));

test("address readers settle independently and never provision while discovering", async (t) => {
  let releaseEditor;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(init.method, "GET");
    if (url.includes("/editor/"))
      await new Promise((resolve) => {
        releaseEditor = resolve;
      });
    return Response.json(address(url.includes("/editor/") ? "editor" : "sync"));
  });
  const reads = createLogseqReads("logseq", async () => ({ ready: true }));
  const editor = reads.editor.refresh();
  await reads.sync.refresh();
  await reads.status.refresh();
  assert.equal(reads.sync.getSnapshot().data.selection.url, "https://sync.example.test/");
  assert.equal(reads.status.getSnapshot().data.ready, true);
  assert.equal(reads.editor.getSnapshot().pending, true);
  releaseEditor();
  await editor;
});

test("an address denial clears status and aborts a multi-step setup before its next write", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 401 }));
  const reads = createLogseqReads("logseq", async () => ({ ready: true }));
  await reads.status.refresh();
  let releaseWrite;
  const calls = [];
  const setup = connectPrivateAddresses({
    browserAvailable: true,
    signal: reads.accessSignal,
    access: async (endpoint) => {
      calls.push(endpoint);
      await new Promise((resolve) => {
        releaseWrite = resolve;
      });
      return address(endpoint);
    },
    configure: async () => calls.push("configure")
  });
  await reads.editor.refresh();
  releaseWrite();
  await assert.rejects(setup, { name: "AbortError" });
  assert.deepEqual(calls, ["sync"]);
  assert.equal(reads.status.getSnapshot().data, undefined);
  assert.equal(reads.sync.getSnapshot().blocked, true);
});
