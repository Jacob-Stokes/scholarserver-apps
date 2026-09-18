// Runs only inside a disposable integration container, never against a user's reader.
import assert from "node:assert/strict";
import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { FreshRssClient } from "./client.mjs";
import { readJson } from "./setup.mjs";

// These keys belong only to this disposable fixture. They are never used by a
// running ScholarServer installation or included in a published image.
let privateKey = await readFile("/runtime/test-signing-key.pem", "utf8").catch(() => null);
if (!privateKey) {
  const keys = generateKeyPairSync("ed25519");
  privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" });
  await writeFile("/runtime/test-signing-key.pem", privateKey, { mode: 0o600 });
  await writeFile("/runtime/test-public-key.pem", keys.publicKey.export({ type: "spki", format: "pem" }), {
    mode: 0o600
  });
}
const binding = {
  version: 1,
  audience: "personal/freshrss-proof",
  subject: "fixture-owner",
  username: "fixture-owner",
  publicKey: await readFile("/runtime/test-public-key.pem", "utf8")
};
function signedRequest(path, subject = binding.subject) {
  const iat = Math.floor(Date.now() / 1000);
  const values = [
    { alg: "EdDSA", typ: "JWT" },
    {
      iss: "scholarserver-manager",
      aud: binding.audience,
      sub: subject,
      endpoint: "reader",
      method: "GET",
      path,
      iat,
      exp: iat + 30
    }
  ];
  const message = values.map((value) => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
  return `${message}.${sign(null, Buffer.from(message), createPrivateKey(privateKey)).toString("base64url")}`;
}
async function readerFetch(url, options = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const enabled = await readJson("/runtime/browser-identity.json", null);
    const path = new URL(url).pathname + new URL(url).search;
    const headers = new Headers(options.headers);
    if (enabled) headers.set("x-scholarserver-browser-identity", signedRequest(path));
    const response = await fetch(url, { ...options, headers, redirect: "manual" });
    if (options.redirect === "manual" || ![301, 302, 303, 307, 308].includes(response.status)) return response;
    const next = new URL(response.headers.get("location"), url);
    assert.equal(next.origin, "http://127.0.0.1:8082", "fixture never follows an external redirect");
    next.pathname = next.pathname.replace(/^\/apps\/freshrss-proof\/endpoints\/reader/, "");
    url = next.href;
  }
  throw new Error("Too many reader redirects");
}

const origin = "http://127.0.0.1:8080";
const feed = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/rss+xml" });
  response.end(
    '<?xml version="1.0"?><rss version="2.0"><channel><title>Disposable research feed</title><link>https://example.org/</link><description>Synthetic test data</description><item><guid>scholarserver-freshrss-proof-1</guid><title>Research fixture article</title><link>https://example.org/paper</link><description>A synthetic article for integration testing.</description></item></channel></rss>'
  );
}).listen(8099, "0.0.0.0");
const mcp = new Client({ name: "freshrss-disposable-proof", version: "1" });
try {
  const page = await fetch(`${origin}/configuration`);
  assert.equal(page.status, 200, "setup page loads");
  const html = await page.text();
  const asset = html.match(/src="\.\/([^\"]+\.js)"/)?.[1];
  assert.ok(asset, "built UI references a relative script");
  assert.equal((await fetch(`${origin}/${asset}`)).status, 200, "setup script loads");
  if (process.env.FRESHRSS_TEST_SHARED_SETUP === "1") {
    await writeFile(
      "/runtime/requests/fresh-sign-in-proof.json",
      JSON.stringify({ action: "link-sign-in", input: { scholarserverBrowserIdentity: binding } }),
      { mode: 0o600 }
    );
  } else {
    const response = await fetch(`${origin}/api/connect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "researcher",
        password: "Disposable-Reader-Only-2026"
      })
    });
    assert.equal(response.status, 202);
  }
  let ready = false;
  for (let attempt = 0; attempt < 45; attempt++) {
    const status = await (await fetch(`${origin}/api/status`)).json();
    if (status.ready) {
      ready = true;
      break;
    }
    if (status.error && status.phase !== "starting") throw new Error(status.error);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.ok(ready, "setup completes");
  const readerPage = await readerFetch("http://127.0.0.1:8082/i/", {
    headers: { "accept-encoding": "gzip, deflate, br" }
  });
  assert.equal(readerPage.headers.get("content-encoding"), null, "reader proxy supplies an uncompressed body");
  assert.equal(readerPage.headers.get("cache-control"), "no-store", "account pages are never cached");
  const stylesheetUrl = "http://127.0.0.1:8082/themes/Origine/origine.css";
  const stylesheet = await readerFetch(stylesheetUrl, {
    headers: { cookie: "FreshRSS=synthetic-session; manager-session=must-not-forward" }
  });
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get("content-type"), /^text\/css/);
  assert.equal(stylesheet.headers.get("cache-control"), "private, max-age=300, must-revalidate");
  assert.equal(stylesheet.headers.get("set-cookie"), null);
  await stylesheet.arrayBuffer();
  const modified = stylesheet.headers.get("last-modified");
  assert.ok(modified, "native static assets provide a revalidation timestamp");
  const unchanged = await readerFetch(stylesheetUrl, { headers: { "if-modified-since": modified } });
  assert.equal(unchanged.status, 304, "static revalidation survives the integration proxy");
  assert.equal(unchanged.headers.get("cache-control"), "private, max-age=300, must-revalidate");
  const readerHtml = await readerPage.text();
  assert.match(readerHtml, /FreshRSS/, "reader login page loads through the proxy");
  assert.match(readerHtml, /themes\/ScholarServer\/theme\.css/, "upstream extension applies appearance by default");
  assert.match(readerHtml, /themes\/ScholarServer\/theme\.js/, "reader loads its optional branding adapter");
  const appearance = await fetch(`${origin}/api/appearance`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ style: "original" })
  });
  assert.equal(appearance.status, 200);
  const originalHtml = await (await readerFetch("http://127.0.0.1:8082/i/")).text();
  assert.doesNotMatch(
    originalHtml,
    /themes\/ScholarServer|ss-reader-brand/,
    "original mode restores native markup with no injected styles"
  );
  await fetch(`${origin}/api/appearance`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ style: "scholarserver" })
  });
  if (process.env.SCHOLARSERVER_INSTANCE_ID) {
    assert.match(
      readerHtml,
      /\/apps\/freshrss-proof\/endpoints\/reader\/i\//,
      "login links retain the managed subpath"
    );
    assert.doesNotMatch(readerHtml, /href="\/i\//, "login links never escape to the dashboard root");
  }
  const api = new FreshRssClient("http://freshrss:8080", "/runtime/account.json");
  await api.request("subscription/quickadd", { quickadd: "http://integration:8099/feed.xml", output: "json" }, "POST");
  assert.equal((await api.request("subscription/list", { output: "json" })).subscriptions.length, 1);
  const token = await readFile("/runtime/service-token", "utf8");
  await mcp.connect(
    new StreamableHTTPClientTransport(new URL("http://127.0.0.1:7015/mcp"), {
      requestInit: { headers: { authorization: `Bearer ${token}` } }
    })
  );
  const tools = await mcp.listTools();
  assert.equal(tools.tools.length, 6);
  for (const tool of tools.tools) assert.match(tool.name, /^freshrss_[a-z_]+$/);
  async function call(name, args = {}) {
    const result = await mcp.callTool({
      name: `freshrss_${name}`,
      arguments: args
    });
    assert.ok(!result.isError, `${name} succeeds`);
    return JSON.parse(result.content[0].text);
  }
  assert.equal((await call("list_feeds")).feeds.length, 1);
  await call("list_categories");
  await call("unread_counts");
  const articles = await call("list_articles", { limit: 5 });
  assert.equal(articles.articles[0].title, "Research fixture article");
  const id = articles.articles[0].id;
  assert.match((await call("read_article", { id })).articles[0].text, /synthetic article/);
  await call("set_article_state", { id, read: true, starred: true });
  const changed = (await call("read_article", { id })).articles[0];
  assert.ok(changed.categories.includes("user/-/state/com.google/read"));
  assert.ok(changed.categories.includes("user/-/state/com.google/starred"));
  const unauthorized = await fetch("http://127.0.0.1:7015/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(unauthorized.status, 401);
  const account = JSON.parse(await readFile("/runtime/account.json", "utf8"));
  assert.equal(account.password, undefined, "web password removed after setup");
  await writeFile(
    "/runtime/requests/sign-in-proof.json",
    JSON.stringify({ action: "link-sign-in", input: { scholarserverBrowserIdentity: binding } }),
    { mode: 0o600 }
  );
  let linked = false;
  for (let attempt = 0; attempt < 45; attempt++) {
    const result = await readJson("/runtime/responses/sign-in-proof.json", null);
    if (result?.ok === false) throw new Error("Reader rejected its trusted sign-in setup");
    const status = await (await fetch(`${origin}/api/status`)).json();
    if (result?.ok && status.ready && status.signIn === "scholarserver") {
      linked = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.ok(linked, "the PHP reader applies the queued identity binding");
  assert.deepEqual(
    JSON.parse(await readFile("/runtime/account.json", "utf8")),
    account,
    "migration preserves account and API credentials"
  );
  for (const headers of [
    {},
    { "remote-user": "researcher" },
    { "x-webauth-user": "researcher" },
    { "x-scholarserver-browser-identity": signedRequest("/i/", "another-owner") }
  ]) {
    assert.equal(
      (await fetch("http://127.0.0.1:8082/i/", { headers })).status,
      401,
      "unsigned or wrong-owner access is denied"
    );
  }
  const signedPage = await readerFetch("http://127.0.0.1:8082/i/?a=normal&get=a");
  const signedHtml = await signedPage.text();
  assert.equal(signedPage.status, 200);
  assert.match(
    signedHtml,
    /Research fixture article/,
    "linked identity opens the existing feed without a FreshRSS login"
  );
  assert.doesNotMatch(signedHtml, /name="password"/, "no separate password form");
  assert.equal((await call("list_feeds")).feeds.length, 1, "MCP credentials still work after browser migration");
  const logout = await readerFetch("http://127.0.0.1:8082/i/?c=auth&a=logout", { redirect: "manual" });
  assert.equal(logout.status, 303);
  assert.equal(logout.headers.get("location"), "/if/flow/default-invalidation-flow/?next=/");
  console.log(
    "PASS: fresh setup, synthetic feed, all six MCP tools, sign-in migration, signed login, forged identity rejection and shared logout"
  );
} finally {
  await mcp.close();
  feed.close();
}
