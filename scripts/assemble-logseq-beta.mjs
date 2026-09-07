import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { logseqPackage } from "../apps/logseq/package-definition.mjs";

const [output, version, helper, mcp, sync] = process.argv.slice(2);
if (
  !output ||
  !/^0\.1\.0-beta\.[1-9][0-9]*$/.test(version) ||
  ![helper, mcp, sync].every((image) =>
    /^ghcr\.io\/jacob-stokes\/scholarserver-logseq-(helper|mcp|sync)@sha256:[a-f0-9]{64}$/.test(image)
  )
) {
  throw new Error("Provide a new output directory, beta version and three published immutable image references.");
}
const { manifest, compose } = logseqPackage({
  helper,
  mcp,
  sync,
  version,
  architectures: ["amd64", "arm64"],
  beta: true
});
await mkdir(output); // Never replace an existing package version.
await writeFile(path.join(output, "scholarserver-app.yaml"), stringify(manifest));
await writeFile(path.join(output, "compose.yaml"), stringify(compose));
await writeFile(path.join(output, "README.md"), await readFile("apps/logseq/DISTRIBUTION.md"));
await writeFile(path.join(output, "LICENSE"), await readFile("LICENSE"));
const iconLock = JSON.parse(await readFile("icons.lock.json", "utf8"));
const icon = iconLock.icons.logseq;
const iconUrl = `https://cdn.jsdelivr.net/gh/${iconLock.upstream.repository}@${iconLock.upstream.commit}/webp/${icon.reference}.webp`;
const iconResponse = await fetch(iconUrl);
if (!iconResponse.ok) throw new Error("Could not download the pinned Logseq icon");
const iconBytes = Buffer.from(await iconResponse.arrayBuffer());
if (createHash("sha256").update(iconBytes).digest("hex") !== icon.sha256)
  throw new Error("Logseq icon checksum mismatch");
await mkdir(path.join(output, "assets/icons"), { recursive: true });
await writeFile(path.join(output, "assets/icons/logseq.webp"), iconBytes);
