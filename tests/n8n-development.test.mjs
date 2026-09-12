import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";
import { parse } from "yaml";
import {
  backendContainerIdentity,
  composeEnvironment,
  developmentPorts,
  developmentProject,
  developmentServiceUrl,
  developmentSetupRequest,
  freezeDockerEnvironment,
  loadDevelopmentDefinition,
  loadOrCreateDevelopmentPassword,
  resolveConfiguredDockerEndpoint,
  validateComposeResourceLabels,
  validateLocalDockerEndpoint,
  validateSetupResponse
} from "../dev/n8n/command.mjs";
import { createN8nDevelopmentConfig } from "../dev/n8n/vite.config.mjs";

async function repositoryFile(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("development backends derive the final beta.6 package image selection", async () => {
  const definition = await loadDevelopmentDefinition();
  const environment = composeEnvironment(definition, {});
  assert.equal(definition.packageVersion, "0.1.0-beta.6");
  assert.match(environment.N8N_IMAGE, /^ghcr\.io\/jacob-stokes\/scholarserver-n8n@sha256:[a-f0-9]{64}$/);
  assert.match(
    environment.N8N_INTEGRATION_IMAGE,
    /^ghcr\.io\/jacob-stokes\/scholarserver-n8n-app@sha256:[a-f0-9]{64}$/
  );

  const compose = parse(await repositoryFile("dev/n8n/compose.yaml"));
  assert.equal(compose.name, developmentProject);
  assert.match(compose.services.n8n.image, /^\$\{N8N_IMAGE:/);
  assert.match(compose.services.integration.image, /^\$\{N8N_INTEGRATION_IMAGE:/);
  assert.doesNotMatch(await repositoryFile("dev/n8n/compose.yaml"), /ghcr\.io|@sha256:/);
});

test("development publishes only fixed loopback ports and mounts no host data", async () => {
  const compose = parse(await repositoryFile("dev/n8n/compose.yaml"));
  assert.deepEqual(compose.services.n8n.ports, [`127.0.0.1:${developmentPorts.nativeEditor}:5678`]);
  assert.deepEqual(compose.services.integration.ports, [`127.0.0.1:${developmentPorts.integration}:8080`]);
  assert.deepEqual(Object.keys(compose.services).sort(), ["integration", "n8n", "volume-init"]);
  assert.deepEqual(compose.services.integration.networks, ["backend", "ui"]);
  assert.deepEqual(compose.networks.ui, {});
  assert.equal(compose.networks.backend.internal, true);

  for (const service of [compose.services.n8n, compose.services.integration]) {
    assert.equal(service.build, undefined);
    assert.equal(service.command, undefined);
    assert.equal(service.entrypoint, undefined);
    assert.equal(service.environment, undefined);
    for (const volume of service.volumes ?? []) {
      const source = volume.split(":", 1)[0];
      assert.ok(source in compose.volumes, `development volume must be Compose-owned: ${source}`);
    }
    for (const port of service.ports ?? []) assert.match(port, /^127\.0\.0\.1:/);
  }
  const volumeInit = compose.services["volume-init"];
  assert.equal(volumeInit.image, compose.services.integration.image);
  assert.equal(volumeInit.network_mode, "none");
  assert.deepEqual(volumeInit.cap_add, ["CHOWN", "FOWNER"]);
  assert.deepEqual(volumeInit.cap_drop, ["ALL"]);
  assert.deepEqual(compose.services.n8n.depends_on["volume-init"], { condition: "service_completed_successfully" });
  assert.match(volumeInit.command[0], /chown\(directory, 1000, 1000\)/);
  assert.match(volumeInit.command[0], /chmod\(directory, 0o700\)/);
  assert.equal(volumeInit.ports, undefined);
  assert.equal(volumeInit.environment, undefined);
});

test("Vite serves source HMR on the fixed frontend and shows source/backend identity", () => {
  const config = createN8nDevelopmentConfig({
    sourceIdentity: "startup baseline abc123 + live UI working tree",
    backendIdentity: "0.1.0-beta.6 · n8n 111111111111 · integration 222222222222"
  });
  assert.equal(config.server.host, "127.0.0.1");
  assert.equal(config.server.port, developmentPorts.frontend);
  assert.equal(config.server.strictPort, true);
  assert.equal(config.server.cors, false);
  assert.deepEqual(config.server.fs.deny, [
    ".env",
    ".env.*",
    "*.{crt,pem}",
    "**/.git/**",
    "**/.dev/**",
    "**/secrets/**",
    "**/*.token"
  ]);
  assert.equal(config.server.proxy["/api"].target, `http://127.0.0.1:${developmentPorts.integration}`);
  const identityPlugin = config.plugins.find((plugin) => plugin.name === "scholarserver-n8n-development-identity");
  const transformed = identityPlugin.transformIndexHtml();
  const banner = transformed.find((entry) => entry.tag === "aside");
  assert.match(
    banner.children,
    /HMR UI · source startup baseline abc123 \+ live UI working tree · pinned backend 0\.1\.0-beta\.6/
  );
});

test("Docker access is local-only and existing resource labels must identify this project", () => {
  assert.equal(
    validateLocalDockerEndpoint("unix:///Users/example/.docker/run/docker.sock"),
    "unix:///Users/example/.docker/run/docker.sock"
  );
  for (const endpoint of [
    "ssh://builder.example",
    "tcp://127.0.0.1:2375",
    "https://docker.example",
    "unix://relative.sock"
  ]) {
    assert.throws(() => validateLocalDockerEndpoint(endpoint), /local unix Docker socket/);
  }

  const contradictory = { DOCKER_CONTEXT: "remote-builder", DOCKER_HOST: "unix:///var/run/docker.sock" };
  assert.throws(
    () => resolveConfiguredDockerEndpoint(contradictory, () => "ssh://builder.example"),
    /local unix Docker socket/
  );
  assert.equal(
    resolveConfiguredDockerEndpoint(
      { DOCKER_CONTEXT: "desktop-linux", DOCKER_HOST: "ssh://builder.example" },
      () => "unix:///Users/example/.docker/run/docker.sock"
    ),
    "unix:///Users/example/.docker/run/docker.sock"
  );
  assert.deepEqual(freezeDockerEnvironment(contradictory, "unix:///Users/example/.docker/run/docker.sock"), {
    DOCKER_HOST: "unix:///Users/example/.docker/run/docker.sock"
  });

  assert.doesNotThrow(() =>
    validateComposeResourceLabels({
      kind: "volume",
      name: "scholarserver-n8n-dev-state",
      labels: {
        "com.docker.compose.project": developmentProject,
        "com.docker.compose.volume": "n8n-state"
      },
      composeName: "n8n-state"
    })
  );
  assert.throws(
    () =>
      validateComposeResourceLabels({
        kind: "service",
        name: "scholarserver-n8n-dev-n8n-1",
        labels: { "com.docker.compose.project": "foreign-project", "com.docker.compose.service": "n8n" },
        composeName: "n8n"
      }),
    /Refusing existing service/
  );
});

test("running backend identity compares configured and local image IDs separately", () => {
  const expected = "registry.example/n8n@sha256:" + "a".repeat(64);
  const actualId = "sha256:" + "b".repeat(64);
  assert.deepEqual(
    backendContainerIdentity({ Config: { Image: expected }, Image: actualId, State: { Status: "running" } }, expected),
    {
      configuredImage: expected,
      imageId: actualId,
      state: "running",
      matchesCurrentPackage: true
    }
  );
  assert.equal(
    backendContainerIdentity(
      { Config: { Image: "registry.example/n8n@sha256:" + "c".repeat(64) }, Image: actualId },
      expected
    ).matchesCurrentPackage,
    false
  );
});

test("Vite refuses repository development secrets and cross-origin reads", async (t) => {
  const ignoredRoot = new URL("../.dev/", import.meta.url);
  await mkdir(ignoredRoot, { recursive: true });
  const privateDirectory = await mkdtemp(new URL("n8n-vite-deny-", ignoredRoot));
  t.after(() => rm(privateDirectory, { recursive: true, force: true }));
  const privateFile = path.join(privateDirectory, "owner-password");
  const marker = "development-secret-must-not-be-served";
  await writeFile(privateFile, marker, { mode: 0o600 });

  const config = createN8nDevelopmentConfig({
    sourceIdentity: "security-smoke",
    backendIdentity: "security-smoke"
  });
  const server = await createServer({
    ...config,
    configFile: false,
    server: { ...config.server, port: 0, strictPort: false }
  });
  t.after(() => server.close());
  await server.listen();
  const address = server.httpServer.address();
  assert.equal(typeof address, "object");
  const origin = `http://127.0.0.1:${address.port}`;

  const privateResponse = await fetch(`${origin}/@fs/${privateFile}`);
  const privateBody = await privateResponse.text();
  assert.ok([403, 404].includes(privateResponse.status));
  assert.doesNotMatch(privateBody, new RegExp(marker));

  const crossOriginResponse = await fetch(origin, { headers: { origin: "https://example.invalid" } });
  await crossOriginResponse.body?.cancel();
  assert.equal(crossOriginResponse.headers.get("access-control-allow-origin"), null);
});

test("explicit initialization uses the existing queue shape without a Manager service", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "n8n-development-password-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = await loadOrCreateDevelopmentPassword(directory);
  const second = await loadOrCreateDevelopmentPassword(directory);
  assert.equal(second, first);
  assert.match(first, /[A-Z]/);
  assert.match(first, /\d/);
  assert.equal((await stat(path.join(directory, "owner-password"))).mode & 0o777, 0o600);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);

  const token = "a".repeat(43);
  assert.deepEqual(developmentSetupRequest(first, token), {
    action: "setup",
    input: {
      password: first,
      scholarserverService: { url: developmentServiceUrl, token }
    }
  });
  const compose = parse(await repositoryFile("dev/n8n/compose.yaml"));
  assert.equal(compose.services["scholarserver-manager"], undefined);
  assert.equal(compose.services.integration.extra_hosts, undefined);
});

test("setup responses are bounded and cannot reflect submitted secrets", () => {
  const password = "PrivatePassword9";
  const token = "b".repeat(43);
  assert.deepEqual(
    validateSetupResponse('{"ok":true,"result":{"connected":true,"phase":"ready"}}', [password, token]),
    {
      ok: true,
      result: { connected: true, phase: "ready" }
    }
  );
  assert.throws(() => validateSetupResponse(`{"ok":false,"error":"${password}"}`, [password, token]), /secret/);
  assert.throws(() => validateSetupResponse(`{"ok":true,"padding":"${"x".repeat(17000)}"}`, []), /exceeded/);
  assert.throws(() => validateSetupResponse('{"_blob":true}', []), /incomplete/);
});
