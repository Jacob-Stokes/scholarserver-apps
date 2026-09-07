// Release artifacts, not installed user data. Keep exact upstream revisions available.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const output = process.argv[2];
if (!output) throw new Error("Provide a new source-archive directory.");
await mkdir(output);
const sources = [
  ["logseq-client", "logseq/logseq", "26f6f7880b1ec894871a9ec2c03bb97b954b4cb0"],
  ["logseq-sync", "logseq/logseq", "4e88418b85bbaca326220af1f276697b7735d7a3"],
  ["logseq-browser", "logseq/logseq", "d2ab7726ab74402c14fdbc33041a89ac55c899ae"],
  ["logseq-sync-packaging", "yshalsager/logseq-selfhost", "3c894de08098169466ddba57fc8e7befc236ed39"],
  ["logseq-browser-packaging", "yshalsager/logseq-selfhost", "6e7845732560b9f8e169bc1f9886adfd395dc0ee"]
];
const inventory = [];
for (const [name, repository, revision] of sources) {
  const url = `https://codeload.github.com/${repository}/tar.gz/${revision}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Source download failed: ${name}, HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error(`Source is not a gzip archive: ${name}`);
  const file = `${name}-source-${revision}.tar.gz`;
  await writeFile(path.join(output, file), bytes, { flag: "wx" });
  inventory.push({ name, repository, revision, url, file, sha256: createHash("sha256").update(bytes).digest("hex") });
  console.log(`Collected ${name} source`);
}
await writeFile(path.join(output, "logseq-sources.json"), `${JSON.stringify(inventory, null, 2)}\n`, { flag: "wx" });
