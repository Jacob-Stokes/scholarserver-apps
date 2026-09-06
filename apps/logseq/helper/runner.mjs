import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GraphError, validateGraphName } from "./operations.mjs";

export class GraphRunner {
  #tail = Promise.resolve();
  #pending = 0;

  constructor({
    graph,
    root = "/graph",
    executable = "/opt/logseq/logseq",
    bridge = fileURLToPath(new URL("./cli-bridge.cjs", import.meta.url)),
    timeoutMs = 60_000,
    maximumOutput = 2_000_000,
    spawnProcess = spawn
  }) {
    this.graph = validateGraphName(graph);
    this.root = root;
    this.executable = executable;
    this.bridge = bridge;
    this.timeoutMs = timeoutMs;
    this.maximumOutput = maximumOutput;
    this.spawnProcess = spawnProcess;
  }

  run(command, { signal } = {}) {
    if (this.#pending >= 16) return Promise.reject(new GraphError("busy", "Logseq is busy. Try again shortly.", 503));
    this.#pending += 1;
    const admittedAt = Date.now();
    const result = this.#tail.then(() => {
      if (signal?.aborted) throw new GraphError("cancelled", "The operation was cancelled.", 409);
      const remaining = this.timeoutMs - (Date.now() - admittedAt);
      if (remaining <= 0) {
        throw new GraphError("busy", "Logseq was busy. This operation was not started; try again.", 503);
      }
      return this.#execute(command, remaining, signal);
    });
    this.#tail = result.catch(() => {});
    return result.finally(() => {
      this.#pending -= 1;
    });
  }

  #execute(command, remainingMs, signal) {
    return new Promise((resolve, reject) => {
      const args = [
        "--root-dir",
        this.root,
        "--graph",
        this.graph,
        "--output",
        "json",
        "--timeout-ms",
        "30000",
        ...command
      ];
      const child = this.spawnProcess(this.executable, [this.bridge], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stdout = [];
      let bytes = 0;
      let failure = null;
      const stop = (error) => {
        failure ??= error;
        child.kill("SIGKILL");
      };
      const cancel = () => stop(new GraphError("cancelled", "The operation was cancelled.", 409));
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      const timer = setTimeout(
        () =>
          stop(
            new GraphError("outcome-unknown", "Logseq took too long. Check the graph before repeating a change.", 504)
          ),
        remainingMs
      );
      child.stdout.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > this.maximumOutput)
          stop(
            new GraphError(
              "result-too-large",
              "This result is too large. Ask for a smaller page or a more specific search.",
              413
            )
          );
        else stdout.push(chunk);
      });
      // Do not log upstream diagnostics: they can contain graph contents or auth data.
      child.stderr.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > this.maximumOutput)
          stop(new GraphError("upstream-error", "Logseq returned excessive diagnostic output.", 502));
      });
      child.stdin.on("error", () => {});
      child.on("error", () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        reject(new GraphError("unavailable", "The Logseq client could not start.", 503));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        if (failure) return reject(failure);
        let result;
        try {
          result = JSON.parse(Buffer.concat(stdout).toString("utf8").trim());
        } catch {
          return reject(new GraphError("invalid-response", "Logseq returned an unreadable response.", 502));
        }
        if (code !== 0 || result.status !== "ok") {
          return reject(
            new GraphError(
              "command-failed",
              "Logseq could not complete the operation. Check the graph before retrying a change.",
              502
            )
          );
        }
        resolve(result.data);
      });
      child.stdin.end(JSON.stringify(args));
    });
  }
}
