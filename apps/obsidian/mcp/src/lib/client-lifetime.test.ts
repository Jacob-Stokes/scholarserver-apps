import assert from "node:assert/strict";
import test from "node:test";
import { ObsidianClient, ObsidianError } from "../obsidian-client.js";

test("the MCP request deadline remains active until the complete response body arrives", async (t) => {
  const scheduled: Array<() => void> = [];
  const cleared: unknown[] = [];
  t.mock.method(globalThis, "setTimeout", (callback: () => void) => {
    scheduled.push(callback);
    return scheduled.length;
  });
  t.mock.method(globalThis, "clearTimeout", (timer: unknown) => {
    cleared.push(timer);
  });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_input: unknown, init: RequestInit) => {
    calls += 1;
    const signal = init.signal!;
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), {
            once: true
          });
        }
      })
    );
  });
  const request = new ObsidianClient("http://synthetic.invalid", "synthetic").put("/api/files/Test.md", {
    content: "fixture"
  });
  const rejected = assert.rejects(
    request,
    (error: unknown) => error instanceof ObsidianError && error.status === 0 && /timeout/.test(error.message)
  );
  try {
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.equal(cleared.length, 0, "Receiving headers does not complete the request");
  } finally {
    scheduled[0]!();
    await rejected;
  }
  assert.equal(calls, 1, "An uncertain write must not be replayed");
  assert.equal(cleared.length, 1);
});

test("successful JSON, text and empty responses release their request deadline", async (t) => {
  const timers = new Set<unknown>();
  let nextTimer = 0;
  t.mock.method(globalThis, "setTimeout", () => {
    const timer = ++nextTimer;
    timers.add(timer);
    return timer;
  });
  t.mock.method(globalThis, "clearTimeout", (timer: unknown) => {
    timers.delete(timer);
  });
  const responses = [
    Response.json({ ok: true }),
    new Response("# Synthetic note"),
    new Response(null, { status: 204 })
  ];
  t.mock.method(globalThis, "fetch", async () => responses.shift()!);
  const client = new ObsidianClient("http://synthetic.invalid", "synthetic");
  assert.deepEqual(await client.get("/api/status"), { ok: true });
  assert.equal(await client.get("/api/files/Test.md"), "# Synthetic note");
  assert.equal(await client.delete("/api/files/Test.md"), null);
  assert.equal(timers.size, 0);
});
