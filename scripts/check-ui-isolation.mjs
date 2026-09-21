#!/usr/bin/env node
// Mirror the standalone Docker UI install without a parent workspace node_modules.
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), "scholarserver-ui-isolation-"));
const excluded = new Set(["node_modules", "dist", ".dev", ".git", "test-results"]);

async function copySource(source, destination) {
  await cp(source, destination, {
    recursive: true,
    filter: (entry) => !excluded.has(path.basename(entry))
  });
}

function run(args, cwd) {
  const result = spawnSync("npm", args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Standalone UI command failed in ${cwd}: npm ${args.join(" ")}`);
}

try {
  const applications = await readdir(path.join(repository, "apps"), { withFileTypes: true });
  for (const application of applications.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!application.isDirectory()) continue;
    const relative = path.join("apps", application.name, "ui");
    const source = path.join(repository, relative);
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (!manifest.scripts?.build) throw new Error(`${relative} has no production build`);
    // Each app gets its own vendor copy: one install must not satisfy another.
    const isolated = path.join(temporary, application.name);
    await copySource(path.join(repository, "vendor/scholarserver-ui"), path.join(isolated, "vendor/scholarserver-ui"));
    const ui = path.join(isolated, relative);
    await copySource(source, ui);
    console.log(`Checking standalone UI: ${application.name}`);
    run(["ci", "--ignore-scripts", "--no-audit", "--no-fund"], ui);
    run(["run", "build"], ui);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
