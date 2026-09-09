import { lstat, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { atomicJson } from "@scholarserver/controller-runtime/files";
import { SetupError } from "./bootstrap-client.mjs";

// The executor supplies short-lived, owner-only input files. The controller is
// the sole owner of setup state, including when the browser disconnects.
export async function startSetupActions(directory, setup) {
  const requests = path.join(directory, "requests");
  const responses = path.join(directory, "responses");
  await mkdir(requests, { recursive: true, mode: 0o700 });
  await mkdir(responses, { recursive: true, mode: 0o700 });
  let stopped = false;
  async function poll() {
    try {
      // A disconnected executor may never collect its non-secret result.
      for (const name of await readdir(responses)) {
        if (!/^[a-f0-9]{32}\.json$/.test(name)) continue;
        const file = path.join(responses, name);
        const metadata = await lstat(file).catch(() => null);
        if (metadata?.isFile() && Date.now() - metadata.mtimeMs > 300000) await rm(file, { force: true });
      }
      for (const name of await readdir(requests)) {
        if (!/^[a-f0-9]{32}\.json$/.test(name)) continue;
        const file = path.join(requests, name);
        const metadata = await lstat(file).catch(() => null);
        if (!metadata) continue;
        if (!metadata.isFile() || metadata.size > 16384 || Date.now() - metadata.mtimeMs > 90000) {
          await rm(file, { force: true });
          continue;
        }
        let result;
        try {
          const request = JSON.parse(await readFile(file, "utf8"));
          await rm(file, { force: true });
          if (request.action !== "setup") throw new SetupError("Unknown setup action.");
          result = { ok: true, result: await setup.finish(request.input) };
        } catch (error) {
          result = {
            ok: false,
            error:
              error instanceof SetupError ? error.message : "Could not complete setup. Check status before continuing."
          };
        } finally {
          await rm(file, { force: true });
        }
        await atomicJson(path.join(responses, name), result);
      }
    } catch {
      // Executor timeout reports unavailable input/output; never log credentials.
    } finally {
      if (!stopped) setTimeout(poll, 250).unref();
    }
  }
  void poll();
  return () => {
    stopped = true;
  };
}
