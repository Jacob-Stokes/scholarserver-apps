// Operator-only native recovery acceptance. Never mounts a host library or uses a live account.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parse } from "yaml";

const exec = promisify(execFile);
const id = `n8n-proof-${randomUUID().slice(0, 8)}`;
const prefix = `scholarserver_${id}`;
const volume = `${prefix}-data`;
const edge = `${prefix}_edge`;
const manager = `${prefix}-manager-1`;
const executor = `${prefix}-executor`;
const helperImage = process.env.N8N_PROOF_EXECUTOR_IMAGE;
const managerImage = process.env.N8N_PROOF_MANAGER_IMAGE;
const coreCommit = process.env.N8N_PROOF_CORE_COMMIT;
for (const image of [helperImage, managerImage])
  assert.match(image ?? "", /^sha256:[a-f0-9]{64}$/, "Supply exact local image IDs");
assert.match(coreCommit ?? "", /^[a-f0-9]{40}$/, "Record the core source used to build both images");
assert.ok(process.env.N8N_PROOF_PACKAGE_DIR, "Supply the package directory from the checked apps source");
const packageDirectory = path.resolve(process.env.N8N_PROOF_PACKAGE_DIR);
const manifestBytes = await readFile(path.join(packageDirectory, "scholarserver-app.yaml"));
const manifest = parse(manifestBytes.toString("utf8"));
assert.equal(manifest.id, "org.scholarserver.n8n");
assert.equal(typeof manifest.packageVersion, "string");
const manifestHash = createHash("sha256").update(manifestBytes).digest("hex");
const containers = [];
let volumeCreated = false;
let namespaceOwned = false;
let project;
let root;
let stage = "preflight";
async function docker(...args) {
  try {
    return (await exec("docker", args, { maxBuffer: 16 * 1024 * 1024, timeout: 600000 })).stdout.trim();
  } catch (error) {
    throw new Error(`${stage}: Docker ${args[0]} failed (output withheld)`, { cause: { code: error.code } });
  }
}
async function start(name, args, image, ...command) {
  containers.push(name);
  return docker("run", "-d", "--name", name, ...args, image, ...command);
}
async function probe(name, code) {
  return docker("exec", name, "node", "--input-type=module", "-e", code);
}
async function waitFor(label, check) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      if (await check()) {
        console.log(`PASS: ${label}`);
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw Error(`Timed out: ${label}`);
}
async function api(route, body) {
  const code = `const r=await fetch('http://127.0.0.1:8080/api/v1/${route}',{
    method:${JSON.stringify(body === undefined ? "GET" : "POST")},headers:{'Content-Type':'application/json'},
    body:${body === undefined ? "undefined" : `JSON.stringify(${JSON.stringify(body)})`}});
    const result=await r.json();
    if(!r.ok) throw Error('Manager HTTP '+r.status+' '+JSON.stringify(result));
    console.log(JSON.stringify(result));`;
  return JSON.parse(await probe(manager, code));
}
async function appContainer(service) {
  const found = await docker(
    "ps",
    "-q",
    "--filter",
    `label=com.docker.compose.project=${project}`,
    "--filter",
    `label=com.docker.compose.service=${service}`
  );
  assert.match(found, /^[a-f0-9]{12,64}$/);
  return found;
}
try {
  const hostArchitecture = await docker("info", "--format", "{{.Architecture}}");
  const architecture = { aarch64: "arm64", arm64: "arm64", x86_64: "amd64", amd64: "amd64" }[hostArchitecture];
  assert.ok(architecture, "A supported native Docker host is required");
  for (const image of [helperImage, managerImage])
    assert.equal(
      await docker("image", "inspect", image, "--format", "{{.Os}}/{{.Architecture}}"),
      "linux/" + architecture
    );
  assert.equal(await docker("ps", "-aq", "--filter", "name=" + prefix), "");
  assert.equal(await docker("volume", "ls", "-q", "--filter", "name=" + volume), "");
  assert.ok(
    !(await docker("network", "ls", "--format", "{{.Name}}")).split("\n").some((name) => name.startsWith(prefix))
  );
  namespaceOwned = true;
  console.log(
    JSON.stringify({
      scope: id,
      coreCommit,
      helperImage,
      managerImage,
      packageVersion: manifest.packageVersion,
      manifestHash,
      architecture
    })
  );
  await docker("volume", "create", volume);
  volumeCreated = true;
  root = await docker("volume", "inspect", volume, "--format", "{{.Mountpoint}}");
  assert.equal(root, `/var/lib/docker/volumes/${volume}/_data`);
  stage = "initialize isolated state";
  await docker(
    "run",
    "--rm",
    "--network",
    "none",
    "--entrypoint",
    "node",
    "-v",
    `${volume}:${root}`,
    helperImage,
    "--input-type=module",
    "-e",
    `
    import {mkdir,chown,chmod} from 'node:fs/promises';
    for(const dir of ['manager','run','catalog','state']) {await mkdir('${root}/'+dir,{recursive:true});await chown('${root}/'+dir,1000,1000);}
    await chmod('${root}',0o755);
  `
  );
  await docker("network", "create", "--internal", edge);
  await start(
    executor,
    [
      "--user",
      "0:1000",
      "--network",
      edge,
      "-v",
      "/var/run/docker.sock:/var/run/docker.sock",
      "-v",
      `${volume}:${root}`
    ],
    helperImage,
    "--installation",
    id,
    "--state-root",
    `${root}/state`,
    "--catalog-root",
    `${root}/catalog`,
    "--socket",
    `${root}/run/executor.sock`,
    "--readiness-timeout",
    "3m"
  );
  await docker("cp", packageDirectory, `${executor}:${root}/catalog/n8n`);
  await start(
    manager,
    [
      "--network",
      edge,
      "--network-alias",
      "scholarserver-manager",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "-v",
      `${root}/manager:/manager`,
      "-v",
      `${root}/run:/run/scholarserver:ro`,
      "-v",
      `${root}/catalog:/catalog:ro`,
      "-e",
      `SCHOLARSERVER_INSTALLATION_ID=${id}`,
      "-e",
      "SCHOLARSERVER_MANAGER_HOST=0.0.0.0",
      "-e",
      "SCHOLARSERVER_MANAGER_DATABASE=/manager/manager.sqlite",
      "-e",
      "SCHOLARSERVER_MANAGER_CLAIM_TOKEN=/manager/claim-token",
      "-e",
      "SCHOLARSERVER_MANAGER_CATALOG=/catalog",
      "-e",
      "SCHOLARSERVER_APPLICATION_INDEX_URL=",
      "-e",
      "SCHOLARSERVER_REGISTRAR_CATALOG_URL="
    ],
    managerImage
  );
  await waitFor("real unprivileged Manager starts", async () => (await api("health")).status === "ok");
  stage = "claim Manager";
  await probe(
    manager,
    `import {readFile} from 'node:fs/promises';
    const token=(await readFile('/manager/claim-token','utf8')).trim();
    const r=await fetch('http://127.0.0.1:8080/api/v1/setup/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,administratorName:'Disposable test',installationName:'Native n8n recovery test',workspaceName:'Test',accessPreset:'private'})});
    if(!r.ok)throw Error('Claim HTTP '+r.status);
  `
  );
  const overview = await api("overview");
  const workspaceId = overview.workspace.id;
  const desired = {
    workspaceId,
    instanceId: "n8n",
    packageId: "org.scholarserver.n8n",
    packageVersion: manifest.packageVersion,
    state: "enabled"
  };
  stage = "install current n8n package";
  const plan = await api("instances/plan", desired);
  const plannedProject = plan.plan?.projectName ?? plan.projectName;
  assert.equal(typeof plannedProject, "string");
  assert.ok(plannedProject.startsWith(prefix));
  project = plannedProject;
  await api("instances/apply", desired);
  const integration = await appContainer("integration");
  stage = "normal Manager service credential setup";
  await probe(
    manager,
    `import {randomBytes} from 'node:crypto';
    const r=await fetch('http://127.0.0.1:8080/api/v1/instances/${workspaceId}/n8n/actions/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:randomBytes(24).toString('hex')+'Aa1!',email:'disposable@example.invalid'})});
    if(!r.ok)throw Error('Setup HTTP '+r.status);
  `
  );
  console.log("PASS: full pinned n8n package installed and normal Manager setup completed");
  await probe(
    integration,
    `
    import assert from 'node:assert/strict';
    import {ManagerConnection} from '/app/integration/manager-connection.mjs';
    const connection=await new ManagerConnection('/runtime').read();
    const headers={Authorization:'Bearer '+connection.token,'Content-Type':'application/json'};
    assert.equal((await fetch(connection.url+'/actions',{headers})).status,200);
    assert.equal((await fetch(connection.url+'/instances/${workspaceId}/n8n/actions/setup',{method:'POST',headers,body:'{}'})).status,403);
    assert.equal((await fetch(connection.url+'/actions')).status,401);
  `
  );
  console.log("PASS: real Manager-issued service identity works; undeclared action and missing credential rejected");
  const native = await appContainer("n8n");
  const networks = JSON.parse(await docker("inspect", native, "--format", "{{json .NetworkSettings.Networks}}"));
  const network =
    Object.keys(networks).find((name) => name.includes("instance")) ??
    Object.keys(networks).find((name) => !name.includes("egress"));
  assert.ok(network);
  await start(
    `${prefix}-credential-target`,
    [
      "--network",
      network,
      "--network-alias",
      "credential-proof",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--entrypoint",
      "node"
    ],
    helperImage,
    "--input-type=module",
    "-e",
    `
    import http from 'node:http';http.createServer((req,res)=>{const ok=req.headers['x-recovery-proof']==='synthetic-only';res.writeHead(ok?200:403,{'Content-Type':'application/json'});res.end(JSON.stringify({authenticated:ok}));}).listen(8080);
  `
  );
  stage = "seed credential-backed workflow";
  const receipt = JSON.parse(
    await probe(
      integration,
      `
    import {N8nSetup} from '/app/integration/setup.mjs';
    const client=await new N8nSetup({directory:'/runtime',baseUrl:'http://n8n:5678'}).client();
    const credential=await client.createCredential({name:'Disposable recovery credential',type:'httpHeaderAuth',data:{name:'X-Recovery-Proof',value:'synthetic-only'}});
    const workflow=await client.createWorkflow({name:'Disposable credential recovery proof',settings:{},nodes:[
      {id:'manual',name:'Manual',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,0],parameters:{}},
      {id:'request',name:'Authenticated request',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[220,0],parameters:{url:'http://credential-proof:8080',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',options:{}},credentials:{httpHeaderAuth:{id:credential.id,name:credential.name}}}
    ],connections:{Manual:{main:[[{node:'Authenticated request',type:'main',index:0}]]}}});
    console.log(JSON.stringify({workflowId:workflow.id,credentialId:credential.id}));
  `
    )
  );
  async function executeWorkflow() {
    const output = await docker(
      "exec",
      "-e",
      "N8N_RUNNERS_BROKER_PORT=5680",
      await appContainer("n8n"),
      "n8n",
      "execute",
      `--id=${receipt.workflowId}`,
      "--rawOutput"
    );
    assert.match(output, /"authenticated"\s*:\s*true/);
  }
  await executeWorkflow();
  console.log("PASS: actual n8n execution uses encrypted HTTP credential");
  stage = "Manager encrypted application backup";
  await api("backups/applications/n8n", {});
  const backups = await api("backups");
  const saved = backups.backups.find(
    (item) => item.scope === "application" && item.packageId === "org.scholarserver.n8n"
  );
  assert.ok(saved?.id);
  console.log("PASS: Manager application backup recorded");
  stage = "change disposable workflow through native API";
  await probe(
    await appContainer("integration"),
    `
    import {N8nSetup} from '/app/integration/setup.mjs';
    const client=await new N8nSetup({directory:'/runtime',baseUrl:'http://n8n:5678'}).client();
    const workflow=await client.getWorkflow('${receipt.workflowId}');
    const node=workflow.nodes.find(node=>node.name==='Authenticated request');
    node.parameters.authentication='none';delete node.credentials;
    await client.updateWorkflow(workflow.id,{name:'Changed after backup',nodes:workflow.nodes,connections:workflow.connections,settings:{}});
  `
  );
  await assert.rejects(executeWorkflow);
  console.log("PASS: post-backup workflow change fails authenticated execution");
  stage = "Manager restore";
  await api(`backups/${saved.id}/restore`, {});
  await executeWorkflow();
  console.log("PASS: Manager restore recovered workflow and decrypted credential for actual authenticated execution");
  const status = await api("backups/operations/latest");
  assert.equal(status.state, "succeeded");
  stage = "normal application removal";
  await api("instances/apply", { ...desired, state: "removed" });
  console.log("PASS: Manager removal completed; no online account or signed-install acceptance claimed");
} finally {
  stage = "cleanup";
  if (project) {
    const owned = (await docker("ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`))
      .split("\n")
      .filter(Boolean);
    for (const container of owned) await docker("rm", "-fv", container);
  }
  for (const name of containers.reverse()) {
    const present = await docker("ps", "-aq", "--filter", `name=^/${name}$`);
    if (present) await docker("rm", "-fv", name);
  }
  const networks = namespaceOwned
    ? (await docker("network", "ls", "--format", "{{.Name}}")).split("\n").filter((name) => name.startsWith(prefix))
    : [];
  for (const name of networks) await docker("network", "rm", name);
  if (volumeCreated) await docker("volume", "rm", volume);
  assert.equal(await docker("ps", "-aq", "--filter", `name=${prefix}`), "");
  assert.equal(await docker("volume", "ls", "-q", "--filter", `name=${volume}`), "");
  assert.ok(
    !(await docker("network", "ls", "--format", "{{.Name}}")).split("\n").some((name) => name.startsWith(prefix))
  );
  console.log("PASS: disposable containers, data volume and networks deleted and deletion verified");
}
