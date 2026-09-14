import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { fingerprintRecipe } from "../scripts/check-image-source.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const script = path.join(repositoryRoot, "scripts/qualify-development-apps.sh");
const revision = "1".repeat(40);
const architecture = process.arch === "arm64" ? "arm64" : "amd64";
const registry = "registry.example/development";
const configDigest = `sha256:${"c".repeat(64)}`;
const rootfs = `sha256:${"d".repeat(64)}`;
const recipes = [
  "docling-app",
  "logseq-helper",
  "logseq-mcp",
  "zotero-controller",
  "zotero-desktop",
  "zotero-local-api-bridge",
  "zotero-automations",
  "zotero-mcp"
];
const variables = [
  "DOCLING_CONTROLLER_IMAGE",
  "LOGSEQ_PROOF_HELPER_IMAGE",
  "LOGSEQ_PROOF_MCP_IMAGE",
  "ZOTERO_CONTROLLER_IMAGE",
  "ZOTERO_DESKTOP_IMAGE",
  "ZOTERO_LOCAL_API_BRIDGE_IMAGE",
  "ZOTERO_AUTOMATIONS_IMAGE",
  "ZOTERO_MCP_IMAGE"
];

async function executable(file, contents) {
  await writeFile(file, contents);
  await chmod(file, 0o755);
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "development-app-gates-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  const modules = path.join(root, "browser/node_modules");
  const evidence = path.join(root, ".dev/native-images");
  await Promise.all([
    mkdir(bin),
    mkdir(path.join(modules, "playwright"), { recursive: true }),
    mkdir(evidence, { recursive: true }),
    mkdir(path.join(root, "scripts"))
  ]);
  await writeFile(path.join(root, "Dockerfile"), "FROM scratch\nCOPY source.txt /source.txt\n");
  await writeFile(path.join(root, "source.txt"), "current source\n");
  const inventory = recipes.map((name) => ({
    name,
    dockerfile: "Dockerfile",
    context: ".",
    repository: `scholarserver-${name}`,
    manifest: "compose.yaml",
    service: "fixture",
    licenseCheck: "Dockerfile",
    nativeArchitectures: ["amd64", "arm64"],
    sourceInputs: ["Dockerfile", "source.txt"]
  }));
  await writeFile(
    path.join(root, "scripts/image-source-inventory.json"),
    JSON.stringify({ format: 1, recipes: inventory })
  );
  const images = await Promise.all(
    inventory.map(async (recipe, index) => ({
      recipe: recipe.name,
      target: `${registry}/${recipe.repository}:sha-${revision}-${architecture}`,
      localImageId: `sha256:${String(index + 1).repeat(64)}`,
      configDigest,
      architecture,
      rootfsDiffIds: [rootfs],
      sourceDigest: (await fingerprintRecipe(root, recipe)).digest
    }))
  );
  const receipt = path.join(evidence, `${revision}-${architecture}.json`);
  await writeFile(receipt, JSON.stringify({ format: 1, revision, architecture, registry, images }));
  const browserExecutable = path.join(root, "native-chromium");
  const header = Buffer.alloc(20);
  header.set([127, 69, 76, 70, 2, 1]);
  header.writeUInt16LE(architecture === "amd64" ? 62 : 183, 18);
  await executable(browserExecutable, header);
  await writeFile(path.join(modules, "playwright/package.json"), '{"main":"index.cjs"}');
  await writeFile(path.join(modules, "playwright/test.js"), "module.exports = {};\n");
  await writeFile(
    path.join(modules, "playwright/index.cjs"),
    `
    exports.chromium = { launch: async (options) => {
      require('node:assert/strict').equal(options.executablePath, process.env.SCHOLARSERVER_BROWSER_EXECUTABLE);
      if (process.env.FAIL_BROWSER) throw new Error('Browser unavailable');
      return { close: async () => {} };
    }};
  `
  );
  const shebang = `#!${process.execPath}\n`;
  await executable(
    path.join(bin, "uname"),
    shebang +
      `
    console.log(process.argv[2] === '-s' ? 'Linux' : (process.env.WRONG_RUNNER || '${architecture === "amd64" ? "x86_64" : "aarch64"}'));
  `
  );
  await executable(
    path.join(bin, "git"),
    shebang +
      `
    const args = process.argv.slice(2).join(' ');
    if (args === 'rev-parse --show-toplevel') console.log(process.env.NATIVE_IMAGE_ROOT);
    else if (args === 'rev-parse --verify HEAD^{commit}') console.log('${revision}');
    else if (args.startsWith('status ')) { if (process.env.DIRTY_SOURCE) console.log(' M source.txt'); }
    else process.exit(91);
  `
  );
  await executable(
    path.join(bin, "python3"),
    shebang +
      `
    console.log([process.env.WRONG_IDENTITY || '${configDigest}', '${architecture}', '${rootfs}'].join('\t'));
  `
  );
  await executable(
    path.join(bin, "docker"),
    shebang +
      `
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    if (args[0] === 'context') console.log('unix:///var/run/docker.sock');
    else if (args[0] === 'info') console.log('linux/' + (process.env.WRONG_DOCKER || '${architecture}'));
    else if (args[0] === 'image' && args[1] === 'inspect') {
      const images = JSON.parse(fs.readFileSync(process.env.FIXTURE_RECEIPT)).images;
      const image = images.find((image) => image.target === args[2] || image.localImageId === args[2]);
      if (!image) process.exit(1);
      if (args[4] === '{{.Id}}') {
        const drifted = process.env.DRIFT_AFTER_GATES && fs.existsSync(process.env.GATE_CALLS);
        console.log(process.env.WRONG_TAG || (drifted ? 'sha256:changed' : image.localImageId));
      } else console.log('linux/' + (process.env.WRONG_IMAGE_ARCH || image.architecture));
    } else throw new Error('Unexpected Docker mutation: ' + args.join(' '));
  `
  );
  await executable(
    path.join(bin, "node"),
    shebang +
      `
    const fs = require('node:fs');
    const path = require('node:path');
    const file = path.basename(process.argv[2] || '');
    if (/^check-(docling|logseq|zotero)-packaging.mjs$/.test(file)) {
      const names = ${JSON.stringify([
        ...variables,
        "LOGSEQ_PROOF_HELPER_REVISION",
        "LOGSEQ_PROOF_MCP_REVISION",
        "LOGSEQ_PROOF_BROWSER_EXECUTABLE",
        "SCHOLARSERVER_BROWSER_EXECUTABLE",
        "SCHOLARSERVER_BROWSER_MODULES"
      ])};
      fs.appendFileSync(process.env.GATE_CALLS, JSON.stringify({ file, env: Object.fromEntries(names.map(name => [name, process.env[name]])) }) + '\\n');
      if (process.env.FAIL_GATE === file) process.exit(17);
      console.log('Synthetic gate passed: ' + file);
    } else {
      const result = require('node:child_process').spawnSync(${JSON.stringify(process.execPath)}, process.argv.slice(2), { stdio: 'inherit' });
      process.exit(result.status ?? 1);
    }
  `
  );
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    NATIVE_IMAGE_ROOT: root,
    GITHUB_ACTIONS: "true",
    RUNNER_ENVIRONMENT: "github-hosted",
    ARCH: architecture,
    REGISTRY: registry,
    REVISION: revision,
    DOCKER_HOST: "",
    DOCKER_CONTEXT: "",
    FIXTURE_RECEIPT: receipt,
    GATE_CALLS: path.join(root, "gate-calls.jsonl"),
    SCHOLARSERVER_BROWSER_MODULES: modules,
    SCHOLARSERVER_BROWSER_EXECUTABLE: browserExecutable
  };
  return {
    root,
    receipt,
    images,
    env,
    browserExecutable,
    run: (overrides = {}) =>
      spawnSync("bash", [script], { env: { ...env, ...overrides }, encoding: "utf8", timeout: 15_000 }),
    calls: async () =>
      (await readFile(env.GATE_CALLS, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map(JSON.parse),
    summaries: async () => {
      const directories = (await readdir(evidence)).filter((name) => name.includes(".development."));
      return (
        await Promise.all(
          directories.map((name) => readFile(path.join(evidence, name, "summary.json"), "utf8").catch(() => null))
        )
      )
        .filter(Boolean)
        .map(JSON.parse);
    }
  };
}

test("all three gates use receipt-bound IDs and the native executable, without writing release qualification", async (t) => {
  const proof = await fixture(t);
  const result = proof.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const calls = await proof.calls();
  assert.deepEqual(
    calls.map((call) => call.file),
    ["check-docling-packaging.mjs", "check-logseq-packaging.mjs", "check-zotero-packaging.mjs"]
  );
  for (const call of calls) {
    for (const [index, variable] of variables.entries())
      assert.equal(call.env[variable], proof.images[index].localImageId);
    assert.equal(call.env.LOGSEQ_PROOF_HELPER_REVISION, revision);
    assert.equal(call.env.LOGSEQ_PROOF_MCP_REVISION, revision);
    assert.equal(call.env.LOGSEQ_PROOF_BROWSER_EXECUTABLE, proof.browserExecutable);
  }
  const [summary] = await proof.summaries();
  assert.equal(summary.result, "passed");
  assert.equal(summary.architecture, architecture);
  assert.equal(
    summary.buildReceiptDigest,
    `sha256:${createHash("sha256")
      .update(await readFile(proof.receipt))
      .digest("hex")}`
  );
  assert.equal(summary.scopes.length, 3);
  assert.ok(summary.limits.includes("Package release blocks remain unchanged"));
  await assert.rejects(readFile(proof.receipt.replace(".json", ".qualified.json")), { code: "ENOENT" });
});

for (const [name, env, expected] of [
  ["outside GitHub Actions", { GITHUB_ACTIONS: "false" }, /disposable GitHub-hosted/],
  ["retained runner", { RUNNER_ENVIRONMENT: "self-hosted" }, /disposable GitHub-hosted/],
  ["redirected Docker", { DOCKER_HOST: "ssh:\/\/retained.example" }, /Do not redirect Docker/],
  ["non-native runner", { WRONG_RUNNER: architecture === "arm64" ? "x86_64" : "aarch64" }, /emulation is not allowed/],
  ["non-native Docker", { WRONG_DOCKER: "different" }, /Unsupported Docker platform/],
  ["dirty source", { DIRTY_SOURCE: "1" }, /Working tree is not clean/],
  ["retargeted image", { WRONG_TAG: "sha256:other" }, /does not match the build receipt/],
  ["foreign image", { WRONG_IMAGE_ARCH: "different" }, /Image platform differs/],
  ["portable identity mismatch", { WRONG_IDENTITY: "sha256:other" }, /Portable image identity differs/],
  ["missing browser modules", { SCHOLARSERVER_BROWSER_MODULES: "/missing-modules" }, /Cannot find module/],
  ["browser launch failure", { FAIL_BROWSER: "1" }, /Browser unavailable/]
]) {
  test(`${name} fails before any app gate`, async (t) => {
    const proof = await fixture(t);
    const result = proof.run(env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
    assert.deepEqual(await proof.calls(), []);
    assert.deepEqual(await proof.summaries(), []);
  });
}

test("foreign browser executable is rejected even when Node and Docker are native", async (t) => {
  const proof = await fixture(t);
  const header = await readFile(proof.browserExecutable);
  header.writeUInt16LE(architecture === "amd64" ? 183 : 62, 18);
  await writeFile(proof.browserExecutable, header);
  const result = proof.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Chromium must be native/);
  assert.deepEqual(await proof.calls(), []);
});

test("source changed after build fails receipt verification before app gates", async (t) => {
  const proof = await fixture(t);
  await writeFile(path.join(proof.root, "source.txt"), "different source");
  const result = proof.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Source changed after build/);
  assert.deepEqual(await proof.calls(), []);
});

for (const [index, app] of ["docling", "logseq", "zotero"].entries()) {
  test(`${app} gate failure stops the run and never writes success`, async (t) => {
    const proof = await fixture(t);
    const result = proof.run({ FAIL_GATE: `check-${app}-packaging.mjs` });
    assert.equal(result.status, 17, result.stderr);
    assert.equal((await proof.calls()).length, index + 1);
    assert.deepEqual(await proof.summaries(), []);
  });
}

test("tag drift after passing gates prevents a success summary", async (t) => {
  const proof = await fixture(t);
  const result = proof.run({ DRIFT_AFTER_GATES: "1" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Local tag changed during the gates/);
  assert.equal((await proof.calls()).length, 3);
  assert.deepEqual(await proof.summaries(), []);
});

test("workflow requires all gates before publication and only uploads selected synthetic evidence", async () => {
  assert.equal((await stat(script)).mode & 0o111, 0o111, "The workflow entry point must be executable");
  const workflow = parse(await readFile(path.join(repositoryRoot, ".github/workflows/images.yml"), "utf8"));
  assert.deepEqual(workflow.jobs.build.strategy.matrix.include, [
    { architecture: "amd64", runner: "ubuntu-24.04" },
    { architecture: "arm64", runner: "ubuntu-24.04-arm" }
  ]);
  const steps = workflow.jobs.build.steps;
  const original = steps.findIndex((step) => step.run === "./scripts/test-native-images.sh");
  const gates = steps.findIndex((step) => step.run === "./scripts/qualify-development-apps.sh");
  const publish = steps.findIndex((step) => step.run === "./scripts/publish-native-images.sh");
  assert.ok(original >= 0 && original < gates && gates < publish);
  assert.equal(steps[gates].if, undefined);
  assert.equal(steps[gates]["continue-on-error"], undefined);
  const browser = steps.find((step) => step.name === "Prepare isolated locked Playwright and native Chromium");
  assert.match(browser.run, /mktemp -d "\$RUNNER_TEMP\//);
  assert.match(browser.run, /--package-lock-only.*--save-exact.*playwright@1\.58\.2/);
  assert.match(browser.run, /npm ci --prefix "\$browser_root"/);
  assert.match(browser.run, /install --with-deps chromium/);
  assert.doesNotMatch(browser.run, /qemu|chrome --|--force/);
  const upload = steps.find((step) => step.uses === "actions/upload-artifact@v4");
  assert.equal(upload.if, "always()");
  assert.match(upload.with.path, /development\.\*\/summary\.json/);
  assert.doesNotMatch(upload.with.path, /\.log|node_modules|\.env|\/\*\*/);
});
