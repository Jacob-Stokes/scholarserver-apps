import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, mkdir, open, unlink } from "node:fs/promises";

// Linux directory descriptors keep concurrent folder/symlink changes from
// redirecting a write outside the chosen vault. Publish with an exclusive hard
// link: retries preserve existing user edits and never mistake partial data for
// a completed note. All staging names are hidden from the sync client's index.
export async function createResearchNote(vaultRoot, { folder, filename, content }) {
  if (process.platform !== "linux") throw new Error("Research note creation requires the Linux app controller");
  if (
    typeof folder !== "string" ||
    !folder ||
    folder.length > 200 ||
    folder.split("/").some((part) => !part || part.startsWith(".") || /[\\\x00-\x1f]/.test(part))
  ) {
    throw new Error("Choose a relative notes folder without hidden or parent paths");
  }
  if (typeof filename !== "string" || !/^(zotero-[A-Z0-9]{8}|digest-\d{4}-\d{2}-\d{2})\.md$/.test(filename)) {
    throw new Error("Invalid research note filename");
  }
  if (typeof content !== "string" || Buffer.byteLength(content) > 256 * 1024 || content.includes("\0")) {
    throw new Error("Research note content exceeds the supported limit");
  }
  const handles = [];
  let temporary;
  try {
    let directory = await open(vaultRoot, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    handles.push(directory);
    for (const segment of folder.split("/")) {
      const child = `/proc/self/fd/${directory.fd}/${segment}`;
      await mkdir(child, { mode: 0o750 }).catch((error) => {
        if (error.code !== "EEXIST") throw error;
      });
      directory = await open(child, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      handles.push(directory);
    }
    const parent = `/proc/self/fd/${directory.fd}`;
    const target = `${parent}/${filename}`;
    temporary = `${parent}/.scholarserver-${randomUUID()}.tmp`;
    const file = await open(temporary, "wx", 0o640);
    try {
      await file.writeFile(content, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await link(temporary, target);
      await directory.sync();
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      return { state: "existing", path: `${folder}/${filename}` };
    }
    return { state: "created", path: `${folder}/${filename}` };
  } finally {
    try {
      if (temporary)
        await unlink(temporary).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
    } finally {
      await Promise.allSettled(handles.map((handle) => handle.close()));
    }
  }
}
