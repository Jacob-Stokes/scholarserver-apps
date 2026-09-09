import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { N8nSetup } from "./setup.mjs";

test("setup preserves a working key on rejection and never returns secret values", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "n8n-setup-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const makeClient = ({ apiKey }) => ({
    listWorkflows: async () => {
      if (apiKey !== "working-key") throw new Error("rejected");
      return { data: [] };
    }
  });
  const setup = new N8nSetup({ directory, baseUrl: "http://n8n:5678", makeClient });
  assert.deepEqual(await setup.status(), { connected: false });
  assert.deepEqual(await setup.connect({ apiKey: "working-key" }), { connected: true });
  await assert.rejects(setup.connect({ apiKey: "invalid-key" }));
  assert.equal(JSON.parse(await readFile(setup.file, "utf8")).apiKey, "working-key");
  assert.equal((await stat(setup.file)).mode & 0o777, 0o600);
  const restarted = new N8nSetup({ directory, baseUrl: "http://n8n:5678", makeClient });
  assert.deepEqual(await restarted.status(), { connected: true });
});
