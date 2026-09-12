import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { handleHttp } from "./controller.mjs";

const html =
  '<!doctype html><html><head><script type="module" src="./assets/app.js"></script><link rel="stylesheet" href="./assets/app.css"></head><body><div id="root"></div></body></html>';
const javascript = 'document.getElementById("root").textContent = "Synthetic Zotero interface";\n';
const stylesheet = "body { color: rgb(20, 30, 40); }\n";

async function fixture(context) {
  const directory = await mkdtemp(path.join(tmpdir(), "zotero-static-http-"));
  const staticRoot = path.join(directory, "ui");
  await mkdir(path.join(staticRoot, "assets", "directory"), { recursive: true });
  await writeFile(path.join(staticRoot, "index.html"), html);
  await writeFile(path.join(staticRoot, "assets", "app.js"), javascript);
  await writeFile(path.join(staticRoot, "assets", "app.css"), stylesheet);
  const server = createServer((request, response) => {
    // The production handler is used without starting the controller's worker,
    // contacting Zotero, or reading/writing its fixed /runtime paths.
    void handleHttp(request, response, { staticRoot });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { staticRoot, base: `http://127.0.0.1:${server.address().port}` };
}

test("HTTP serves actual JS and CSS bytes and MIME types at root and nested asset URLs", async (context) => {
  const { base } = await fixture(context);
  for (const prefix of ["", "/configuration", "/automations", "/apps/fixture/configuration"]) {
    for (const [file, type, content] of [
      ["app.js", "text/javascript; charset=utf-8", javascript],
      ["app.css", "text/css; charset=utf-8", stylesheet]
    ]) {
      const response = await fetch(`${base}${prefix}/assets/${file}?version=fixture`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), type);
      assert.equal(response.headers.get("content-length"), String(Buffer.byteLength(content)));
      assert.equal(await response.text(), content);
      const head = await fetch(`${base}${prefix}/assets/${file}`, { method: "HEAD" });
      assert.equal(head.status, 200);
      assert.equal(head.headers.get("content-type"), type);
      assert.equal(head.headers.get("content-length"), String(Buffer.byteLength(content)));
      assert.equal(await head.text(), "");
    }
  }
});

test("HTTP deep navigation returns the SPA document and its relative assets resolve", async (context) => {
  const { base } = await fixture(context);
  for (const route of [
    "/",
    "/index.html",
    "/configuration",
    "/attachments/",
    "/automations/tasks",
    "/apps/fixture/configuration"
  ]) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(await response.text(), html);
    const script = await fetch(new URL("./assets/app.js", `${base}${route}`));
    assert.equal(script.status, 200);
    assert.equal(await script.text(), javascript);
  }
});

test("HTTP missing assets and asset directories return 404, never the SPA document", async (context) => {
  const { base } = await fixture(context);
  for (const route of [
    "/assets/missing.js",
    "/assets/missing.css",
    "/assets/missing",
    "/assets/directory",
    "/assets/directory/",
    "/assets",
    "/assets/",
    "/automations/assets/missing.js",
    "/apps/fixture/configuration/assets/missing.css",
    "/missing.js",
    "/missing.css",
    "/favicon.ico",
    "/configuration/missing.json"
  ]) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 404, route);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.deepEqual(await response.json(), { error: "Not found" });
  }
});

test("HTTP missing entry document reports interface unavailability rather than success", async (context) => {
  const { base, staticRoot } = await fixture(context);
  await rm(path.join(staticRoot, "index.html"));
  const response = await fetch(`${base}/configuration`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Zotero interface is unavailable" });
});
