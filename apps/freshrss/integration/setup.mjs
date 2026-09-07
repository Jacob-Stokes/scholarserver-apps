import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { atomicJson, atomicWrite } from "@scholarserver/controller-runtime/files";
import { z } from "zod";

export const accountInput = z
  .object({
    username: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/, "Use letters, numbers, dashes or underscores."),
    password: z.string().min(12, "Use at least 12 characters.").max(200)
  })
  .strict();

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export class Setup {
  constructor(runtime) {
    this.runtime = runtime;
    this.pending = Promise.resolve();
  }
  async initialize() {
    await mkdir(this.runtime, { recursive: true, mode: 0o700 });
    for (const directory of ["requests", "responses"])
      await mkdir(`${this.runtime}/${directory}`, { recursive: true, mode: 0o700 });
    let token;
    try {
      token = await readFile(`${this.runtime}/service-token`, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      token = randomBytes(32).toString("base64url");
      await atomicWrite(`${this.runtime}/service-token`, token);
    }
    return token;
  }
  async status() {
    const worker = await readJson(`${this.runtime}/worker-status.json`, { phase: "starting", ready: false });
    const heartbeat = await stat(`${this.runtime}/heartbeat`).catch(() => null);
    if (!heartbeat || Date.now() - heartbeat.mtimeMs > 300_000) {
      worker.ready = false;
      worker.phase = "starting";
      worker.error = "The reader is not responding yet. Check its service and try again.";
    }
    const account = await readJson(`${this.runtime}/account.json`, null);
    if (worker.ready && account?.password) {
      // The web password is no longer needed after upstream stores its hash.
      delete account.password;
      await atomicJson(`${this.runtime}/account.json`, account);
    }
    return { ...worker, username: account?.username ?? null };
  }
  connect(input) {
    const operation = this.pending.then(() => this.saveAccount(input));
    this.pending = operation.catch(() => {});
    return operation;
  }
  async saveAccount(input) {
    const account = accountInput.parse(input);
    const existing = await readJson(`${this.runtime}/account.json`, null);
    if (existing) {
      if (existing.username !== account.username)
        throw new Error("This reader already has an account. Sign in to FreshRSS to manage users.");
      return this.status();
    }
    await atomicJson(`${this.runtime}/account.json`, {
      ...account,
      apiPassword: randomBytes(32).toString("base64url")
    });
    return { phase: "preparing", ready: false };
  }
  async pollRequests() {
    const entries = await readdir(`${this.runtime}/requests`);
    for (const name of entries) {
      if (!/^[a-z0-9-]+\.json$/.test(name)) continue;
      const path = `${this.runtime}/requests/${name}`;
      let result;
      try {
        const request = await readJson(path, {});
        if (request.action === "connect") result = await this.connect(request.input);
        else if (request.action === "status") result = await this.status();
        else throw new Error("Unknown setup action.");
        await atomicJson(`${this.runtime}/responses/${name}`, { ok: true, result });
      } catch {
        await atomicJson(`${this.runtime}/responses/${name}`, {
          ok: false,
          error: "Could not set up FreshRSS. Check your username and use a password of at least 12 characters."
        });
      } finally {
        await rm(path, { force: true });
      }
    }
  }
}
