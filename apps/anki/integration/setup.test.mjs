import assert from "node:assert/strict";
import test from "node:test";
import { setupPlan, validateSetupDraft } from "./setup.mjs";

test("sync only never selects a desktop or MCP; desktop and server storage remain separate", () => {
  assert.deepEqual(setupPlan("sync-only").services, ["controller", "sync"]);
  assert.deepEqual(setupPlan("ankiweb-desktop").services, ["controller", "desktop", "mcp"]);
  assert.deepEqual(setupPlan("self-hosted-desktop").data, [
    "runtime",
    "desktop",
    "operations",
    "sync",
    "sync-credentials"
  ]);
});
test("save rejects credentials, unknown options and installed setup changes", () => {
  assert.throws(() => validateSetupDraft({ option: "sync-only", password: "synthetic" }));
  assert.throws(() => validateSetupDraft({ option: "unknown" }));
  assert.throws(() => validateSetupDraft({ option: "sync-only" }, "ankiweb-desktop"), /migration/);
  assert.deepEqual(validateSetupDraft({ option: "sync-only" }, "sync-only"), { option: "sync-only" });
});
