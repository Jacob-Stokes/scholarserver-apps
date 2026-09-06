import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { GraphRunner } from "./runner.mjs";

function fixture(onInput) {
  const calls = [];
  const spawnProcess = (executable, args, options) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {
      queueMicrotask(() => child.emit("close", null));
    };
    const input = [];
    child.stdin.on("data", (chunk) => input.push(chunk));
    child.stdin.on("finish", () => {
      const payload = JSON.parse(Buffer.concat(input).toString());
      calls.push({ executable, args, options, payload });
      onInput(child, payload);
    });
    return child;
  };
  const runner = new GraphRunner({ graph: "Proof", spawnProcess, timeoutMs: 100 });
  return { runner, calls };
}

function finish(child, data = { result: [123] }) {
  child.stdout.write(JSON.stringify({ status: "ok", data }));
  child.emit("close", 0);
}

test("content travels through stdin, never process arguments", async () => {
  const { runner, calls } = fixture(finish);
  await runner.run(["upsert", "block", "--content", "private research"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.length, 1);
  assert.ok(!JSON.stringify(calls[0].args).includes("private research"));
  assert.ok(calls[0].payload.includes("private research"));
  assert.equal(calls[0].options.env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(calls[0].options.shell, undefined);
});

test("commands serialize, including after a failed operation", async () => {
  let running = 0;
  let maximum = 0;
  const { runner } = fixture((child, payload) => {
    running++;
    maximum = Math.max(maximum, running);
    setTimeout(() => {
      running--;
      if (payload.at(-1) === "fail") {
        child.stdout.write(JSON.stringify({ status: "error", error: "SECRET" }));
        child.emit("close", 1);
      } else finish(child);
    }, 5);
  });
  const results = await Promise.allSettled([runner.run(["fail"]), runner.run(["ok"]), runner.run(["ok"])]);
  assert.equal(maximum, 1);
  assert.equal(results[0].status, "rejected");
  assert.doesNotMatch(results[0].reason.message, /SECRET/);
  assert.equal(results[2].status, "fulfilled");
});

test("a timeout reports an unknown outcome and does not repeat the write", async () => {
  const { runner, calls } = fixture(() => {});
  runner.timeoutMs = 10;
  await assert.rejects(runner.run(["upsert", "block"]), (error) => error.code === "outcome-unknown");
  assert.equal(calls.length, 1);
});

test("large results are bounded", async () => {
  const { runner } = fixture((child) => child.stdout.write("x".repeat(1000)));
  runner.maximumOutput = 100;
  await assert.rejects(runner.run(["show"]), (error) => error.code === "result-too-large");
});

test("queue admission is bounded", async () => {
  const { runner, calls } = fixture(() => {});
  runner.timeoutMs = 5;
  const pending = Array.from({ length: 16 }, () => runner.run(["show"]).catch((error) => error));
  await assert.rejects(runner.run(["show"]), (error) => error.code === "busy");
  await Promise.all(pending);
  assert.ok(calls.length < 16, "Expired queued operations must not execute later");
});

test("UTF-8 characters spanning process output chunks remain intact", async () => {
  const value = { title: "Research 🧪 αβγ" };
  const { runner } = fixture((child) => {
    const bytes = Buffer.from(JSON.stringify({ status: "ok", data: value }));
    for (const byte of bytes) child.stdout.write(Buffer.from([byte]));
    child.emit("close", 0);
  });
  assert.deepEqual(await runner.run(["show"]), value);
});
