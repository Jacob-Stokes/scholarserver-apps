import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { c as archive } from "tar";
import { createOfficialClient, verifyDownload } from "./official-client.mjs";

async function fixture(t, version = "0.0.14", extra = null) {
  const root = await mkdtemp(path.join(os.tmpdir(), "scholarserver-client-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "source/package"), { recursive: true });
  const files = ["package.json", "cli.js", "README.md"];
  await writeFile(
    path.join(root, "source/package/package.json"),
    JSON.stringify({
      name: "obsidian-headless",
      version,
      dependencies: { commander: "14.0.3", "better-sqlite3": "12.11.1" }
    })
  );
  await writeFile(path.join(root, "source/package/cli.js"), "// Synthetic test client, not proprietary software.\n");
  await writeFile(path.join(root, "source/package/README.md"), "Synthetic upstream notice\n");
  if (extra) {
    files.push(extra);
    await writeFile(path.join(root, "source/package", extra), "unexpected");
  }
  await archive(
    { gzip: true, file: path.join(root, "fixture.tgz"), cwd: path.join(root, "source"), noDirRecurse: true },
    files.map((file) => `package/${file}`)
  );
  const bytes = await readFile(path.join(root, "fixture.tgz"));
  const release = {
    version,
    url: "https://example.invalid/client.tgz",
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`
  };
  return { root: path.join(root, "client"), dependencies: path.join(root, "dependencies"), release, bytes };
}

test("neither status nor LiveSync can trigger a download; confirmation is mandatory", async (t) => {
  const setup = await fixture(t);
  let requests = 0;
  const client = createOfficialClient({
    ...setup,
    fetcher: async () => {
      requests++;
      return new Response(setup.bytes);
    }
  });
  assert.equal((await client.status()).phase, "not-installed");
  assert.throws(() => client.begin({ profile: "livesync", confirmed: true }));
  assert.throws(() => client.begin({ profile: "official" }));
  await assert.rejects(client.entrypoint());
  assert.equal(requests, 0);
});

test("verified install is single-flight and survives restart without another download", async (t) => {
  const setup = await fixture(t);
  let requests = 0;
  const fetcher = async () => {
    requests++;
    return new Response(setup.bytes);
  };
  const client = createOfficialClient({ ...setup, fetcher });
  await Promise.all([
    client.begin({ profile: "official", confirmed: true }),
    client.begin({ profile: "official", confirmed: true })
  ]);
  assert.equal(requests, 1);
  assert.equal((await client.status()).version, "0.0.14");
  const restored = createOfficialClient({ ...setup, fetcher });
  assert.equal((await restored.status()).phase, "installed");
  assert.match(await restored.entrypoint(), /installed\/package\/cli.js$/);
  assert.equal(requests, 1);
});

test("interrupted download and bad integrity remain retryable without an executable", async (t) => {
  const setup = await fixture(t);
  let attempt = 0;
  const client = createOfficialClient({
    ...setup,
    fetcher: async () => {
      attempt++;
      if (attempt === 1) throw new Error("network interruption");
      return new Response(attempt === 2 ? Buffer.from("corrupt") : setup.bytes);
    }
  });
  await assert.rejects(client.begin({ profile: "official", confirmed: true }));
  await assert.rejects(client.entrypoint());
  await assert.rejects(client.begin({ profile: "official", confirmed: true }), /integrity/);
  await client.begin({ profile: "official", confirmed: true });
  assert.equal((await client.status()).phase, "installed");
});

test("tampered installed client is not executed; explicit retry repairs it", async (t) => {
  const setup = await fixture(t);
  const client = createOfficialClient({ ...setup, fetcher: async () => new Response(setup.bytes) });
  await client.begin({ profile: "official", confirmed: true });
  await writeFile(await client.entrypoint(), "tampered");
  await assert.rejects(client.entrypoint());
  await client.begin({ profile: "official", confirmed: true });
  assert.equal((await client.status()).phase, "installed");
});

test("power loss before activation and a client update both require explicit installation", async (t) => {
  const setup = await fixture(t);
  const client = createOfficialClient({ ...setup, fetcher: async () => new Response(setup.bytes) });
  await client.begin({ profile: "official", confirmed: true });
  await rename(path.join(setup.root, "installed"), path.join(setup.root, ".install-interrupted"));
  const restarted = createOfficialClient({ ...setup, fetcher: async () => new Response(setup.bytes) });
  assert.equal((await restarted.status()).phase, "not-installed");
  await restarted.begin({ profile: "official", confirmed: true });
  const update = await fixture(t, "0.0.15");
  const newer = createOfficialClient({ ...update, root: setup.root, fetcher: async () => new Response(update.bytes) });
  assert.equal((await newer.status()).phase, "not-installed");
  await newer.begin({ profile: "official", confirmed: true });
  assert.equal((await newer.status()).version, "0.0.15");
});

test("unexpected archive entries cannot reach an executable installation", async (t) => {
  const setup = await fixture(t, "0.0.14", "unexpected.js");
  const client = createOfficialClient({ ...setup, fetcher: async () => new Response(setup.bytes) });
  await assert.rejects(client.begin({ profile: "official", confirmed: true }));
  await assert.rejects(client.entrypoint());
  assert.throws(() => verifyDownload(Buffer.from("not the approved package")), /integrity/);
});
