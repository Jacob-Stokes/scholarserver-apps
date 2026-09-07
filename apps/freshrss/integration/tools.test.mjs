import assert from "node:assert/strict";
import test from "node:test";
import { zodToJsonSchema } from "mcp-common";
import { article, safeUrl } from "./client.mjs";
import { feedTools } from "./tools.mjs";

test("all tools publish valid object schemas for real MCP clients", () => {
  const tools = feedTools({});
  assert.equal(tools.length, 6);
  for (const tool of tools) assert.match(tool.def.name, /^freshrss_[a-z_]+$/);
  for (const tool of tools) assert.equal(zodToJsonSchema(tool.def.inputSchema).type, "object", tool.def.name);
});
test("article output is bounded text, strips images and never forwards URL passwords", () => {
  const result = article({
    summary: { content: `<p>${"a".repeat(30_000)}</p><img src="https://tracker.invalid"/>` },
    alternate: [{ href: "https://name:secret@example.org/paper" }]
  });
  assert.ok(result.text.length <= 12_000);
  assert.equal(result.url, "https://example.org/paper");
  assert.equal(safeUrl("javascript:alert(1)"), undefined);
});
test("no state change occurs without an explicit requested state", async () => {
  const tool = feedTools({ request: () => assert.fail("must not write") }).find(
    (tool) => tool.def.name === "freshrss_set_article_state"
  );
  await assert.rejects(tool.handler({ id: "example" }), /Choose a state/);
});
test("article listing caps requested results and forwards unread filtering", async () => {
  const tool = feedTools({
    request: async (_path, parameters) => {
      assert.equal(parameters.xt, "user/-/state/com.google/read");
      return { items: [] };
    }
  }).find((tool) => tool.def.name === "freshrss_list_articles");
  assert.throws(() => tool.def.inputSchema.parse({ limit: 10000 }));
  assert.equal((await tool.handler({ limit: 2, unreadOnly: true })).untrusted, true);
});
