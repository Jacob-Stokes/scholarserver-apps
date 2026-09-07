import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

test("Anki remains outside release discovery with a recognised release block", async () => {
  await access("apps/anki/RELEASE_BLOCKED.md");
  await assert.rejects(access("apps/anki/package/scholarserver-app.yaml"), { code: "ENOENT" });
  const release = await readFile("scripts/build-release.sh", "utf8");
  assert.match(release, /apps\/\*\/package\/scholarserver-app.yaml/);
  assert.match(release, /RELEASE_BLOCKED.md/);
});

test("draft services declare storage, private ports, health and separate sync data", async () => {
  for (const option of ["desktop", "sync-only"]) {
    const base = `apps/anki/development/${option}`;
    const manifest = parse(await readFile(`${base}/scholarserver-app.yaml`, "utf8"));
    const compose = parse(await readFile(`${base}/compose.yaml`, "utf8"));
    assert.equal(manifest.lifecycle.removeDataDefault, false);
    assert.ok(
      manifest.data.every((binding) => binding.retention === "preserve" && binding.backup === "filesystem-consistent")
    );
    for (const [id, service] of Object.entries(compose.services)) {
      assert.equal(service.ports, undefined);
      assert.equal(service.container_name, undefined);
      assert.equal(service.environment, undefined);
      assert.equal(service.healthcheck.test[0], "CMD");
      assert.equal(manifest.images.find((image) => image.service === id).reference, service.image);
      assert.match(service.image, /@sha256:0{64}$/);
      for (const volume of service.volumes) {
        const [source, target] = volume.split(":");
        assert.ok(
          manifest.data.some(
            (binding) =>
              source === `\${SCHOLARSERVER_DATA_${binding.id.replaceAll("-", "_").toUpperCase()}}` &&
              target === binding.mountPath
          )
        );
      }
    }
    if (option === "sync-only") {
      assert.equal(compose.services.mcp, undefined);
      assert.equal(compose.services.desktop, undefined);
      assert.ok(manifest.endpoints.every((endpoint) => !endpoint.gateway));
    } else {
      assert.equal(
        compose.services.desktop.volumes.some((volume) => volume.includes("DATA_SYNC}")),
        false
      );
      assert.equal(
        compose.services.sync.volumes.some((volume) => volume.includes("DATA_DESKTOP}")),
        false
      );
      assert.deepEqual(compose.services.mcp.networks.instance.aliases, ["anki-mcp"]);
      const ankiweb = manifest.variants.find((variant) => variant.id === "ankiweb-desktop");
      assert.ok(!ankiweb.services.includes("sync"));
    }
  }
});
