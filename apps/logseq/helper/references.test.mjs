import assert from "node:assert/strict";
import test from "node:test";
import { prepareReferences, readableTitles } from "./references.mjs";
import { jsonValue } from "./worker-http.mjs";

const id = "8d36b15b-b041-4700-b00f-932d96b6bdfb";
const page = { "db/id": 12, "block/uuid": id, "block/title": "Synthetic αβγ", "block/name": "synthetic αβγ" };
test("display links become canonical UUID links without creating duplicate reference pages", async () => {
  let creations = 0;
  const prepared = await prepareReferences(
    "[[Synthetic αβγ]] and [[Synthetic αβγ]]",
    async () => {
      creations++;
      return page;
    },
    async () => page
  );
  assert.equal(creations, 1);
  assert.equal(prepared.content, `[[${id}]] and [[${id}]]`);
  assert.equal(jsonValue(prepared.refs)[0]["db/id"], 12);
  await prepareReferences(
    `[[${id}]]`,
    async () => {
      throw new Error("Must not create a UUID-named page");
    },
    async () => page
  );
});
test("reads resolve UUID display titles once and preserve unknown references", async () => {
  let reads = 0;
  const root = { "block/title": `Source [[${id}]]`, "block/children": [{ "block/title": `Child [[${id}]]` }] };
  const result = await readableTitles(root, async () => {
    reads++;
    return page;
  });
  assert.equal(reads, 1);
  assert.equal(result["block/children"][0]["block/title"], "Child [[Synthetic αβγ]]");
  assert.equal((await readableTitles(root, async () => null))["block/title"], root["block/title"]);
});
