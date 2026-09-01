import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(await readFile(path.join(repositoryRoot, "icons.lock.json"), "utf8"));

for (const [application, icon] of Object.entries(lock.icons)) {
  const url = `https://cdn.jsdelivr.net/gh/${lock.upstream.repository}@${lock.upstream.commit}/webp/${icon.reference}.webp`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${application}: icon download failed with HTTP ${response.status}`);
  const content = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(content).digest("hex");
  if (digest !== icon.sha256) throw new Error(`${application}: downloaded icon does not match icons.lock.json`);
  const destination = path.join(repositoryRoot, icon.path);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, { mode: 0o644 });
  process.stdout.write(`${application}: ${path.relative(repositoryRoot, destination)}\n`);
}
