#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
async function docker(...args) {
  return (await execute("docker", args, { maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
}
const image = process.env.DOCLING_CONTROLLER_IMAGE;
assert.ok(image, "Provide DOCLING_CONTROLLER_IMAGE");
const architecture = { aarch64: "arm64", arm64: "arm64", x86_64: "amd64", amd64: "amd64" }[
  await docker("info", "--format", "{{.Architecture}}")
];
assert.ok(architecture);
assert.equal(await docker("image", "inspect", image, "--format", "{{.Os}}/{{.Architecture}}"), `linux/${architecture}`);
const prefix = `scholar-docling-proof-${randomUUID().slice(0, 8)}`;
const containers = [];
const volumes = [];
let networkCreated = false;
let browser;

async function waitFor(description, check, seconds = 90) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      if (await check()) {
        console.log(`PASS: ${description}`);
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out: ${description}`);
}

function syntheticPdf() {
  const text = "BT /F1 16 Tf 50 740 Td (ScholarServer disposable conversion proof) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`
  ];
  let value = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(value));
    value += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(value);
  value += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(value).toString("base64");
}

try {
  await docker("network", "create", prefix);
  networkCreated = true;
  for (const role of ["runtime", "documents"]) {
    const name = `${prefix}-${role}`;
    await docker("volume", "create", name);
    volumes.push(name);
    await docker(
      "run",
      "--rm",
      "--network",
      "none",
      "--user",
      "0",
      "--entrypoint",
      "sh",
      "-v",
      `${name}:/proof`,
      image,
      "-c",
      "chown 10001:10001 /proof && chmod 700 /proof"
    );
  }
  const controller = `${prefix}-controller`;
  containers.push(controller);
  await docker(
    "run",
    "-d",
    "--name",
    controller,
    "--network",
    prefix,
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--memory",
    "384m",
    "--cpus",
    "0.25",
    "--pids-limit",
    "64",
    "-p",
    "127.0.0.1::8080",
    "-v",
    `${prefix}-runtime:/runtime`,
    "-v",
    `${prefix}-documents:/documents`,
    image
  );
  let origin = `http://${await docker("port", controller, "8080/tcp")}`;
  const get = async (route) => (await fetch(`${origin}${route}`)).json();
  await waitFor("native read-only Docling controller starts", async () => (await fetch(`${origin}/health`)).ok);
  assert.equal((await get("/api/status")).engine, "unavailable");
  assert.deepEqual(await get("/api/settings"), { defaultOcr: false });
  const require = createRequire(path.join(process.env.SCHOLARSERVER_BROWSER_MODULES, "package.json"));
  const { chromium } = require("playwright");
  const { expect } = require("playwright/test");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/configuration`);
  await page.getByRole("checkbox", { name: /Use OCR by default/ }).check();
  await page.getByRole("button", { name: "Save defaults", exact: true }).click();
  const toast = page.getByText("Docling defaults were saved.", { exact: true });
  await expect(toast).toBeVisible();
  const output = path.resolve(process.env.SCHOLARSERVER_EVIDENCE ?? ".dev/docling-packaging");
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, `docling-toast-${architecture}.png`), fullPage: true });
  await expect(toast).not.toBeVisible({ timeout: 12_000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, `docling-mobile-${architecture}.png`), fullPage: true });
  assert.deepEqual(errors, []);
  console.log("PASS: built UI saves defaults, toast expires and mobile screen renders");
  assert.deepEqual(await get("/api/settings"), { defaultOcr: true });
  assert.equal(
    (
      await fetch(`${origin}/api/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ defaultOcr: "invalid" })
      })
    ).status,
    400
  );
  await docker("restart", controller);
  // Docker may allocate a different ephemeral host port when starting again.
  origin = `http://${await docker("port", controller, "8080/tcp")}`;
  await waitFor(
    "saved defaults survive controller restart",
    async () => (await get("/api/settings")).defaultOcr === true
  );
  console.log(
    "PASS: built UI saves defaults, toast expires, invalid input is rejected and restart retains configuration"
  );

  if (process.env.DOCLING_ENGINE_IMAGE) {
    const engineImage = process.env.DOCLING_ENGINE_IMAGE;
    assert.equal(
      await docker("image", "inspect", engineImage, "--format", "{{.Os}}/{{.Architecture}}"),
      `linux/${architecture}`
    );
    const engine = `${prefix}-engine`;
    containers.push(engine);
    await docker(
      "run",
      "-d",
      "--name",
      engine,
      "--network",
      prefix,
      "--network-alias",
      "docling",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--user",
      "1001:0",
      "--cpus",
      "1",
      "--memory",
      "4g",
      "--pids-limit",
      "256",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,nodev,size=512m,mode=1777",
      engineImage
    );
    await waitFor(
      "real pinned conversion engine is available",
      async () => (await get("/api/status")).engine === "available",
      240
    );
    await docker(
      "exec",
      controller,
      "python3",
      "-c",
      "import base64,sys; open('/documents/proof.pdf','wb').write(base64.b64decode(sys.argv[1]))",
      syntheticPdf()
    );
    const response = await fetch(`${origin}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourcePath: "proof.pdf", ocr: false })
    });
    assert.equal(response.status, 200);
    const job = await response.json();
    let completed;
    await waitFor(
      "real synthetic PDF converts to Markdown",
      async () => {
        const result = (await get("/api/status")).jobs.find((entry) => entry.id === job.id);
        if (!["failed", "succeeded"].includes(result?.state)) return false;
        completed = result;
        return true;
      },
      420
    );
    assert.equal(completed.state, "succeeded", completed.error ?? "Conversion must succeed");
    const markdown = await docker(
      "exec",
      controller,
      "python3",
      "-c",
      "import pathlib,sys; print((pathlib.Path('/documents')/sys.argv[1]).read_text())",
      completed.outputPath
    );
    assert.match(markdown, /ScholarServer disposable conversion proof/);
    console.log("PASS: output contains the synthetic source text; no real library used");
  }
} finally {
  await browser?.close();
  for (const name of containers.reverse()) await docker("rm", "-f", name).catch(() => undefined);
  for (const name of volumes) await docker("volume", "rm", name);
  if (networkCreated) await docker("network", "rm", prefix);
  assert.equal(await docker("ps", "-aq", "--filter", `name=${prefix}`), "");
  assert.equal(await docker("volume", "ls", "-q", "--filter", `name=${prefix}`), "");
  console.log("PASS: disposable Docling resources removed");
}
