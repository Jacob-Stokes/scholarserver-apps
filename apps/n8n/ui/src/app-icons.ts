import type { IconStyle } from "@scholarserver/ui/icon-preference";

export type AppIconAssets = { original?: string; editorial?: string };
export type AppIcons = Record<string, AppIconAssets>;

// Offline/standalone fallback for this app's declared research roles, not a Manager app registry.
// Both styles come from package assets. Do not inline data URLs under the app's CSP.
export const packagedAppIcons: AppIcons = {
  "org.scholarserver.zotero": {
    original: new URL("../../../zotero/package/assets/icons/zotero.webp?no-inline", import.meta.url).href,
    editorial: new URL("../../../zotero/package/assets/icons/zotero-editorial.png?no-inline", import.meta.url).href
  },
  "org.scholarserver.obsidian": {
    original: new URL("../../../obsidian/package/assets/icons/obsidian.webp?no-inline", import.meta.url).href,
    editorial: new URL("../../../obsidian/package/assets/icons/obsidian-editorial.png?no-inline", import.meta.url).href
  },
  "org.scholarserver.docling": {
    original: new URL("../../../docling/package/assets/icons/docling.webp?no-inline", import.meta.url).href,
    editorial: new URL("../../../docling/package/assets/icons/docling-editorial.png?no-inline", import.meta.url).href
  }
};

function catalogIconUrl(icon: unknown): string | undefined {
  if (!icon || typeof icon !== "object" || !("url" in icon) || typeof icon.url !== "string") return;
  const url = icon.url;
  if (!/^\/api\/v1\/catalog\/[A-Za-z0-9._%+~-]+\/[A-Za-z0-9._%+~-]+\/(?:editorial-icon|icon)$/.test(url)) return;
  // Reject normalized dot segments, including percent-encoded ones, rather than following another API route.
  if (new URL(url, "https://catalog.invalid").pathname !== url) return;
  return url;
}

export function catalogAppIcons(applications: unknown): AppIcons {
  const icons: AppIcons = Object.create(null);
  if (!Array.isArray(applications)) return icons;
  for (const app of applications) {
    if (!app || typeof app.id !== "string") continue;
    icons[app.id] = { original: catalogIconUrl(app.icon), editorial: catalogIconUrl(app.editorialIcon) };
  }
  return icons;
}

export function selectAppRoleIcon(
  packageId: string,
  style: IconStyle,
  catalog: AppIcons,
  failedUrls: readonly string[] = []
): string | undefined {
  const available = catalog[packageId];
  const packaged = packagedAppIcons[packageId];
  const candidates =
    style === "editorial"
      ? [available?.editorial, packaged?.editorial, available?.original, packaged?.original]
      : [available?.original, packaged?.original];
  return candidates.find((url) => url !== undefined && !failedUrls.includes(url));
}
