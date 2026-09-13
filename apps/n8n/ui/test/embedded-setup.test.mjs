import assert from "node:assert/strict";
import test from "node:test";
import { parseEmbeddedSetup, resolveEmbeddedSetup } from "../src/embedded-setup.ts";

const template = {
  id: "reading",
  name: "Reading",
  description: "",
  schedule: null,
  requirements: [],
  presentation: null
};

test("embedded setup parses optional template and automation IDs", () => {
  assert.deepEqual(parseEmbeddedSetup("?managerSetup=1&templateId=reading&automationId=copy-1"), {
    enabled: true,
    templateId: "reading",
    automationId: "copy-1"
  });
  assert.equal(parseEmbeddedSetup("?managerSetup=0").enabled, false);
});

test("embedded setup rejects missing or invalid IDs without creating an installation", () => {
  assert.equal(resolveEmbeddedSetup(parseEmbeddedSetup("?managerSetup=1"), [template], {}).kind, "engine");
  assert.equal(
    resolveEmbeddedSetup(parseEmbeddedSetup("?managerSetup=1&automationId=copy-1"), [template], {}).kind,
    "invalid"
  );
  assert.equal(
    resolveEmbeddedSetup(parseEmbeddedSetup("?managerSetup=1&templateId=missing"), [template], {}).kind,
    "invalid"
  );
  assert.equal(
    resolveEmbeddedSetup(parseEmbeddedSetup("?managerSetup=1&templateId=reading&automationId=missing"), [template], {})
      .kind,
    "invalid"
  );
});

test("only a rejected matching receipt resolves to retry", () => {
  const receipt = { templateId: "reading", state: "rejected", operationId: "op-1", workflowId: null };
  const result = resolveEmbeddedSetup(
    parseEmbeddedSetup("?managerSetup=1&templateId=reading&automationId=copy-1"),
    [template],
    { "copy-1": receipt }
  );
  assert.equal(result.kind, "retry");
  assert.equal(result.kind === "retry" && result.receipt.operationId, "op-1");
  assert.equal(
    resolveEmbeddedSetup(parseEmbeddedSetup("?managerSetup=1&templateId=reading&automationId=copy-1"), [template], {
      "copy-1": { ...receipt, state: "installed" }
    }).kind,
    "invalid"
  );
});
