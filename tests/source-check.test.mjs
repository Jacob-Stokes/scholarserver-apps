import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

const repositoryRoot = new URL("../", import.meta.url);

async function readRepositoryFile(relativePath) {
  return readFile(new URL(relativePath, repositoryRoot), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readRepositoryFile(relativePath));
}

function explicitBuildWorkspaces(buildScript) {
  return buildScript.split(" && ").map((command) => {
    const match = /^npm run build -w ([a-z0-9@/._-]+)$/.exec(command);
    assert.ok(match, `root build must use an explicit workspace command: ${command}`);
    return match[1];
  });
}

async function declaredBuildWorkspaces(rootManifest) {
  const buildWorkspaces = [];
  for (const workspace of rootManifest.workspaces) {
    const manifest = await readJson(`${workspace}/package.json`);
    if (manifest.scripts?.build) {
      buildWorkspaces.push(workspace);
    }
  }
  return buildWorkspaces;
}

test("root build explicitly covers every declared workspace with a build script", async () => {
  const rootManifest = await readJson("package.json");
  const declaredWorkspaces = await declaredBuildWorkspaces(rootManifest);
  const builtWorkspaces = explicitBuildWorkspaces(rootManifest.scripts.build);

  assert.deepEqual(new Set(builtWorkspaces), new Set(declaredWorkspaces));
  assert.equal(builtWorkspaces.length, new Set(builtWorkspaces).size, "root build contains a duplicate workspace");
});

test("locked source check installs dependencies before lint, tests, and builds", async () => {
  const sourceCheck = await readRepositoryFile("scripts/check-source.sh");
  const npmCommands = sourceCheck
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("npm "));

  assert.deepEqual(npmCommands, [
    "npm ci --no-audit --no-fund",
    "npm ci --prefix apps/obsidian/sync --ignore-scripts --no-audit --no-fund",
    "npm run lint",
    "npm test",
    "npm run test:packaging",
    "npm run build"
  ]);
});

async function readWorkflow(relativePath) {
  return parse(await readRepositoryFile(relativePath));
}

function sourceCheckCommands(workflow) {
  return Object.values(workflow.jobs).flatMap((job) =>
    job.steps.flatMap((step) => (step.run === "sh scripts/check-source.sh" ? [step.run] : []))
  );
}

test("both CI entry points run the locked source check and GitHub stays manual-only", async () => {
  const giteaWorkflow = await readWorkflow(".gitea/workflows/check.yml");
  const githubWorkflow = await readWorkflow(".github/workflows/check.yml");

  assert.deepEqual(sourceCheckCommands(giteaWorkflow), ["sh scripts/check-source.sh"]);
  assert.deepEqual(sourceCheckCommands(githubWorkflow), ["sh scripts/check-source.sh"]);
  assert.deepEqual(Object.keys(githubWorkflow.on), ["workflow_dispatch"]);
  assert.deepEqual(giteaWorkflow.on.push.branches, ["main", "codex/beginner-acceptance"]);
  assert.ok("workflow_dispatch" in giteaWorkflow.on);
});
