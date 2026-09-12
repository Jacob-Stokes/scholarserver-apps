import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

// App-owned library capabilities, not setup or a second sync engine. Existing
// action names remain compatible with retained workflow settings and grants.
export function createLibraryActions({ configuration, api, onlineApi, webApiKey, callBridge, onlineLibrary }) {
  const zoteroWebApiUrl = "https://api.zotero.org";
  let attachmentIndexCache = { expiresAt: 0, items: [] };

  async function attachDoclingResult(input) {
    if (onlineLibrary) throw new Error("Attaching Docling results in Online library only is not available yet");
    const sourceAttachmentKey =
      typeof input.sourceAttachmentKey === "string" ? input.sourceAttachmentKey.trim().toUpperCase() : "";
    const relativePath = typeof input.relativePath === "string" ? input.relativePath.trim() : "";
    if (!/^[A-Z0-9]{8}$/.test(sourceAttachmentKey)) throw new Error("A valid Zotero source attachment key is required");
    if (!/^\.scholarserver\/docling\/[a-f0-9]{64}\/document\.md$/.test(relativePath)) {
      throw new Error("The Docling result path is invalid");
    }
    return callBridge("attach-docling-result", { sourceAttachmentKey, relativePath }, 120_000);
  }

  async function sha256(filePath) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(filePath)) hash.update(chunk);
    return hash.digest("hex");
  }

  async function allowedAttachmentPath(candidate) {
    const desktopDataRoot = "/config/home/Zotero";
    const controllerDataRoot = "/data";
    const translated =
      candidate === desktopDataRoot
        ? controllerDataRoot
        : candidate.startsWith(`${desktopDataRoot}${path.sep}`)
          ? path.join(controllerDataRoot, candidate.slice(desktopDataRoot.length + 1))
          : candidate;
    const resolved = await realpath(translated);
    const roots = [];
    for (const root of ["/data", "/linked"]) {
      try {
        roots.push(await realpath(root));
      } catch {}
    }
    if (!roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
      throw new Error("Zotero returned an attachment outside the configured storage roots");
    }
    if (!(await lstat(resolved)).isFile()) throw new Error("The resolved attachment is not a regular file");
    return resolved;
  }

  async function resolveAttachment(input) {
    const attachmentKey = input.attachmentKey?.trim();
    if (!/^[A-Z0-9]{8}$/.test(attachmentKey ?? ""))
      throw new Error("Attachment key must be eight uppercase letters or digits");
    const config = await configuration();
    if (!config?.userId) throw new Error("Zotero is not configured");
    if (onlineLibrary) {
      const prefix = `/users/${encodeURIComponent(String(config.userId))}/items/${attachmentKey}`;
      const attachment = await onlineApi(prefix);
      if (attachment?.data?.itemType !== "attachment")
        throw new Error("The requested Zotero item is not an attachment");
      const common = {
        attachmentKey,
        filename: attachment.data.filename ?? attachment.data.title ?? null,
        contentType: attachment.data.contentType ?? null,
        linkMode: attachment.data.linkMode ?? null
      };
      if (config.storageMode !== "zotero-storage") return { state: "metadata-only", ...common };
      if (attachment.data.linkMode === "linked_file") {
        return { state: "unavailable", reason: "linked-file", ...common };
      }
      const key = await webApiKey();
      const response = await fetch(`${zoteroWebApiUrl}${prefix}/file`, {
        headers: { "Zotero-API-Key": key, "Zotero-API-Version": "3" },
        redirect: "follow",
        signal: AbortSignal.timeout(120_000)
      });
      if (!response.ok || !response.body) {
        const reason =
          response.status === 404
            ? "The file is not available from Zotero Storage; it may use WebDAV"
            : `HTTP ${response.status}`;
        throw new Error(`Zotero could not provide this attachment: ${reason}`);
      }
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (Number.isFinite(declared) && declared > 1024 * 1024 * 1024)
        throw new Error("This attachment exceeds the 1 GiB safety limit");
      const safeName =
        String(common.filename ?? `${attachmentKey}.bin`)
          .replace(/[^A-Za-z0-9._ -]/g, "_")
          .slice(0, 180) || `${attachmentKey}.bin`;
      const directory = path.join("/cache", "attachments", attachmentKey);
      const destination = path.join(directory, safeName);
      await mkdir(directory, { recursive: true });
      const temporary = `${destination}.${process.pid}.tmp`;
      try {
        await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { mode: 0o600 }));
        await rename(temporary, destination);
      } finally {
        await rm(temporary, { force: true });
      }
      const metadata = await stat(destination);
      return { state: "available", ...common, bytes: metadata.size, sha256: await sha256(destination), cached: true };
    }
    const prefix = `/users/${encodeURIComponent(String(config.userId))}/items/${attachmentKey}`;
    const attachment = await api(prefix);
    if (attachment?.data?.itemType !== "attachment") throw new Error("The requested Zotero item is not an attachment");
    const fileUrl = await api(`${prefix}/file/view/url`);
    if (typeof fileUrl !== "string" || !fileUrl.startsWith("file:"))
      throw new Error("Zotero did not return a local file for this attachment");
    const resolved = await allowedAttachmentPath(fileURLToPath(fileUrl.trim()));
    const metadata = await stat(resolved);
    return {
      state: "available",
      attachmentKey,
      filename: path.basename(resolved),
      contentType: attachment.data.contentType ?? null,
      linkMode: attachment.data.linkMode ?? null,
      bytes: metadata.size,
      sha256: await sha256(resolved)
    };
  }

  async function personalAttachments(userId) {
    if (attachmentIndexCache.expiresAt > Date.now()) return attachmentIndexCache.items;
    const items = [];
    for (let start = 0; start < 1000; start += 100) {
      const page = await api(
        `/users/${encodeURIComponent(String(userId))}/items?itemType=attachment&limit=100&start=${start}&format=json`
      );
      if (!Array.isArray(page)) throw new Error("Zotero returned an invalid attachment list");
      items.push(...page);
      if (page.length < 100) break;
    }
    attachmentIndexCache = { expiresAt: Date.now() + 30_000, items };
    return items;
  }

  async function matchAttachment(input) {
    if (onlineLibrary) throw new Error("Shared linked-file matching requires the Complete Zotero workspace");
    const sourcePath = typeof input.sourcePath === "string" ? input.sourcePath.trim().replaceAll("\\", "/") : "";
    const relative = sourcePath ? sourcePath.split("/") : [];
    if (!sourcePath || sourcePath.startsWith("/") || relative.some((part) => !part || part === "." || part === "..")) {
      throw new Error("Enter a valid path inside the linked research files folder");
    }
    const linkedRoot = await realpath("/linked");
    const expected = await realpath(path.join(linkedRoot, ...relative));
    if (expected === linkedRoot || !expected.startsWith(`${linkedRoot}${path.sep}`)) {
      throw new Error("The selected file leaves the linked research files folder");
    }
    const config = await configuration();
    if (!config?.userId) throw new Error("Zotero is not configured");
    const wantedName = path.basename(expected).toLocaleLowerCase();
    const attachments = await personalAttachments(config.userId);
    const candidates = attachments.filter((item) => {
      const data = item?.data ?? {};
      const storedPath = String(data.path ?? "").replace(/^attachments:/, "");
      const filename = String(data.filename ?? path.basename(storedPath) ?? data.title ?? "");
      return filename.toLocaleLowerCase() === wantedName || String(data.title ?? "").toLocaleLowerCase() === wantedName;
    });
    const matches = [];
    for (const item of candidates) {
      const key = String(item?.key ?? item?.data?.key ?? "").toUpperCase();
      if (!/^[A-Z0-9]{8}$/.test(key)) continue;
      try {
        const prefix = `/users/${encodeURIComponent(String(config.userId))}/items/${key}`;
        const fileUrl = await api(`${prefix}/file/view/url`);
        if (typeof fileUrl !== "string" || !fileUrl.startsWith("file:")) continue;
        if ((await allowedAttachmentPath(fileURLToPath(fileUrl.trim()))) !== expected) continue;
        matches.push({
          attachmentKey: key,
          parentItemKey: item?.data?.parentItem ?? null,
          title: item?.data?.title ?? path.basename(expected)
        });
      } catch {}
    }
    if (matches.length === 1) return { state: "matched", sourcePath, ...matches[0] };
    if (matches.length > 1) return { state: "ambiguous", sourcePath, matches };
    return { state: "not-found", sourcePath, matches: [] };
  }

  return { resolveAttachment, matchAttachment, attachDoclingResult };
}
