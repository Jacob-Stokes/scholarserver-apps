import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { defaultOwnerEmail, PasswordSetup } from "./password-setup.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "n8n-password-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = { fresh: true, connected: false, owners: 0, keys: [], rotations: 0, signIns: 0 };
  const bootstrap = {
    cookie: "",
    needsOwner: async () => state.fresh,
    async createOwner(email, password) {
      assert.equal(state.fresh, true, "An existing owner must never be replaced");
      state.fresh = false;
      state.email = email;
      state.password = password;
      state.owners++;
    },
    async signIn(email, password) {
      state.signIns++;
      assert.equal(email, state.email);
      assert.equal(password, state.password);
    },
    findSetupKey: async (label) => state.keys.find((key) => key.label === label),
    async createKey(label) {
      const key = { id: "own-key", label, rawApiKey: "test-key-".repeat(8) };
      state.keys.push(key);
      return key;
    },
    async rotateKey(id) {
      assert.equal(id, "own-key");
      state.rotations++;
      return { rawApiKey: "rotated-key-".repeat(8) };
    }
  };
  const setup = {
    status: async () => ({ connected: state.connected }),
    async connect({ apiKey }) {
      assert.ok(apiKey.length >= 32);
      state.connected = true;
    }
  };
  const create = () => new PasswordSetup({ directory, setup, makeBootstrap: () => bootstrap });
  return { directory, state, bootstrap, setup, create, controller: create() };
}

test("fresh setup creates one owner and connection; the journal contains no password or key", async (t) => {
  const { controller, directory, state, bootstrap } = await fixture(t);
  assert.deepEqual(await controller.status(), {
    connected: false,
    phase: "password-required",
    ownerEmail: defaultOwnerEmail
  });
  assert.deepEqual(await controller.finish({ password: "TestPassword9" }), { connected: true, phase: "ready" });
  await controller.finish({ password: "ignored-when-connected" });
  assert.equal(state.owners, 1);
  assert.equal(state.keys.length, 1);
  assert.ok(state.keys[0].label.length <= 50, "n8n limits connection labels to 50 characters");
  assert.equal(bootstrap.cookie, "");
  const journal = await readFile(path.join(directory, "setup.json"), "utf8");
  assert.doesNotMatch(journal, /TestPassword9|rawApiKey|test-key/);
  assert.equal((await stat(path.join(directory, "setup.json"))).mode & 0o777, 0o600);
});

test("an existing working connection is untouched and creates no setup record", async (t) => {
  const { controller, directory, state } = await fixture(t);
  state.connected = true;
  assert.equal((await controller.status()).phase, "ready");
  await controller.finish({ password: "anything" });
  assert.equal(state.owners, 0);
  assert.equal(state.signIns, 0);
  assert.deepEqual(await readdir(directory), []);
});

test("existing owners authenticate before any journal or key is created", async (t) => {
  const { controller, directory, state } = await fixture(t);
  Object.assign(state, { fresh: false, email: "existing@example.invalid", password: "Existing9" });
  assert.equal((await controller.status()).phase, "existing-account");
  await assert.rejects(controller.finish({ password: "Existing9" }), /existing n8n owner's email/);
  await assert.rejects(controller.finish({ email: state.email, password: "Incorrect9" }));
  assert.deepEqual(await readdir(directory), []);
  await controller.finish({ email: state.email, password: state.password });
  assert.equal(state.owners, 0);
  assert.equal(state.connected, true);
});

test("lost owner response resumes by sign-in after controller restart, without creating another owner", async (t) => {
  const { controller, create, bootstrap, state } = await fixture(t);
  const createOwner = bootstrap.createOwner;
  bootstrap.createOwner = async (...input) => {
    await createOwner(...input);
    throw new Error("lost response");
  };
  await assert.rejects(controller.finish({ password: "TestPassword9" }));
  const restarted = create();
  assert.equal((await restarted.status()).phase, "resume");
  await restarted.finish({ password: "TestPassword9" });
  assert.equal(state.owners, 1);
  assert.equal(state.connected, true);
});

test("lost key response rotates only this setup's key, leaving unrelated keys alone", async (t) => {
  const { controller, create, bootstrap, state } = await fixture(t);
  state.keys.push({ id: "unrelated", label: "User-created key" });
  const createKey = bootstrap.createKey;
  bootstrap.createKey = async (label) => {
    await createKey(label);
    throw new Error("lost response");
  };
  await assert.rejects(controller.finish({ password: "TestPassword9" }));
  await create().finish({ password: "TestPassword9" });
  assert.equal(state.keys.length, 2);
  assert.equal(state.rotations, 1);
});

test("missing n8n database after a setup attempt is recovery, never permission to reset", async (t) => {
  const { controller, bootstrap, state } = await fixture(t);
  bootstrap.createOwner = async () => {
    throw new Error("unconfirmed");
  };
  await assert.rejects(controller.finish({ password: "TestPassword9" }));
  assert.equal((await controller.status()).phase, "recovery-required");
  await assert.rejects(controller.finish({ password: "Different9" }), /Restore its state/);
  assert.equal(state.owners, 0);
});

test("a stale saved key plus missing database cannot claim a replacement owner", async (t) => {
  const { controller, setup, state } = await fixture(t);
  setup.status = async () => {
    throw new Error("saved key rejected");
  };
  assert.equal((await controller.status()).phase, "recovery-required");
  await assert.rejects(controller.finish({ password: "Different9" }), /Restore its state/);
  assert.equal(state.owners, 0);
});

test("invalid passwords fail before creating state; concurrent setup is rejected", async (t) => {
  const { controller, directory } = await fixture(t);
  for (const password of ["short", "lowercaseonly", "NoDigitsHere"]) {
    await assert.rejects(controller.finish({ password }));
  }
  assert.deepEqual(await readdir(directory), []);
  controller.busy = true;
  await assert.rejects(controller.finish({ password: "TestPassword9" }), /already running/);
  assert.equal((await controller.status()).phase, "setting-up");
});
