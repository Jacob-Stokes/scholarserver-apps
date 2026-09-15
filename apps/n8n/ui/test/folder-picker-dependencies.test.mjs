import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("isolated n8n UI installs declare the folder picker's runtime peers", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  for (const name of ["@radix-ui/react-dialog", "lucide-react"]) {
    assert.match(manifest.dependencies[name], /^\d+\.\d+\.\d+$/);
  }
});
