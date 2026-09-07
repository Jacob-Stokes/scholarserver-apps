import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Preserve existing published entries instead of releasing unrelated local work.
const [previousIndex, archive, output] = process.argv.slice(2);
if (!previousIndex || !archive || !output) {
  throw new Error("Provide the previous catalog index, beta archive and new output index.");
}
const filename = path.basename(archive);
if (filename !== "logseq-0.1.0-beta.1.tar.gz") throw new Error("Unexpected beta archive");
const index = JSON.parse(await readFile(previousIndex, "utf8"));
if (index.schemaVersion !== 1 || !Array.isArray(index.applications)) throw new Error("Invalid previous index");
if (index.applications.some((entry) => entry.id === "org.scholarserver.logseq")) {
  throw new Error("Logseq already exists; review the next release explicitly");
}
const bytes = await readFile(archive);
index.applications.push({
  id: "org.scholarserver.logseq",
  version: "0.1.0-beta.1",
  bundle: `https://github.com/Jacob-Stokes/scholarserver-apps/releases/download/v0.2.27/${filename}`,
  sha256: createHash("sha256").update(bytes).digest("hex")
});
await writeFile(output, `${JSON.stringify(index, null, 2)}\n`, { flag: "wx" });
