import type { EndpointAccessOption } from "@scholarserver/ui/endpoint-access";

export type SetupStage = "account" | "storage" | "access" | "authorization" | "ready";

export type AccountSession = {
  state: "idle" | "starting" | "pending" | "connected" | "cancelled" | "interrupted";
  loginUrl?: string;
  error?: string;
};

export function approvedLoginUrl(value: string): string {
  const url = new URL(value);
  if (
    url.origin !== "https://www.zotero.org" ||
    url.username ||
    url.password ||
    (url.pathname !== "/login" && !url.pathname.startsWith("/login/"))
  ) {
    throw new Error("Zotero returned an unrecognized sign-in address");
  }
  return url.href;
}

export function canEmbedDesktop(endpointUrl: string, origin: string): boolean {
  try {
    const url = new URL(endpointUrl, origin);
    return url.origin === origin && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function initialSetupStage(state: string): SetupStage {
  switch (state) {
    case "ready":
      return "ready";
    case "authorization-required":
      return "authorization";
    case "desktop-access-required":
      return "access";
    case "storage-required":
      return "storage";
    default:
      return "account";
  }
}

export function stageAfterAccessLoad(current: SetupStage, hasSelection: boolean): SetupStage {
  // A desktop must have an address before it can be opened for authorization.
  if (!hasSelection && (current === "authorization" || current === "ready")) return "access";
  if (hasSelection && current === "access") return "authorization";
  return current;
}

export function defaultDesktopAuthentication(option: EndpointAccessOption): "none" | "authentik" {
  const authentication = option.authentication;
  if (authentication.authentik === "unsupported") return "none";
  if (!authentication.available) return "none";
  return authentication.defaultEnabled ? "authentik" : "none";
}

export function selectedDesktopOptionId(
  options: EndpointAccessOption[],
  savedOptionId: string | undefined,
  currentOptionId: string
): string {
  const saved = options.find((option) => option.id === savedOptionId);
  if (saved) return saved.id;

  const current = options.find((option) => option.id === currentOptionId);
  if (current) return current.id;

  const recommended = options.find((option) => option.recommended);
  return recommended?.id ?? options[0]?.id ?? "";
}

export type Status = {
  state: string;
  desktop: string;
  version: string | null;
  localApi: string;
  variant: string;
  connectionMode: "complete-workspace" | "online-library";
  storageMode: string | null;
  accountConnected: boolean;
  userId: string | null;
  username: string | null;
  downloadMode: string | null;
  groupFileSync: boolean;
  linkedFolder: string | null;
  linkedFolderAutomation: boolean;
  storageVerified: boolean;
  syncInProgress: boolean;
  lastError: string | null;
  permissions: { library: boolean; notes: boolean; write: boolean; groups: string } | null;
  features: { desktop: boolean; automations: boolean; localAttachments: boolean };
};
export type DesktopAccessSelection = {
  optionId: string;
  transport: EndpointAccessOption["transport"];
  url: string;
  authentication: "none" | "authentik";
  updatedAt: string;
};
export type DesktopAccessResponse = {
  instanceId: string;
  endpointId: string;
  options: EndpointAccessOption[];
  selection: DesktopAccessSelection | null;
};
export type StorageMode = "zotero-storage" | "webdav" | "linked-folder" | "server-only" | "metadata-only";
export const storageOptions: Array<{ value: StorageMode; title: string; detail: string }> = [
  {
    value: "zotero-storage",
    title: "Zotero Storage",
    detail: "The simplest option. Zotero synchronizes references and attachments."
  },
  {
    value: "webdav",
    title: "WebDAV",
    detail: "Use a WebDAV account for personal-library attachments while Zotero syncs the references."
  },
  {
    value: "linked-folder",
    title: "Shared folder with ZotMoov",
    detail: "Keep linked PDFs in external storage shared with your other computers."
  },
  {
    value: "server-only",
    title: "References only",
    detail: "Synchronize the library database without downloading attachment files."
  }
];
export const onlineStorageOptions: Array<{ value: StorageMode; title: string; detail: string }> = [
  {
    value: "metadata-only",
    title: "Citation data only",
    detail: "Use citations, collections, tags, and notes without downloading PDFs to this server."
  },
  {
    value: "zotero-storage",
    title: "Zotero Storage files on demand",
    detail: "Let ScholarServer fetch a PDF from Zotero Storage only when a tool or workflow needs it."
  }
];

export type StorageSettings = {
  storageMode: StorageMode;
  downloadMode: string;
  groupFileSync: boolean;
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
};
