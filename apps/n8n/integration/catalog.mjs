import { readdir, readFile } from "node:fs/promises";
import { readTemplate } from "./templates.mjs";

export async function readCatalog(directory) {
  const files = (await readdir(directory)).filter((name) => name.endsWith(".yaml")).sort();
  const templates = [];
  const ids = new Set();
  for (const file of files) {
    const template = readTemplate(await readFile(new URL(file, directory), "utf8"));
    if (ids.has(template.id)) throw new Error("Duplicate automation template identity");
    ids.add(template.id);
    templates.push(template);
  }
  return templates;
}
