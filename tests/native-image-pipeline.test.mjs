import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fingerprintRecipe } from "../scripts/check-image-source.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const publishScript = path.join(repositoryRoot, "scripts/publish-native-images.sh");
const buildScriptPath = path.join(repositoryRoot, "scripts/build-native-images.sh");
const testScriptPath = path.join(repositoryRoot, "scripts/test-native-images.sh");
const receiptScript = path.join(repositoryRoot, "scripts/native-image-receipt.mjs");
const revision = "1".repeat(40);
const otherRevision = "2".repeat(40);
const imageId = `sha256:${"a".repeat(64)}`;
const otherImageId = `sha256:${"b".repeat(64)}`;
const configDigest = `sha256:${"c".repeat(64)}`;
const rootfsDiffId = `sha256:${"d".repeat(64)}`;
const registry = "registry.example/scholarserver";
const architecture = process.arch === "arm64" ? "arm64" : "amd64";

async function makeExecutable(filePath, contents) {
  await writeFile(filePath, contents);
  await chmod(filePath, 0o755);
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "native-image-pipeline-"));
  const bin = path.join(root, "bin");
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(root, ".dev", "native-images"), { recursive: true });
  await mkdir(bin);
  await writeFile(path.join(root, "Dockerfile"), `FROM scratch\nCOPY source.txt /source.txt\n`);
  await writeFile(path.join(root, "source.txt"), "verified source\n");
  const recipe = {
    name: "files",
    dockerfile: "Dockerfile",
    context: ".",
    repository: "scholarserver-files",
    manifest: "compose.yaml",
    service: "fixture",
    nativeArchitectures: [architecture],
    licenseCheck: "Dockerfile",
    sourceInputs: ["Dockerfile", "source.txt"]
  };
  await writeFile(
    path.join(root, "scripts", "image-source-inventory.json"),
    `${JSON.stringify({ format: 1, recipes: [recipe] }, null, 2)}\n`
  );
  const sourceDigest = (await fingerprintRecipe(root, recipe)).digest;
  const target = `${registry}/scholarserver-files:sha-${revision}-${architecture}`;
  const receiptPath = path.join(root, ".dev", "native-images", `${revision}-${architecture}.json`);
  const receiptContents = `${JSON.stringify(
    {
      format: 1,
      revision,
      architecture,
      registry,
      images: [
        {
          recipe: recipe.name,
          target,
          localImageId: imageId,
          configDigest,
          architecture,
          rootfsDiffIds: [rootfsDiffId],
          sourceDigest
        }
      ]
    },
    null,
    2
  )}\n`;
  await writeFile(receiptPath, receiptContents);
  const qualificationPath = path.join(root, ".dev", "native-images", `${revision}-${architecture}.qualified.json`);
  await writeFile(
    qualificationPath,
    `${JSON.stringify(
      {
        format: 1,
        revision,
        architecture,
        registry,
        buildReceiptDigest: `sha256:${createHash("sha256").update(receiptContents).digest("hex")}`,
        scopes: [
          "Files container and restart checks",
          "Obsidian native startup, user download and two-peer LiveSync check",
          "FreshRSS setup, MCP, restart and restore check",
          "n8n password-only setup and controller restart check"
        ]
      },
      null,
      2
    )}\n`
  );

  await makeExecutable(
    path.join(bin, "git"),
    `#!/bin/sh
case "$1:$2" in
  rev-parse:--show-toplevel) printf '%s\\n' "$MOCK_ROOT" ;;
  rev-parse:--verify) printf '%s\\n' "$MOCK_HEAD" ;;
  status:--porcelain=v1) [ -z "\${MOCK_GIT_STATUS:-}" ] || printf '%s\\n' "$MOCK_GIT_STATUS" ;;
  *) printf 'unexpected git command: %s\\n' "$*" >&2; exit 2 ;;
esac
`
  );
  await makeExecutable(
    path.join(bin, "docker"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$MOCK_DOCKER_LOG"
if [ "$1:$2" = "image:inspect" ]; then
  printf '%s\\n' "$MOCK_IMAGE_ID"
  exit 0
fi
if [ "$1" = tag ]; then exit 0; fi
if [ "$1:$2" = "manifest:inspect" ]; then
  if [ "$MOCK_REMOTE" = different ]; then
    printf '[{"Descriptor":{"digest":"sha256:%s","platform":{"os":"linux","architecture":"%s"}},"SchemaV2Manifest":{"config":{"digest":"%s"},"layers":[{"digest":"sha256:%s"}]}},{"Descriptor":{"digest":"sha256:%s","platform":{"os":"unknown","architecture":"unknown"}}}]\\n' "${"f".repeat(64)}" "$ARCH" "$MOCK_OTHER_IMAGE_ID" "${"e".repeat(64)}" "${"0".repeat(64)}"
    exit 0
  fi
  if [ "$MOCK_REMOTE" = same ] || [ -f "$MOCK_PUSH_STATE" ]; then
    printf '[{"Descriptor":{"digest":"sha256:%s","platform":{"os":"linux","architecture":"%s"}},"SchemaV2Manifest":{"config":{"digest":"%s"},"layers":[{"digest":"sha256:%s"}]}},{"Descriptor":{"digest":"sha256:%s","platform":{"os":"unknown","architecture":"unknown"}}}]\\n' "${"f".repeat(64)}" "$ARCH" "$MOCK_CONFIG_DIGEST" "${"e".repeat(64)}" "${"0".repeat(64)}"
    exit 0
  fi
  printf 'no such manifest: fixture\\n' >&2
  exit 1
fi
if [ "$1" = push ]; then
  : > "$MOCK_PUSH_STATE"
  exit 0
fi
printf 'unexpected docker command: %s\\n' "$*" >&2
exit 2
`
  );
  await makeExecutable(
    path.join(bin, "python3"),
    `#!/bin/sh
case "$1" in
  *inspect-native-image.py) printf '%s\\t%s\\t%s\\n' "$MOCK_CONFIG_DIGEST" "$ARCH" "$MOCK_ROOTFS_DIFF_ID" ;;
  *) printf 'unexpected python command: %s\\n' "$*" >&2; exit 2 ;;
esac
`
  );
  return { root, bin, qualificationPath, receiptPath, target };
}

async function withFixture(callback) {
  const value = await fixture();
  try {
    return await callback(value);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
}

function environment(value, overrides = {}) {
  return {
    ...process.env,
    PATH: `${value.bin}:${process.env.PATH}`,
    ARCH: architecture,
    REGISTRY: registry,
    REVISION: revision,
    NATIVE_IMAGE_ROOT: value.root,
    MOCK_ROOT: value.root,
    MOCK_HEAD: revision,
    MOCK_GIT_STATUS: "",
    MOCK_DOCKER_LOG: path.join(value.root, "docker.log"),
    MOCK_PUSH_STATE: path.join(value.root, "pushed"),
    MOCK_IMAGE_ID: imageId,
    MOCK_OTHER_IMAGE_ID: otherImageId,
    MOCK_CONFIG_DIGEST: configDigest,
    MOCK_ROOTFS_DIFF_ID: rootfsDiffId,
    MOCK_REMOTE: "missing",
    ...overrides
  };
}

async function dockerLog(value) {
  return readFile(path.join(value.root, "docker.log"), "utf8").catch(() => "");
}

test("source guard requires the full committed HEAD and includes nonignored untracked files", async () => {
  await withFixture(async (value) => {
    const mismatch = spawnSync(
      process.execPath,
      [receiptScript, "assert-source", "--root", value.root, "--revision", revision],
      { encoding: "utf8", env: environment(value, { MOCK_HEAD: otherRevision }) }
    );
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /does not match committed HEAD/);

    const dirty = spawnSync(
      process.execPath,
      [receiptScript, "assert-source", "--root", value.root, "--revision", revision],
      { encoding: "utf8", env: environment(value, { MOCK_GIT_STATUS: "?? untracked-source.mjs" }) }
    );
    assert.equal(dirty.status, 1);
    assert.match(dirty.stderr, /nonignored untracked changes/);

    const abbreviated = spawnSync(
      process.execPath,
      [receiptScript, "assert-source", "--root", value.root, "--revision", revision.slice(0, 12)],
      { encoding: "utf8", env: environment(value) }
    );
    assert.equal(abbreviated.status, 1);
    assert.match(abbreviated.stderr, /full lowercase 40-character/);
  });
});

test("source guard CLI executes through a symlinked directory", async () => {
  await withFixture(async (value) => {
    const commandAlias = path.join(value.root, "command-alias");
    await symlink(path.join(repositoryRoot, "scripts"), commandAlias, "dir");
    const result = spawnSync(
      process.execPath,
      [
        path.join(commandAlias, "native-image-receipt.mjs"),
        "assert-source",
        "--root",
        value.root,
        "--revision",
        revision
      ],
      { encoding: "utf8", env: environment(value, { MOCK_HEAD: otherRevision }) }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not match committed HEAD/);
  });
});

test("publish refuses stale revision and stale source before docker push", async () => {
  await withFixture(async (value) => {
    const staleRevision = spawnSync("sh", [publishScript], {
      encoding: "utf8",
      env: environment(value, { MOCK_HEAD: otherRevision })
    });
    assert.equal(staleRevision.status, 1);
    assert.doesNotMatch(await dockerLog(value), /^push /m);

    await writeFile(path.join(value.root, "source.txt"), "changed after build\n");
    const staleSource = spawnSync("sh", [publishScript], { encoding: "utf8", env: environment(value) });
    assert.equal(staleSource.status, 1);
    assert.match(staleSource.stderr, /Source changed after build/);
    assert.doesNotMatch(await dockerLog(value), /^push /m);
  });
});

test("publish requires a qualification bound to the build receipt before docker access", async () => {
  await withFixture(async (value) => {
    await rm(value.qualificationPath);
    const result = spawnSync("sh", [publishScript], { encoding: "utf8", env: environment(value) });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /native test qualification/i);
    assert.equal(await dockerLog(value), "");
  });
});

test("publish refuses to replace an immutable tag with different image content", async () => {
  await withFixture(async (value) => {
    const result = spawnSync("sh", [publishScript], {
      encoding: "utf8",
      env: environment(value, { MOCK_REMOTE: "different" })
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Refusing to replace immutable tag/);
    assert.doesNotMatch(await dockerLog(value), /^push /m);
  });
});

test("publish retags and verifies the exact receipt image ID", async () => {
  await withFixture(async (value) => {
    const result = spawnSync("sh", [publishScript], { encoding: "utf8", env: environment(value) });
    assert.equal(result.status, 0, result.stderr);
    const log = await dockerLog(value);
    assert.match(log, new RegExp(`^tag ${imageId} ${value.target}$`, "m"));
    assert.match(log, new RegExp(`^push ${value.target}$`, "m"));
    assert.match(result.stdout, /Published verified image/);
    assert.notEqual(imageId, configDigest, "containerd local selection ID differs from portable config digest");
  });
});

test("immutable multi-architecture manifest comparison requires the same platform digests", async () => {
  await withFixture(async (value) => {
    const amd64 = path.join(value.root, "amd64.json");
    const arm64 = path.join(value.root, "arm64.json");
    const existing = path.join(value.root, "existing.json");
    const amd64Descriptor = {
      digest: `sha256:${"3".repeat(64)}`,
      platform: { os: "linux", architecture: "amd64" }
    };
    const arm64Descriptor = {
      digest: `sha256:${"4".repeat(64)}`,
      platform: { os: "linux", architecture: "arm64", variant: "v8" }
    };
    await writeFile(amd64, JSON.stringify({ Descriptor: amd64Descriptor }));
    await writeFile(arm64, JSON.stringify({ Descriptor: arm64Descriptor }));
    await writeFile(existing, JSON.stringify([arm64Descriptor, amd64Descriptor]));

    const accepted = spawnSync(
      process.execPath,
      [receiptScript, "compare-manifest", "--existing", existing, "--source", amd64, "--source", arm64],
      { encoding: "utf8" }
    );
    assert.equal(accepted.status, 0, accepted.stderr);

    await writeFile(existing, JSON.stringify([{ ...amd64Descriptor, digest: otherImageId }, arm64Descriptor]));
    const rejected = spawnSync(
      process.execPath,
      [receiptScript, "compare-manifest", "--existing", existing, "--source", amd64, "--source", arm64],
      { encoding: "utf8" }
    );
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /different content/);
  });
});

test("build and scanner failures cannot reach a registry push", async () => {
  await withFixture(async (value) => {
    await makeExecutable(
      path.join(value.bin, "node"),
      `#!/bin/sh
case "$*" in
  *fingerprint*) printf '%s\\n' "sha256:${"c".repeat(64)}" ;;
esac
exit 0
`
    );
    await makeExecutable(
      path.join(value.bin, "docker"),
      `#!/bin/sh
printf '%s\\n' "$*" >> "$MOCK_DOCKER_LOG"
if [ "$1" = build ]; then [ "\${MOCK_BUILD_FAIL:-0}" != 1 ]; exit $?; fi
if [ "$1:$2" = "image:inspect" ]; then
  case "$*" in
    *Architecture*) printf '%s\\n' "$ARCH" ;;
    *) printf '%s\\n' "$MOCK_IMAGE_ID" ;;
  esac
  exit 0
fi
if [ "$1" = tag ]; then exit 0; fi
printf 'unexpected docker command: %s\\n' "$*" >&2
exit 2
`
    );
    await makeExecutable(path.join(value.bin, "python3"), `#!/bin/sh\nexit "\${MOCK_SCANNER_STATUS:-0}"\n`);
    await makeExecutable(path.join(value.bin, "bash"), `#!/bin/sh\nexit "\${MOCK_TEST_STATUS:-0}"\n`);

    const baseEnvironment = environment(value);
    const failedBuild = spawnSync("sh", [buildScriptPath], {
      encoding: "utf8",
      env: { ...baseEnvironment, MOCK_BUILD_FAIL: "1" }
    });
    assert.equal(failedBuild.status, 1);
    assert.doesNotMatch(await dockerLog(value), /^push /m);

    await writeFile(path.join(value.root, "docker.log"), "");
    const failedScanner = spawnSync("sh", [buildScriptPath], {
      encoding: "utf8",
      env: { ...baseEnvironment, MOCK_SCANNER_STATUS: "1" }
    });
    assert.equal(failedScanner.status, 1);
    assert.doesNotMatch(await dockerLog(value), /^push /m);
  });
});

test("failed named native gate removes qualification and blocks any later push", async () => {
  await withFixture(async (value) => {
    await makeExecutable(path.join(value.bin, "bash"), "#!/bin/sh\nexit 1\n");
    const gateResult = spawnSync("sh", [testScriptPath], { encoding: "utf8", env: environment(value) });
    assert.equal(gateResult.status, 1, gateResult.stderr);
    await assert.rejects(() => readFile(value.qualificationPath), { code: "ENOENT" });
    assert.doesNotMatch(await dockerLog(value), /^push /m);

    const publishResult = spawnSync("sh", [publishScript], { encoding: "utf8", env: environment(value) });
    assert.equal(publishResult.status, 1);
    assert.doesNotMatch(await dockerLog(value), /^push /m);
  });
});

test("workflow publishes only after the named native qualification entry point", async () => {
  const workflow = await readFile(path.join(repositoryRoot, ".github/workflows/images.yml"), "utf8");
  const build = workflow.indexOf("Build native images without publishing");
  const qualificationGate = workflow.indexOf("Run the named native qualification gates");
  const publish = workflow.indexOf("Publish the exact images that passed the native gates");
  assert.ok(build >= 0 && build < qualificationGate);
  assert.ok(qualificationGate < publish);

  const buildJob = workflow.slice(0, workflow.indexOf("\n  manifest:"));
  assert.doesNotMatch(buildJob, /docker (?:image )?push|docker manifest push/);

  const buildScript = await readFile(buildScriptPath, "utf8");
  assert.doesNotMatch(buildScript, /docker push/);
  const nativeTestScript = await readFile(testScriptPath, "utf8");
  assert.match(nativeTestScript, /apps\/files\/test-container\.sh/);
  assert.match(nativeTestScript, /apps\/files\/test-restart\.sh/);
  assert.match(nativeTestScript, /check-obsidian-packaging\.py/);
  assert.match(nativeTestScript, /apps\/freshrss\/test-container\.sh/);
  assert.match(
    nativeTestScript,
    /N8N_IMAGE="\$n8n_image" INTEGRATION_IMAGE="\$integration_image" bash apps\/n8n\/test-container\.sh/
  );
  assert.match(nativeTestScript, /write-qualification/);
  assert.doesNotMatch(nativeTestScript, /docker (?:image )?push|docker manifest push/);

  const n8nWorkflow = await readFile(path.join(repositoryRoot, ".github/workflows/n8n-candidate.yml"), "utf8");
  assert.match(n8nWorkflow, /without publishing/);
  assert.doesNotMatch(n8nWorkflow, /docker (?:image )?push|docker manifest push|docker\/login-action/);
  assert.match(n8nWorkflow, /native-image-receipt\.mjs assert-source/);
  assert.match(n8nWorkflow, /check-image-contents\.py/);
});
