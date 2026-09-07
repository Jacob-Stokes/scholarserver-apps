// Disposable-host acceptance only. Never overwrite an existing package.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { logseqPackage } from "../package-definition.mjs";

const [output, helper, mcp, sync, version = "0.1.0-acceptance.1"] = process.argv.slice(2);
if (
  !output ||
  !/^0\.1\.0-acceptance\.[1-9][0-9]*$/.test(version) ||
  ![helper, mcp, sync].every((value) => /^localhost:5000\/logseq-(helper|mcp|sync)@sha256:[a-f0-9]{64}$/.test(value))
) {
  throw new Error("Provide a new output directory and three digest-pinned test-registry images.");
}
const { manifest, compose } = logseqPackage({ helper, mcp, sync, version });
await mkdir(output);
await writeFile(path.join(output, "scholarserver-app.yaml"), JSON.stringify(manifest, null, 2));
await writeFile(path.join(output, "compose.yaml"), JSON.stringify(compose, null, 2));
await writeFile(path.join(output, "README.md"), "Disposable acceptance package only; not a public release.\n");
