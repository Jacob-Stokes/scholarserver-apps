import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(file)));
    else if (/\.tsx?$/.test(file)) files.push(file);
  }
  return files;
}

test("every existing app UI adopts shared reads rather than browser polling loops", async () => {
  const root = new URL("../apps/", import.meta.url);
  const violations = [];
  const checked = [];
  for (const app of await readdir(root, { withFileTypes: true })) {
    if (!app.isDirectory()) continue;
    const directory = new URL(`${app.name}/ui/src/`, root);
    let files;
    try {
      files = await sourceFiles(directory.pathname);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    checked.push(app.name);
    let shared = false;
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (source.includes('"@scholarserver/ui/use-read-resource"')) shared = true;
      const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      function visit(node) {
        if (ts.isCallExpression(node)) {
          const callee = node.expression.getText(tree);
          if (
            ["window.setInterval", "globalThis.setInterval", "window.setTimeout", "globalThis.setTimeout"].includes(
              callee
            )
          )
            violations.push(`${file}: custom browser timer`);
          if (callee === "useEffect" || callee === "React.useEffect") {
            function inspectEffect(child) {
              if (
                ts.isCallExpression(child) &&
                ["fetch", "window.fetch", "setInterval", "setTimeout"].includes(child.expression.getText(tree))
              )
                violations.push(`${file}: network/timer lifecycle in an effect`);
              ts.forEachChild(child, inspectEffect);
            }
            node.arguments.forEach(inspectEffect);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
    if (!shared) violations.push(`${app.name}: no shared read consumer`);
  }
  assert(checked.length >= 6, "Scan all shipped application UIs");
  assert.deepEqual(violations, []);
});
