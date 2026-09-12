import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "yaml";
import { checkLabels, localEnvironment, main, project } from "../dev/desktop-clients/command.mjs";

test("desktop clients refuse remote Docker and freeze the selected local endpoint", () => {
  for (const endpoint of ["ssh://freelove", "tcp://127.0.0.1:2375", "https://remote"]) {
    assert.throws(() => localEnvironment({ DOCKER_HOST: endpoint }, () => "unused"), /local Unix/);
  }
  assert.deepEqual(
    localEnvironment({ DOCKER_CONTEXT: "desktop-linux" }, () => "unix:///local.sock"),
    {
      DOCKER_HOST: "unix:///local.sock",
      COMPOSE_REMOVE_ORPHANS: "0"
    }
  );
  assert.throws(() =>
    localEnvironment({ DOCKER_CONTEXT: "remote", DOCKER_HOST: "unix:///local.sock" }, () => "ssh://remote")
  );
});

test("inherited orphan-removal settings cannot delete other project containers", () => {
  const env = localEnvironment({ DOCKER_HOST: "unix:///local.sock", COMPOSE_REMOVE_ORPHANS: "1" }, () => "unused");
  assert.equal(env.COMPOSE_REMOVE_ORPHANS, "0");
});

function simulatedDocker({ unexpectedContainer = false, imageDrift = false, startupFailure = false } = {}) {
  const calls = [];
  const compose = parse(readFileSync(new URL("../dev/desktop-clients/compose.yaml", import.meta.url), "utf8"));
  const runDocker = (args, env) => {
    calls.push(args);
    assert.equal(env.COMPOSE_REMOVE_ORPHANS, "0");
    if (args[0] === "info") return "linux/aarch64";
    if (args[1] === "ls") {
      if (args.includes("--filter") && unexpectedContainer) return `${project}-unexpected-1`;
      return "";
    }
    if (args[0] === "image") {
      const service = Object.entries(compose.services).find(([, value]) => value.image === args[2])[0];
      const id = imageDrift ? `sha256:${"0".repeat(64)}` : compose["x-qualified-image-ids"][service];
      return `arm64 ${id}`;
    }
    if (args[0] === "compose") {
      if (startupFailure && args.includes("up")) throw new Error("desktop startup failed");
      return "";
    }
    throw new Error(`Unexpected simulated command: ${args.join(" ")}`);
  };
  return {
    calls,
    options: { environment: { DOCKER_HOST: "unix:///local.sock", COMPOSE_REMOVE_ORPHANS: "1" }, runDocker }
  };
}

test("start refuses unexpected same-project containers before any compose mutation", () => {
  const simulation = simulatedDocker({ unexpectedContainer: true });
  assert.throws(() => main("start", simulation.options), /Unexpected desktop-project/);
  assert.ok(!simulation.calls.some((args) => args[0] === "compose"));
});

test("start refuses image-ID drift before profile volumes can be mounted", () => {
  const simulation = simulatedDocker({ imageDrift: true });
  assert.throws(() => main("start", simulation.options), /qualified ID/);
  assert.ok(!simulation.calls.some((args) => args[0] === "compose"));
});

test("failed startup propagates without resetting or deleting any resources", () => {
  const simulation = simulatedDocker({ startupFailure: true });
  assert.throws(() => main("start", simulation.options), /desktop startup failed/);
  assert.equal(simulation.calls.filter((args) => args[0] === "compose").length, 1);
  assert.ok(!simulation.calls.flat().some((arg) => ["down", "rm", "prune", "--remove-orphans"].includes(arg)));
});

test("stop uses only volume-preserving compose stop", () => {
  const simulation = simulatedDocker();
  main("stop", simulation.options);
  const commands = simulation.calls.filter((args) => args[0] === "compose");
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].slice(-3), ["stop", "--timeout", "30"]);
});

test("existing resources must carry this desktop project's exact ownership", () => {
  checkLabels(
    { "com.docker.compose.project": project, "com.docker.compose.volume": "zotero-profile" },
    "volume",
    "zotero-profile"
  );
  assert.throws(() => checkLabels({}, "volume", "zotero-profile"), /unrelated/);
  assert.throws(() => checkLabels({ "com.docker.compose.project": "scholarserver-n8n-dev" }, "service", "zotero"));
});

test("desktop profiles are separate named volumes with loopback-only GUI ports", () => {
  const compose = parse(readFileSync(new URL("../dev/desktop-clients/compose.yaml", import.meta.url), "utf8"));
  assert.equal(compose.name, project);
  assert.deepEqual(Object.keys(compose.services).sort(), ["obsidian", "zotero"]);
  for (const [name, service] of Object.entries(compose.services)) {
    assert.deepEqual(service.volumes, [`${name}-profile:/config`]);
    assert.ok(service.ports.every((port) => port.startsWith("127.0.0.1:")));
    assert.equal(service.privileged, undefined);
    assert.equal(service.network_mode, undefined);
    assert.equal(service.devices, undefined);
    assert.ok(service.security_opt.includes("no-new-privileges:true"));
    assert.ok(service.mem_limit);
    assert.equal(service.pull_policy, "never");
  }
});
