import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, link, lstat, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";
import { packageTestImages } from "../../apps/n8n/check-package.mjs";
import { assertCandidateMatches, candidateDefinition, candidateSourceDigest } from "./candidate.mjs";

export const developmentProject = "scholarserver-n8n-dev";
export const developmentPorts = Object.freeze({ frontend: 18320, integration: 18321, nativeEditor: 18322 });
export const developmentServiceUrl = "http://scholarserver-manager:8080/api/v1/service";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const composeFile = path.join(repositoryRoot, "dev/n8n/compose.yaml");
const viteConfig = path.join(repositoryRoot, "dev/n8n/vite.config.mjs");
const localStateDirectory = path.join(repositoryRoot, ".dev/n8n");
const passwordFile = path.join(localStateDirectory, "owner-password");
const vitePidFile = path.join(localStateDirectory, "vite.pid");
const viteIdentityFile = path.join(localStateDirectory, "vite-identity");
const viteLogFile = path.join(localStateDirectory, "vite.log");
const candidateFile = path.join(localStateDirectory, "candidate.json");
const maximumSetupResponseBytes = 16 * 1024;
const ownedVolumes = [
  { name: "scholarserver-n8n-dev-state", composeName: "n8n-state" },
  { name: "scholarserver-n8n-dev-cache", composeName: "n8n-cache" },
  { name: "scholarserver-n8n-dev-integration-runtime", composeName: "integration-runtime" }
];
const ownedContainers = [
  { name: "scholarserver-n8n-dev-volume-init-1", service: "volume-init" },
  { name: "scholarserver-n8n-dev-n8n-1", service: "n8n" },
  { name: "scholarserver-n8n-dev-integration-1", service: "integration" }
];
let validatedDockerEnvironment = process.env;

async function readYaml(relativePath, root = repositoryRoot) {
  return parse(await readFile(path.join(root, relativePath), "utf8"));
}

function shortDigest(reference) {
  return reference.match(/@sha256:([a-f0-9]{12})/)?.[1] ?? "unknown";
}

export async function loadDevelopmentDefinition(root = repositoryRoot) {
  const manifest = await readYaml("apps/n8n/package/scholarserver-app.yaml", root);
  const packageCompose = await readYaml("apps/n8n/package/compose.yaml", root);
  const images = packageTestImages(manifest, packageCompose);
  const setupAction = manifest.onboarding.actions.find((action) => action.id === "setup");
  if (!Number.isInteger(setupAction.timeoutSeconds) || setupAction.timeoutSeconds < 1) {
    throw new Error("The package setup action must declare a positive timeout.");
  }
  return {
    packageVersion: manifest.packageVersion,
    n8nImage: images.N8N_IMAGE,
    integrationImage: images.INTEGRATION_IMAGE,
    setupTimeoutSeconds: setupAction.timeoutSeconds,
    backendIdentity: `${manifest.packageVersion} · n8n ${shortDigest(images.N8N_IMAGE)} · integration ${shortDigest(images.INTEGRATION_IMAGE)}`
  };
}

export function composeEnvironment(definition, environment = process.env) {
  return {
    ...environment,
    N8N_IMAGE: definition.n8nImage,
    N8N_INTEGRATION_IMAGE: definition.integrationImage
  };
}

export function developmentSetupRequest(password, serviceToken) {
  return {
    action: "setup",
    input: {
      password,
      // This satisfies beta.6's exact queue input contract but cannot grant
      // access: the development stack has no Manager service or route.
      scholarserverService: { url: developmentServiceUrl, token: serviceToken }
    }
  };
}

export function validateSetupResponse(rawResponse, secrets) {
  if (Buffer.byteLength(rawResponse) > maximumSetupResponseBytes) {
    throw new Error("The setup response exceeded the development limit. Check status before trying again.");
  }
  for (const secret of secrets) {
    if (secret && rawResponse.includes(secret)) {
      throw new Error("The setup response contained secret input and was refused.");
    }
  }
  let response;
  try {
    response = JSON.parse(rawResponse);
  } catch {
    throw new Error("The setup response was unreadable. Check status before trying again.");
  }
  if (!response || typeof response !== "object" || typeof response.ok !== "boolean") {
    throw new Error("The setup response was incomplete. Check status before trying again.");
  }
  if (response.ok && (response.result?.connected !== true || response.result?.phase !== "ready")) {
    throw new Error("The setup response did not confirm a ready connection. Check status before trying again.");
  }
  if (!response.ok && typeof response.error !== "string") {
    throw new Error("The setup response did not explain its refusal. Check status before trying again.");
  }
  return response;
}

function run(file, argumentsList, { env = process.env, input, stdio = "inherit", timeout } = {}) {
  const result = spawnSync(file, argumentsList, {
    cwd: repositoryRoot,
    env,
    input,
    stdio,
    encoding: stdio === "pipe" ? "utf8" : undefined,
    maxBuffer: 1024 * 1024,
    timeout
  });
  if (result.error) throw result.error;
  return result;
}

function composeArguments(...argumentsList) {
  return ["compose", "--project-name", developmentProject, "--file", composeFile, ...argumentsList];
}

function runCompose(definition, argumentsList, options = {}) {
  return run("docker", composeArguments(...argumentsList), {
    ...options,
    env: composeEnvironment(definition, options.env ?? validatedDockerEnvironment)
  });
}

function normalizeArchitecture(value) {
  const architecture = value.trim().toLowerCase();
  if (["arm64", "aarch64"].includes(architecture)) return "arm64";
  if (["amd64", "x86_64"].includes(architecture)) return "amd64";
  return architecture;
}

export function validateLocalDockerEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !endpoint.startsWith("unix:///")) {
    throw new Error("n8n local development requires a local unix Docker socket; SSH and TCP endpoints are refused.");
  }
  return endpoint;
}

function inspectDockerContext(context, environment) {
  const endpointResult = run(
    "docker",
    ["context", "inspect", context, "--format", '{{ (index .Endpoints "docker").Host }}'],
    { env: environment, stdio: "pipe" }
  );
  if (endpointResult.status !== 0) throw new Error(`Could not inspect Docker context ${context}.`);
  return validateLocalDockerEndpoint(endpointResult.stdout.trim());
}

export function resolveConfiguredDockerEndpoint(environment, inspectContext) {
  const explicitContext = environment.DOCKER_CONTEXT?.trim();
  if (explicitContext) return validateLocalDockerEndpoint(inspectContext(explicitContext));
  const explicitHost = environment.DOCKER_HOST?.trim();
  if (explicitHost) return validateLocalDockerEndpoint(explicitHost);
  return null;
}

export function freezeDockerEnvironment(environment, endpoint) {
  const frozen = { ...environment, DOCKER_HOST: validateLocalDockerEndpoint(endpoint) };
  delete frozen.DOCKER_CONTEXT;
  return frozen;
}

function currentDockerEndpoint(environment = process.env) {
  const configured = resolveConfiguredDockerEndpoint(environment, (context) =>
    inspectDockerContext(context, environment)
  );
  if (configured) return configured;
  const contextResult = run("docker", ["context", "show"], { env: environment, stdio: "pipe" });
  if (contextResult.status !== 0) throw new Error("Could not determine the active Docker context.");
  return inspectDockerContext(contextResult.stdout.trim(), environment);
}

function dockerArchitecture({ required = true } = {}) {
  const endpoint = currentDockerEndpoint();
  validatedDockerEnvironment = freezeDockerEnvironment(process.env, endpoint);
  const result = run("docker", ["info", "--format", "{{.Architecture}}"], {
    env: validatedDockerEnvironment,
    stdio: "pipe"
  });
  if (result.status !== 0) {
    if (!required) return null;
    throw new Error("Docker is not running. Start it yourself, then run the n8n development command again.");
  }
  return normalizeArchitecture(result.stdout);
}

function requireDocker() {
  return dockerArchitecture({ required: true });
}

export function validateComposeResourceLabels({ kind, name, labels, composeName }) {
  const project = labels?.["com.docker.compose.project"];
  const owner = labels?.[`com.docker.compose.${kind}`];
  if (project !== developmentProject || owner !== composeName) {
    throw new Error(
      `Refusing existing ${kind} ${name}: expected Compose labels for ${developmentProject}/${composeName}.`
    );
  }
}

function inspectDockerResource(kind, name) {
  const result = run("docker", [kind, "inspect", name], { env: validatedDockerEnvironment, stdio: "pipe" });
  if (result.status !== 0) {
    if (/no such (volume|object|container)/i.test(result.stderr)) return null;
    throw new Error(`Could not inspect Docker ${kind} ${name}.`);
  }
  let resources;
  try {
    resources = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Docker returned unreadable ${kind} metadata for ${name}.`);
  }
  if (!Array.isArray(resources) || resources.length !== 1) {
    throw new Error(`Docker returned incomplete ${kind} metadata for ${name}.`);
  }
  return resources[0];
}

function assertExistingComposeOwnership() {
  for (const volume of ownedVolumes) {
    const inspected = inspectDockerResource("volume", volume.name);
    if (!inspected) continue;
    validateComposeResourceLabels({
      kind: "volume",
      name: volume.name,
      labels: inspected.Labels,
      composeName: volume.composeName
    });
  }
  for (const container of ownedContainers) {
    const inspected = inspectDockerResource("container", container.name);
    if (!inspected) continue;
    validateComposeResourceLabels({
      kind: "service",
      name: container.name,
      labels: inspected.Config?.Labels,
      composeName: container.service
    });
  }
}

function requireNativeImage(reference, hostArchitecture) {
  const result = run("docker", ["image", "inspect", "--format", "{{.Architecture}}", reference], {
    env: validatedDockerEnvironment,
    stdio: "pipe"
  });
  if (result.status !== 0) {
    throw new Error(
      `The package-selected image is not available locally: ${reference}. This command does not pull it.`
    );
  }
  const imageArchitecture = normalizeArchitecture(result.stdout);
  if (imageArchitecture !== hostArchitecture) {
    throw new Error(
      `The package-selected image is ${imageArchitecture}, but Docker is ${hostArchitecture}. Emulation is unsupported.`
    );
  }
}

function gitOutput(argumentsList) {
  const result = run("git", argumentsList, { stdio: "pipe" });
  if (result.status !== 0) return "unknown";
  return result.stdout.trim();
}

export function currentSourceIdentity() {
  const revision = gitOutput(["rev-parse", "--short=12", "HEAD"]);
  // The revision names when Vite started. HMR observes later working-tree edits,
  // but a later commit must not make this frozen label look current.
  return `startup baseline ${revision} + live UI working tree`;
}

async function ensureLocalStateDirectory() {
  await mkdir(localStateDirectory, { recursive: true, mode: 0o700 });
  await chmod(localStateDirectory, 0o700);
}

async function readPrivateFile(target) {
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`Refusing non-regular private file: ${target}`);
  if ((metadata.mode & 0o777) !== 0o600) await chmod(target, 0o600);
  return readFile(target, "utf8");
}

async function createPrivateFile(target, content) {
  const directory = path.dirname(target);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(temporary, content, { mode: 0o600, flag: "wx" });
  try {
    await link(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function loadOrCreateDevelopmentPassword(directory = localStateDirectory) {
  const target = path.join(directory, "owner-password");
  try {
    return (await readPrivateFile(target)).trim();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const generated = `N8nDev9-${randomBytes(24).toString("base64url")}`;
  try {
    await createPrivateFile(target, `${generated}\n`);
    return generated;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return (await readPrivateFile(target)).trim();
  }
}

function matchingViteCommand(pid) {
  const result = run("ps", ["-ww", "-p", String(pid), "-o", "command="], { stdio: "pipe" });
  return result.status === 0 && result.stdout.includes(viteConfig);
}

async function viteProcess() {
  let rawPid;
  try {
    rawPid = (await readPrivateFile(vitePidFile)).trim();
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (!/^[1-9][0-9]*$/.test(rawPid)) throw new Error(`Invalid Vite PID file: ${vitePidFile}`);
  const pid = Number(rawPid);
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
    await rm(vitePidFile, { force: true });
    await rm(viteIdentityFile, { force: true });
    return null;
  }
  if (!matchingViteCommand(pid)) {
    throw new Error(
      `The Vite PID file refers to another process. Inspect ${vitePidFile} without killing that process.`
    );
  }
  return pid;
}

async function writeViteState(pid, sourceIdentity) {
  await ensureLocalStateDirectory();
  const temporary = `${vitePidFile}.tmp`;
  await writeFile(temporary, `${pid}\n`, { mode: 0o600 });
  await rename(temporary, vitePidFile);
  await chmod(vitePidFile, 0o600);
  const identityTemporary = `${viteIdentityFile}.tmp`;
  await writeFile(identityTemporary, `${sourceIdentity}\n`, { mode: 0o600 });
  await rename(identityTemporary, viteIdentityFile);
  await chmod(viteIdentityFile, 0o600);
}

async function endpointAvailable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForFrontend(pid) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await endpointAvailable(`http://127.0.0.1:${developmentPorts.frontend}/`)) return;
    try {
      process.kill(pid, 0);
    } catch {
      break;
    }
    await delay(250);
  }
  throw new Error(`The HMR UI did not start. Inspect ${viteLogFile}.`);
}

async function startVite(definition) {
  const existingPid = await viteProcess();
  if (existingPid) return existingPid;
  const executable = path.join(repositoryRoot, "node_modules/.bin/vite");
  try {
    await lstat(executable);
  } catch {
    throw new Error("Vite is not installed. Run the repository's locked npm install before starting development.");
  }
  await ensureLocalStateDirectory();
  const log = await open(viteLogFile, "a", 0o600);
  await chmod(viteLogFile, 0o600);
  const sourceIdentity = currentSourceIdentity();
  let child;
  try {
    child = spawn(executable, ["--config", viteConfig], {
      cwd: repositoryRoot,
      detached: true,
      env: {
        ...process.env,
        SCHOLARSERVER_N8N_DEV_SOURCE: sourceIdentity,
        SCHOLARSERVER_N8N_DEV_BACKEND: definition.backendIdentity
      },
      stdio: ["ignore", log.fd, log.fd]
    });
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
  } finally {
    await log.close();
  }
  child.unref();
  await writeViteState(child.pid, sourceIdentity);
  try {
    await waitForFrontend(child.pid);
  } catch (error) {
    if (matchingViteCommand(child.pid)) process.kill(child.pid, "SIGTERM");
    await rm(vitePidFile, { force: true });
    await rm(viteIdentityFile, { force: true });
    throw error;
  }
  return child.pid;
}

async function stopVite() {
  const pid = await viteProcess();
  if (!pid) return false;
  process.kill(pid, "SIGTERM");
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      process.kill(pid, 0);
      await delay(250);
    } catch (error) {
      if (error.code === "ESRCH") {
        await rm(vitePidFile, { force: true });
        await rm(viteIdentityFile, { force: true });
        return true;
      }
      throw error;
    }
  }
  throw new Error(`Vite did not stop after five seconds. Inspect process ${pid}; it was not force-killed.`);
}

function printIdentity(definition) {
  console.log(`HMR UI:          http://127.0.0.1:${developmentPorts.frontend}`);
  console.log(`Integration:     http://127.0.0.1:${developmentPorts.integration}`);
  console.log(`Native editor:   http://127.0.0.1:${developmentPorts.nativeEditor}`);
  console.log(`Current package: ${definition.packageVersion}`);
  console.log(`Expected n8n:    ${definition.n8nImage}`);
  console.log(`Expected app:    ${definition.integrationImage}`);
  if (definition.candidate) console.log(`Backend mode:    ${definition.backendIdentity}`);
}

export function backendContainerIdentity(inspected, expectedImage) {
  const configuredImage = inspected.Config?.Image ?? "unknown";
  return {
    configuredImage,
    imageId: inspected.Image ?? "unknown",
    state: inspected.State?.Status ?? "unknown",
    matchesCurrentPackage: configuredImage === expectedImage
  };
}

function reportBackendContainer(name, expectedImage) {
  const inspected = inspectDockerResource("container", name);
  if (!inspected) {
    console.log(`${name}: not created`);
    return true;
  }
  const identity = backendContainerIdentity(inspected, expectedImage);
  console.log(`${name}: ${identity.state}`);
  console.log(`  configured image: ${identity.configuredImage}`);
  console.log(`  image ID:         ${identity.imageId}`);
  console.log(
    `  selected backend: ${identity.matchesCurrentPackage ? "match" : `MISMATCH; expected ${expectedImage}`}`
  );
  return identity.matchesCurrentPackage;
}

function reportBackendIdentities(definition) {
  const n8nMatches = reportBackendContainer("scholarserver-n8n-dev-n8n-1", definition.n8nImage);
  const integrationMatches = reportBackendContainer("scholarserver-n8n-dev-integration-1", definition.integrationImage);
  return n8nMatches && integrationMatches;
}

async function startCommand(definition) {
  if (definition.candidate) assertCandidateMatches(definition.candidate, await candidateSourceDigest(repositoryRoot));
  const hostArchitecture = requireDocker();
  assertExistingComposeOwnership();
  requireNativeImage(definition.n8nImage, hostArchitecture);
  requireNativeImage(definition.integrationImage, hostArchitecture);
  const result = runCompose(definition, ["up", "--detach", "--wait", "--wait-timeout", "120"]);
  if (result.status !== 0) throw new Error("The pinned n8n development backends did not become healthy.");
  if (!reportBackendIdentities(definition)) {
    throw new Error("A running backend does not match the selected image.");
  }
  // Refresh the injected identity after a checkout or package-selection change.
  await stopVite();
  await startVite(definition);
  printIdentity(definition);
  console.log("The HMR UI and selected native backends are running. Run initialize explicitly for a fresh volume.");
}

async function useCandidateCommand(packageDefinition) {
  const architecture = requireDocker();
  assertExistingComposeOwnership();
  const imageId = process.env.N8N_CANDIDATE_IMAGE;
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId ?? ""))
    throw new Error("Set N8N_CANDIDATE_IMAGE to an exact local image ID.");
  requireNativeImage(imageId, architecture);
  const inspection = run("docker", ["image", "inspect", imageId, "--format", "{{json .Config.Labels}}"], {
    env: validatedDockerEnvironment,
    stdio: "pipe"
  });
  if (inspection.status !== 0) throw new Error("Could not read candidate build labels.");
  const labels = JSON.parse(inspection.stdout);
  const candidate = {
    schemaVersion: 1,
    imageId,
    sourceDigest: labels?.["com.scholarserver.source-digest"],
    sourceRevision: labels?.["org.opencontainers.image.revision"]
  };
  const definition = candidateDefinition(packageDefinition, candidate);
  assertCandidateMatches(candidate, await candidateSourceDigest(repositoryRoot));
  await ensureLocalStateDirectory();
  const temporary = `${candidateFile}.tmp`;
  await writeFile(temporary, JSON.stringify(candidate), { mode: 0o600 });
  await rename(temporary, candidateFile);
  await chmod(candidateFile, 0o600);
  return startCommand(definition);
}

async function selectedDefinition(packageDefinition) {
  try {
    return candidateDefinition(packageDefinition, JSON.parse(await readPrivateFile(candidateFile)));
  } catch (error) {
    if (error.code === "ENOENT") return packageDefinition;
    throw error;
  }
}

async function readIntegrationStatus() {
  const response = await fetch(`http://127.0.0.1:${developmentPorts.integration}/api/status`, {
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`The integration status endpoint returned HTTP ${response.status}.`);
  return response.json();
}

const queueWriteProgram = `
import { atomicJson } from "@scholarserver/controller-runtime/files";
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
await atomicJson(\`/runtime/requests/\${process.argv[1]}.json\`, request);
`;

const queueReadProgram = `
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
const target = \`/runtime/responses/\${process.argv[1]}.json\`;
const attempts = Number(process.argv[2]);
for (let attempt = 0; attempt < attempts; attempt++) {
  try {
    const response = await readFile(target);
    if (response.length > ${maximumSetupResponseBytes}) process.exit(5);
    process.stdout.write(response);
    process.exit(0);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await delay(250);
  }
}
process.exit(4);
`;

async function initializeCommand(definition) {
  if (definition.candidate) assertCandidateMatches(definition.candidate, await candidateSourceDigest(repositoryRoot));
  requireDocker();
  assertExistingComposeOwnership();
  if (!reportBackendIdentities(definition)) {
    throw new Error("Initialization refused because a running backend differs from the selected image.");
  }
  let currentStatus;
  try {
    currentStatus = await readIntegrationStatus();
  } catch {
    throw new Error("The pinned integration backend is unavailable. Run start before initialize.");
  }
  if (currentStatus.connected) {
    console.log("The development backend is already initialized; no setup request was sent.");
    try {
      await readPrivateFile(passwordFile);
      console.log(`The saved development password remains at ${passwordFile}.`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      console.log("This helper has no saved password for the existing owner; it did not replace that owner.");
    }
    return;
  }
  if (!["password-required", "resume"].includes(currentStatus.phase)) {
    throw new Error(`Initialization stopped in phase ${currentStatus.phase}. Preserve the volumes and inspect status.`);
  }

  const password = await loadOrCreateDevelopmentPassword();
  const serviceToken = randomBytes(32).toString("base64url");
  const requestId = randomBytes(16).toString("hex");
  const request = developmentSetupRequest(password, serviceToken);
  const writeResult = runCompose(
    definition,
    ["exec", "-T", "integration", "node", "--input-type=module", "--eval", queueWriteProgram, requestId],
    { input: JSON.stringify(request), stdio: "pipe" }
  );
  if (writeResult.status !== 0) throw new Error("The development setup request could not be queued.");

  const attempts = definition.setupTimeoutSeconds * 4;
  let readResult;
  try {
    readResult = runCompose(
      definition,
      [
        "exec",
        "-T",
        "integration",
        "node",
        "--input-type=module",
        "--eval",
        queueReadProgram,
        requestId,
        String(attempts)
      ],
      { stdio: "pipe", timeout: (definition.setupTimeoutSeconds + 5) * 1000 }
    );
  } catch (error) {
    if (error.code === "ETIMEDOUT") {
      throw new Error("The setup result is unconfirmed. Run status before deciding whether to initialize again.");
    }
    throw error;
  }
  if (readResult.status === 4) {
    throw new Error("The setup result is unconfirmed. Run status before deciding whether to initialize again.");
  }

  const removeResponseProgram =
    'import { rm } from "node:fs/promises"; await rm(`/runtime/responses/${process.argv[1]}.json`, { force: true });';
  const removeResult = runCompose(
    definition,
    ["exec", "-T", "integration", "node", "--input-type=module", "--eval", removeResponseProgram, requestId],
    { stdio: "pipe" }
  );
  if (removeResult.status !== 0) throw new Error("Setup completed, but its response file could not be removed.");
  if (readResult.status !== 0) throw new Error("The bounded setup response could not be read. Check status.");
  const response = validateSetupResponse(readResult.stdout, [password, serviceToken]);
  if (!response.ok) throw new Error(response.error ?? "Development initialization was refused. Check status.");
  const readyStatus = await readIntegrationStatus();
  if (!readyStatus.connected || readyStatus.phase !== "ready") {
    throw new Error("Setup returned successfully, but the saved connection is not ready. Check status.");
  }
  console.log(`Development initialization completed. The owner password is stored mode 0600 at ${passwordFile}.`);
  console.log("No Manager service or research application grants were created.");
}

async function statusCommand(definition) {
  printIdentity(definition);
  const vitePid = await viteProcess();
  console.log(`HMR process:     ${vitePid ? `running as PID ${vitePid}` : "stopped"}`);
  if (vitePid) {
    const startupIdentity = await readPrivateFile(viteIdentityFile).catch(() => "identity unavailable");
    console.log(`HMR identity:    ${startupIdentity.trim()}`);
  }
  const architecture = dockerArchitecture({ required: false });
  if (!architecture) {
    console.log("Docker backend: unavailable; Docker was not started by this command.");
    return;
  }
  console.log(`Docker native:   ${architecture}`);
  assertExistingComposeOwnership();
  const composeResult = runCompose(definition, ["ps"]);
  if (composeResult.status !== 0) throw new Error("Could not read the n8n development backend status.");
  if (!reportBackendIdentities(definition)) {
    throw new Error("Running backend image selection differs from the selected images.");
  }
  if (await endpointAvailable(`http://127.0.0.1:${developmentPorts.integration}/health`)) {
    const integrationStatus = await readIntegrationStatus().catch(() => null);
    console.log(`Setup state:   ${integrationStatus?.phase ?? "unavailable"}`);
  }
  if (definition.candidate) assertCandidateMatches(definition.candidate, await candidateSourceDigest(repositoryRoot));
}

async function stopCommand(definition) {
  const architecture = dockerArchitecture({ required: false });
  const stoppedVite = await stopVite();
  if (architecture) {
    assertExistingComposeOwnership();
    const result = runCompose(definition, ["stop"]);
    if (result.status !== 0) throw new Error("The n8n development backends did not stop cleanly.");
  } else {
    console.log("Docker is unavailable, so only the HMR process could be checked.");
  }
  console.log(`${stoppedVite ? "Stopped" : "No running"} HMR UI. Named development volumes were preserved.`);
}

function usage() {
  console.log("Usage: node dev/n8n/command.mjs <start|initialize|status|stop|use-candidate|use-package>");
}

export async function main(command = process.argv[2]) {
  const packageDefinition = await loadDevelopmentDefinition();
  if (command === "use-candidate") return useCandidateCommand(packageDefinition);
  if (command === "use-package") {
    await rm(candidateFile, { force: true });
    return startCommand(packageDefinition);
  }
  const definition = await selectedDefinition(packageDefinition);
  switch (command) {
    case "start":
      return startCommand(definition);
    case "initialize":
      return initializeCommand(definition);
    case "status":
      return statusCommand(definition);
    case "stop":
      return stopCommand(definition);
    default:
      usage();
      throw new Error("Choose start, initialize, status or stop.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`n8n development command failed: ${error.message}`);
    process.exitCode = 1;
  });
}
