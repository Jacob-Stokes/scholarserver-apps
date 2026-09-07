import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/private-connection.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
});
const { connectPrivateAddresses, readAccess } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const address = (endpoint) => ({ options: [], selection: { url: `https://${endpoint}.example.test/` } });

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
