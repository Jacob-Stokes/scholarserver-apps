import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

export const project = "scholarserver-test-desktops";
const composeFile = fileURLToPath(new URL("./compose.yaml", import.meta.url));
const definition = parse(readFileSync(composeFile, "utf8"));

export function localEnvironment(environment, inspectContext) {
  let endpoint = environment.DOCKER_HOST;
  if (environment.DOCKER_CONTEXT || !endpoint) endpoint = inspectContext(environment.DOCKER_CONTEXT);
  if (!endpoint?.startsWith("unix:///")) throw new Error("Only a local Unix Docker socket is allowed.");
  const result = { ...environment, DOCKER_HOST: endpoint, COMPOSE_REMOVE_ORPHANS: "0" };
  delete result.DOCKER_CONTEXT;
  return result;
}

export function checkLabels(labels, kind, owner) {
  if (labels?.["com.docker.compose.project"] !== project || labels?.[`com.docker.compose.${kind}`] !== owner) {
    throw new Error(`Refusing unrelated ${kind} resource: ${owner}.`);
  }
}

function docker(args, env, capture = true) {
  const result = spawnSync("docker", args, {
    env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(capture ? result.stderr.trim() : "Docker command failed.");
  return result.stdout?.trim();
}

function inspectIfPresent(kind, name, env, runDocker) {
  const names = runDocker([kind, "ls", "--format", "{{.Name}}"], env);
  if (!names.split("\n").includes(name)) return null;
  return JSON.parse(runDocker([kind, "inspect", name], env))[0];
}

function checkOwnership(env, runDocker) {
  for (const name of Object.keys(definition.volumes)) {
    const found = inspectIfPresent("volume", `${project}_${name}`, env, runDocker);
    if (found) checkLabels(found.Labels, "volume", name);
  }
  const network = inspectIfPresent("network", `${project}_default`, env, runDocker);
  if (network) checkLabels(network.Labels, "network", "default");
  const expectedNames = Object.keys(definition.services).map((service) => `${project}-${service}-1`);
  const projectNames = runDocker(
    ["container", "ls", "--all", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Names}}"],
    env
  )
    .split("\n")
    .filter(Boolean);
  for (const name of projectNames) {
    if (!expectedNames.includes(name))
      throw new Error(`Unexpected desktop-project container ${name}; inspect it before changing the project.`);
  }
  const containerNames = runDocker(["container", "ls", "--all", "--format", "{{.Names}}"], env).split("\n");
  for (const service of Object.keys(definition.services)) {
    const name = `${project}-${service}-1`;
    if (!containerNames.includes(name)) continue;
    const found = JSON.parse(runDocker(["container", "inspect", name], env))[0];
    checkLabels(found.Config.Labels, "service", service);
  }
}

export function main(command = process.argv[2], { environment = process.env, runDocker = docker } = {}) {
  if (!["start", "stop", "status"].includes(command)) {
    throw new Error("Usage: node dev/desktop-clients/command.mjs <start|stop|status>");
  }
  const env = localEnvironment(environment, (context) => {
    const chosen = context || runDocker(["context", "show"], environment);
    return runDocker(["context", "inspect", chosen, "--format", '{{(index .Endpoints "docker").Host}}'], environment);
  });
  const architecture = runDocker(["info", "--format", "{{.OSType}}/{{.Architecture}}"], env);
  if (!["linux/aarch64", "linux/arm64"].includes(architecture)) {
    throw new Error("This desktop lab is qualified only for native ARM64 Linux Docker on this Mac.");
  }
  checkOwnership(env, runDocker);
  const compose = ["compose", "--project-name", project, "--file", composeFile];
  if (command === "start") {
    for (const [name, service] of Object.entries(definition.services)) {
      const identity = runDocker(["image", "inspect", service.image, "--format", "{{.Architecture}} {{.Id}}"], env);
      const [arch, imageId] = identity.split(" ");
      if (arch !== "arm64") throw new Error("Refusing a non-native desktop image.");
      if (imageId !== definition["x-qualified-image-ids"][name]) {
        throw new Error(`${name} image differs from its qualified ID. Review the rebuild before changing the receipt.`);
      }
    }
    runDocker([...compose, "up", "--detach", "--wait", "--wait-timeout", "120"], env, false);
  } else if (command === "stop") {
    runDocker([...compose, "stop", "--timeout", "30"], env, false);
    console.log("Test desktops stopped. Both profile volumes are preserved.");
    return;
  }
  runDocker([...compose, "ps"], env, false);
  console.log("Obsidian test desktop: http://127.0.0.1:18330/");
  console.log("Zotero test desktop: http://127.0.0.1:18331/vnc.html?autoconnect=true&resize=scale");
  console.log("These are isolated Linux clients, not native Mac apps or a server installation.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 3) throw new Error("Extra command arguments are refused.");
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
