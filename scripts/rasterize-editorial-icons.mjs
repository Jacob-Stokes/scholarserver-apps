import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (process.argv.length !== 3 || !["--write", "--check"].includes(mode)) {
  throw new Error("Usage: node scripts/rasterize-editorial-icons.mjs --write|--check");
}
const magick = process.env.EDITORIAL_MAGICK ?? "/opt/homebrew/bin/magick";
const lock = JSON.parse(await readFile(path.join(root, "editorial-icons.lock.json"), "utf8"));
const temporary = await mkdtemp(path.join(tmpdir(), "scholarserver-editorial-icons-"));
try {
  for (const [app, icon] of Object.entries(lock.icons)) {
    // The reviewed inventory can select only this app's source and raster, never an arbitrary output path.
    if (
      !/^[a-z0-9-]+$/.test(app) ||
      icon.source !== `apps/${app}/artwork/editorial.svg` ||
      icon.path !== `apps/${app}/package/assets/icons/${app}-editorial.png`
    ) {
      throw new Error(`${app}: unexpected editorial asset path`);
    }
    for (const relative of [icon.source, icon.path]) {
      const filename = path.join(root, relative);
      const information = await lstat(filename);
      if (!information.isFile() || information.isSymbolicLink() || (await realpath(filename)) !== filename) {
        throw new Error(`${app}: asset must be a regular file without symlink ancestors`);
      }
    }
    const destination = mode === "--write" ? path.join(root, icon.path) : path.join(temporary, `${app}.png`);
    const result = spawnSync(
      magick,
      [
        "-limit",
        "thread",
        "1",
        "-limit",
        "memory",
        "64MiB",
        "-limit",
        "map",
        "64MiB",
        "-background",
        "none",
        "-density",
        "192",
        path.join(root, icon.source),
        "-resize",
        "256x256",
        "-strip",
        "-define",
        "png:exclude-chunks=date,time",
        `PNG32:${destination}`
      ],
      { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    if (result.error || result.status !== 0) {
      throw new Error(`${app}: rasterization failed: ${result.error?.message ?? result.stderr}`);
    }
    if (mode === "--check") {
      const expected = await readFile(path.join(root, icon.path));
      const actual = await readFile(destination);
      if (!actual.equals(expected)) throw new Error(`${app}: committed raster differs from the SVG rendering`);
    }
    console.log(`${app}: ${mode === "--write" ? "rendered" : "matches source"}`);
    if (mode === "--write") {
      const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
      console.log(
        JSON.stringify({
          sourceSha256: digest(await readFile(path.join(root, icon.source))),
          sha256: digest(await readFile(destination))
        })
      );
    }
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
