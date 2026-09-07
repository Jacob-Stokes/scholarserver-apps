// Runs only inside a disposable integration container, never against a user's reader.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { FreshRssClient } from "./client.mjs";

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
  const response = await fetch(`${origin}/api/connect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "researcher", password: "Disposable-Reader-Only-2026" })
  });
  assert.equal(response.status, 202);
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
  const readerPage = await fetch("http://127.0.0.1:8082/i/", {
    headers: { "accept-encoding": "gzip, deflate, br" }
  });
  assert.equal(readerPage.headers.get("content-encoding"), null, "reader proxy supplies an uncompressed body");
  const readerHtml = await readerPage.text();
  assert.match(readerHtml, /FreshRSS/, "reader login page loads through the proxy");
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
    const result = await mcp.callTool({ name: `freshrss_${name}`, arguments: args });
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
  console.log(
    "PASS: fresh setup, synthetic feed, all six MCP tools, read/star persistence, unauthenticated rejection, password removal"
  );
} finally {
  await mcp.close();
  feed.close();
}
