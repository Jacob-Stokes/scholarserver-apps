// Reuse the catalog's pinned assets. Vite bundles these as same-origin files,
// including when Manager's authenticated catalog is not available.
export const packagedAppIcons: Record<string, string> = {
  "org.scholarserver.zotero": new URL("../../../zotero/package/assets/icons/zotero.webp", import.meta.url).href,
  "org.scholarserver.obsidian": new URL("../../../obsidian/package/assets/icons/obsidian.webp", import.meta.url).href,
  "org.scholarserver.docling": new URL("../../../docling/package/assets/icons/docling.webp?no-inline", import.meta.url)
    .href
};
