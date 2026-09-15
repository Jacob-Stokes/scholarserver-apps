import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

// No pull, build, exec into existing containers, live mounts or host networking.
// Only the freshly named disposable container created here can be removed.
function docker(args) {
  return execFileSync("docker", args, { encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024 });
}

const manifest = parse(await readFile(new URL("../package/scholarserver-app.yaml", import.meta.url), "utf8"));
const compose = parse(await readFile(new URL("../package/compose.yaml", import.meta.url), "utf8"));
const reference = manifest.images.find((image) => image.service === "controller").reference;
assert.match(reference, /@sha256:[a-f0-9]{64}$/);
assert.equal(compose.services.controller.image, reference);
const daemon = JSON.parse(docker(["info", "--format", "{{json .}}"]));
const image = JSON.parse(docker(["image", "inspect", reference]))[0];
const architectures = { aarch64: "arm64", arm64: "arm64", x86_64: "amd64", amd64: "amd64" };
const architecture = architectures[daemon.Architecture];
assert.ok(architecture, "Unsupported native Docker architecture");
assert.equal(daemon.OSType, "linux");
assert.equal(image.Architecture, architecture, "Do not use emulation for qualification");
assert.equal(image.Os, "linux");
const hashes = [];
for (const file of ["research-items.mjs", "controller.mjs"]) {
  hashes.push(
    createHash("sha256")
      .update(await readFile(new URL(`../controller/${file}`, import.meta.url)))
      .digest("hex")
  );
}
const name = `zotero-research-qualification-${randomUUID()}`;
const fixturePath = fileURLToPath(new URL("./", import.meta.url));
assert.ok(!fixturePath.includes(","), "Docker bind paths must not contain commas");
const label = `org.scholarserver.synthetic-qualification=${name}`;
try {
  const output = docker([
    "run",
    "--rm",
    "--pull",
    "never",
    "--name",
    name,
    "--label",
    label,
    "--network",
    "none",
    "--read-only",
    "--user",
    "10001:10001",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--pids-limit",
    "64",
    "--memory",
    "128m",
    "--tmpfs",
    "/runtime:rw,nosuid,nodev,noexec,size=16m,uid=10001,gid=10001,mode=0700",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=16m",
    "--mount",
    `type=bind,source=${fixturePath},target=/qualification,readonly`,
    "--env",
    "SCHOLARSERVER_SYNTHETIC_QUALIFICATION=1",
    "--entrypoint",
    "node",
    reference,
    "/qualification/pinned-controller-fixture.mjs",
    ...hashes
  ]);
  console.log(
    JSON.stringify({
      packageVersion: manifest.packageVersion,
      reference,
      imageId: image.Id,
      architecture,
      sourceHashes: { researchItems: hashes[0], controller: hashes[1] },
      evidence: JSON.parse(output)
    })
  );
} finally {
  const remaining = docker(["ps", "-aq", "--filter", `name=^/${name}$`, "--filter", `label=${label}`]).trim();
  if (remaining) docker(["rm", "-f", name]);
  assert.equal(docker(["ps", "-aq", "--filter", `name=^/${name}$`]).trim(), "", "Disposable container must be removed");
}
