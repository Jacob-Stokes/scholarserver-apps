import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { Agent, fetch } from "undici";
import transport from "./local-sync-transport.cjs";

test("only the exact private sync origin uses Docker transport; paths, bodies and authentication survive", async (t) => {
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ path: req.url, method: req.method, authorization: req.headers.authorization, body }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const local = `http://127.0.0.1:${server.address().port}`;
  const publicOrigin = "https://synthetic.test.ts.net:12000";
  const agent = new Agent().compose(transport.localSyncInterceptor(publicOrigin, local));
  t.after(async () => {
    await agent.close();
    server.close();
  });
  const response = await fetch(`${publicOrigin}/snapshot?part=1`, {
    dispatcher: agent,
    method: "POST",
    headers: { authorization: "Bearer synthetic-test" },
    body: "synthetic bytes"
  });
  assert.deepEqual(await response.json(), {
    path: "/snapshot?part=1",
    method: "POST",
    authorization: "Bearer synthetic-test",
    body: "synthetic bytes"
  });
  assert.equal((await fetch(`${local}/unchanged`, { dispatcher: agent })).status, 200);
  const calls = [];
  const dispatch = transport.localSyncInterceptor(publicOrigin)((options) => calls.push(options.origin));
  for (const origin of [
    `${publicOrigin}.evil.invalid`,
    "https://synthetic.test.ts.net:12001",
    "http://synthetic.test.ts.net:12000",
    "https://accounts.google.com"
  ])
    dispatch({ origin }, {});
  assert.deepEqual(calls, [
    `${publicOrigin}.evil.invalid`,
    "https://synthetic.test.ts.net:12001",
    "http://synthetic.test.ts.net:12000",
    "https://accounts.google.com"
  ]);
});
