import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { atomicJson } from "@scholarserver/controller-runtime/files";
import { BootstrapClient, SetupError } from "./bootstrap-client.mjs";

export const defaultOwnerEmail = "owner@scholarserver.invalid";

export class PasswordSetup {
  constructor({ directory, setup, baseUrl, makeBootstrap = () => new BootstrapClient(baseUrl) }) {
    this.directory = directory;
    this.file = path.join(directory, "setup.json");
    this.setup = setup;
    this.makeBootstrap = makeBootstrap;
    this.busy = false;
  }

  async journal() {
    try {
      const value = JSON.parse(await readFile(this.file, "utf8"));
      if (
        value.schemaVersion !== 1 ||
        typeof value.email !== "string" ||
        !/^ScholarServer [a-f0-9-]{36}$/.test(value.label)
      )
        throw new Error("invalid");
      return value;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw new SetupError("The saved setup record needs recovery. No account or key has been replaced.");
    }
  }

  async status() {
    if (this.busy) return { connected: false, phase: "setting-up" };
    let savedConnectionFailed = false;
    try {
      if ((await this.setup.status()).connected) return { connected: true, phase: "ready" };
    } catch {
      savedConnectionFailed = true;
    }
    const journal = await this.journal();
    const fresh = await this.makeBootstrap().needsOwner();
    if ((journal || savedConnectionFailed) && fresh) {
      // A previous claim may have run before n8n lost its database. Never reset it.
      return { connected: false, phase: "recovery-required" };
    }
    if (journal) return { connected: false, phase: "resume", ownerEmail: journal.email };
    if (fresh) return { connected: false, phase: "password-required", ownerEmail: defaultOwnerEmail };
    return { connected: false, phase: "existing-account" };
  }

  async finish(input) {
    if (this.busy) throw new SetupError("Setup is already running. Check status before continuing.");
    this.busy = true;
    let bootstrap;
    try {
      let savedConnectionFailed = false;
      try {
        if ((await this.setup.status()).connected) return { connected: true, phase: "ready" };
      } catch {
        // A failed key can be replaced only after a fresh owner sign-in below.
        savedConnectionFailed = true;
      }
      if (
        !input ||
        Object.keys(input).some((key) => !["password", "email", "mfaCode"].includes(key)) ||
        typeof input.password !== "string" ||
        input.password.length < 8 ||
        input.password.length > 64 ||
        (input.email !== undefined &&
          (typeof input.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))) ||
        (input.mfaCode !== undefined && (typeof input.mfaCode !== "string" || !/^\d{6}$/.test(input.mfaCode)))
      ) {
        throw new SetupError("Use an 8–64 character password and a valid sign-in address.");
      }
      bootstrap = this.makeBootstrap();
      const fresh = await bootstrap.needsOwner();
      let journal = await this.journal();
      if (fresh && (journal || savedConnectionFailed))
        throw new SetupError(
          "A setup attempt already exists, but n8n has no owner. Restore its state before continuing."
        );
      if (!journal) {
        if (fresh && (!/[A-Z]/.test(input.password) || !/\d/.test(input.password))) {
          throw new SetupError("Include at least one uppercase letter and one number in your password.");
        }
        if (!fresh && !input.email)
          throw new SetupError("Enter the existing n8n owner's email. Its password will not be changed.");
        const email = fresh ? defaultOwnerEmail : input.email;
        // Existing owners must authenticate before we claim a new connection record.
        if (!fresh) await bootstrap.signIn(email, input.password, input.mfaCode);
        journal = { schemaVersion: 1, email, label: `ScholarServer ${randomUUID()}` };
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        await atomicJson(this.file, journal);
        if (fresh) await bootstrap.createOwner(email, input.password);
      }
      // Re-authentication reconciles an owner creation whose response was lost.
      await bootstrap.signIn(journal.email, input.password, input.mfaCode);
      const existingKey = await bootstrap.findSetupKey(journal.label);
      // The raw key cannot be read back. Rotate only this journal's own key if a
      // prior response was lost; never touch unrelated keys or user workflows.
      const issued = existingKey ? await bootstrap.rotateKey(existingKey.id) : await bootstrap.createKey(journal.label);
      if (typeof issued?.rawApiKey !== "string" || issued.rawApiKey.length < 32) {
        throw new SetupError("n8n did not return the complete connection key. Enter your password again to resume.");
      }
      await this.setup.connect({ apiKey: issued.rawApiKey });
      return { connected: true, phase: "ready" };
    } finally {
      if (bootstrap) bootstrap.cookie = "";
      this.busy = false;
    }
  }
}
