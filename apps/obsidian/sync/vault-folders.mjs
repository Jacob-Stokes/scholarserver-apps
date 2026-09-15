import { constants } from "node:fs";
import fs from "node:fs/promises";

const maximumPathLength = 200;
const maximumEntries = 2000;
const maximumFolders = 250;

class FolderBrowseError extends Error {}

function validSegment(segment) {
  return segment.length > 0 && !segment.startsWith(".") && !/[\\\x00-\x1f\x7f]/.test(segment);
}

function folderPath(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "path")) {
    throw new FolderBrowseError("Supply only a relative vault folder path");
  }
  const value = input.path === undefined ? "" : input.path;
  if (
    typeof value !== "string" ||
    value.length > maximumPathLength ||
    (value !== "" && !value.split("/").every(validSegment))
  ) {
    throw new FolderBrowseError("Choose a relative vault folder without hidden or parent paths");
  }
  return value;
}

// The mounted vault is the same root used by create-research-note. Open each
// component without following links, then enumerate through its held descriptor:
// replacing a path with a symlink cannot redirect this read to another directory.
export async function browseVaultFolders(vaultRoot, input = {}) {
  const relativePath = folderPath(input);
  if (process.platform !== "linux")
    throw new FolderBrowseError("Vault folder browsing requires the Linux app controller");
  const handles = [];
  try {
    const flags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
    let directory = await fs.open(vaultRoot, flags);
    handles.push(directory);
    if (relativePath !== "") {
      for (const segment of relativePath.split("/")) {
        directory = await fs.open(`/proc/self/fd/${directory.fd}/${segment}`, flags);
        handles.push(directory);
      }
    }

    const listing = await fs.opendir(`/proc/self/fd/${directory.fd}`);
    const folders = [];
    let entries = 0;
    // Stream a single level; bound all entries, not just returned directories.
    // Fail rather than present an incomplete listing as the complete folder set.
    for await (const entry of listing) {
      entries += 1;
      if (entries > maximumEntries)
        throw new FolderBrowseError("This folder has too many entries to browse (maximum 2000)");
      if (!entry.isDirectory() || !validSegment(entry.name)) continue;
      const childPath = relativePath === "" ? entry.name : `${relativePath}/${entry.name}`;
      if (childPath.length > maximumPathLength) continue;
      folders.push({ name: entry.name, path: childPath });
      if (folders.length > maximumFolders)
        throw new FolderBrowseError("This folder has too many subfolders to browse (maximum 250)");
    }
    folders.sort((left, right) => left.name.localeCompare(right.name));
    let parent = null;
    if (relativePath !== "") parent = relativePath.split("/").slice(0, -1).join("/");
    return { path: relativePath, parent, folders };
  } catch (error) {
    if (error instanceof FolderBrowseError) throw error;
    // Filesystem errors can include server paths; never return them to callers.
    throw new FolderBrowseError(
      "Could not browse that vault folder. Choose an existing, accessible folder without symbolic links."
    );
  } finally {
    await Promise.allSettled(handles.map((handle) => handle.close()));
  }
}
