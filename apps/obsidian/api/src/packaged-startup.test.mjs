import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const packageRoot = fileURLToPath(new URL("../", import.meta.url));

test("the image's copied API files boot and serve an authenticated synthetic vault", async () => {
  // Stage exactly the source-file COPY entries, not the whole source directory.
  // Keeping staging under the package lets Node resolve its installed dependencies.
  const temporary = await mkdtemp(path.join(packageRoot, ".startup-test-"));
  try {
    const dockerfile = await readFile(path.join(packageRoot, "Dockerfile"), "utf8");
    const copies = [...dockerfile.matchAll(/^COPY (src\/\S+) \.\/(\S+)$/gm)];
    assert.ok(copies.length > 0, "the image explicitly copies its runtime source files");
    for (const [, source, destination] of copies) {
      await copyFile(path.join(packageRoot, source), path.join(temporary, destination));
    }
    const vault = path.join(temporary, "vault");
    await mkdir(vault);
    await writeFile(path.join(vault, "Proof.md"), "---\nkind: test\n---\nSynthetic note\n");
    const probe = `
      import assert from 'node:assert/strict';
      import { once } from 'node:events';
      const { server } = await import(process.argv[1]);
      try {
        if (!server.listening) await once(server, 'listening');
        const base = 'http://127.0.0.1:' + server.address().port;
        assert.equal((await fetch(base + '/health')).status, 200);
        assert.equal((await fetch(base + '/files/Proof.md')).status, 401);
        const response = await fetch(base + '/files/Proof.md', { headers: { 'x-api-key': process.env.API_KEY } });
        assert.equal(response.status, 200);
        assert.match((await response.json()).content, /Synthetic note/);
      } finally {
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    `;
    await execute(
      process.execPath,
      ["--input-type=module", "-e", probe, pathToFileURL(path.join(temporary, "server.mjs")).href],
      {
        env: { ...process.env, PORT: "0", VAULT_PATH: vault, API_KEY: "synthetic-startup-test-key" },
        timeout: 15_000
      }
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
