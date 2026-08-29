import { z } from "zod";
import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ZoteroClient } from "../zotero-client.js";

// Zotero attachments as exposed by Zotero 10's local API. Ordinary agent
// reads use Zotero's indexed text rather than transporting PDF bytes over MCP.
//
// If you want the actual PDF binary, open the item in the Zotero desktop
// app — that's the separate UX path.

export const ATTACHMENTS_TOOL = {
  name: "zotero_attachments",
  description: [
    "Work with files attached to Zotero items (PDFs, HTML snapshots). Actions:",
    "• list — show attachments for an item (filename, type, link mode, etc.). Pass the parent item key.",
    "• get_text — read a Markdown/text attachment directly, or fetch Zotero's extracted full text for a PDF/HTML attachment. Pass either attachment_key directly, or parent item_key + index (defaults to first attachment of the item).",
    "PDF bytes are not transported over MCP. Docling Markdown is read from the server's read-only Zotero data mount, so it does not depend on Zotero full-text indexing.",
  ].join(" "),
} as const;

export const AttachmentsInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list"),
    item_key: z.string().length(8).describe("Parent item key (the paper/book the files are attached to)."),
  }),
  z.object({
    action: z.literal("get_text"),
    attachment_key: z.string().length(8).optional().describe("Attachment item key (each file is its own item in Zotero)."),
    item_key: z.string().length(8).optional().describe("Alternative: parent item key + index to pick the index'th attachment."),
    index: z.number().int().min(0).default(0).describe("Used with item_key — which attachment of the parent to return."),
    max_chars: z.number().int().min(500).max(200_000).default(100_000).describe("Truncate the returned text if it exceeds this length (keeps responses tractable for very long docs)."),
  }),
]);

export async function handleAttachments(client: ZoteroClient, input: z.infer<typeof AttachmentsInput>) {
  switch (input.action) {
    case "list": {
      const { data } = await client.get<any[]>(client.userPath(`/items/${input.item_key}/children`));
      const attachments = (data ?? [])
        .filter((it: any) => it.data?.itemType === "attachment")
        .map(compactAttachment);
      return {
        item_key: input.item_key,
        count: attachments.length,
        attachments,
      };
    }

    case "get_text": {
      let attKey = input.attachment_key;
      let parentInfo: { item_key: string; index: number } | null = null;

      if (!attKey) {
        if (!input.item_key) throw new Error("either attachment_key or item_key is required");
        const { data } = await client.get<any[]>(client.userPath(`/items/${input.item_key}/children`));
        const attachments = (data ?? []).filter((it: any) => it.data?.itemType === "attachment");
        if (attachments.length === 0) throw new Error(`no attachments on item ${input.item_key}`);
        const picked = attachments[input.index];
        if (!picked) throw new Error(`item ${input.item_key} has only ${attachments.length} attachments (asked for index ${input.index})`);
        attKey = picked.data.key;
        parentInfo = { item_key: input.item_key, index: input.index };
      }
      if (!attKey) throw new Error("could not resolve the attachment key");

      const direct = await directTextAttachment(client, attKey, input.max_chars);
      if (direct) {
        return {
          attachment_key: attKey,
          ...(parentInfo ? { resolved_from: parentInfo } : {}),
          source: "direct_file",
          chars_returned: direct.content.length,
          truncated: direct.truncated,
          content: direct.content,
        };
      }

      const { data: ft } = await client.get<any>(client.userPath(`/items/${attKey}/fulltext`));
      const content: string = ft?.content ?? "";
      const truncated = content.length > input.max_chars;
      const body = truncated ? content.slice(0, input.max_chars) : content;

      return {
        attachment_key: attKey,
        ...(parentInfo ? { resolved_from: parentInfo } : {}),
        source: "zotero_index",
        indexed_pages: ft?.indexedPages,
        total_pages: ft?.totalPages,
        indexed_chars: ft?.indexedChars,
        total_chars: ft?.totalChars,
        chars_returned: body.length,
        truncated,
        content: body,
        ...(content.length === 0 ? {
          note: "Fulltext is empty — the attachment hasn't been indexed yet (open the item in Zotero desktop to trigger indexing) or it's a scanned/image-only PDF without OCR.",
        } : {}),
      };
    }
  }
}

async function directTextAttachment(client: ZoteroClient, attachmentKey: string, maxChars: number) {
  const { data: attachment } = await client.get<any>(client.userPath(`/items/${attachmentKey}`));
  const contentType = String(attachment?.data?.contentType ?? "").toLowerCase();
  const filename = String(attachment?.data?.filename ?? "").toLowerCase();
  if (!(contentType.startsWith("text/") || filename.endsWith(".md") || filename.endsWith(".txt"))) return null;

  const { data: fileUrl } = await client.get<string>(client.userPath(`/items/${attachmentKey}/file/view/url`));
  if (typeof fileUrl !== "string" || !fileUrl.trim().startsWith("file:")) {
    throw new Error("Zotero did not return a local file for this text attachment");
  }
  const desktopDataRoot = "/config/home/Zotero";
  const candidate = fileURLToPath(fileUrl.trim());
  const translated = candidate === desktopDataRoot
    ? "/data"
    : candidate.startsWith(`${desktopDataRoot}${path.sep}`)
      ? path.join("/data", candidate.slice(desktopDataRoot.length + 1))
      : candidate;
  const resolved = await realpath(translated);
  const roots = await Promise.all(["/data", "/linked"].map(async (root) => {
    try { return await realpath(root); } catch { return null; }
  }));
  if (!roots.some((root) => root && (resolved === root || resolved.startsWith(`${root}${path.sep}`)))) {
    throw new Error("Zotero returned a text attachment outside the approved read-only storage roots");
  }
  const metadata = await stat(resolved);
  if (!metadata.isFile() || metadata.size > 50 * 1024 * 1024) {
    throw new Error("The text attachment is not a regular file or exceeds 50 MiB");
  }
  const content = await readFile(resolved, "utf8");
  return { content: content.slice(0, maxChars), truncated: content.length > maxChars };
}

function compactAttachment(att: any) {
  const d = att.data ?? {};
  return {
    key: d.key,
    filename: d.filename,
    title: d.title,
    content_type: d.contentType,
    link_mode: d.linkMode,
    path: d.path,
  };
}
