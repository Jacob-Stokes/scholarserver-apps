import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the integration image ships the Manager connection module used by setup and research", async () => {
  const recipe = await readFile(new URL("./Dockerfile", import.meta.url), "utf8");
  assert.match(recipe, /COPY apps\/n8n\/integration\/manager-connection\.mjs \.\//);
});
