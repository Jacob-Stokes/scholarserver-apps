import { type FolderListing, FolderPicker } from "@scholarserver/ui/folder-picker";
import { useEffect, useId, useState } from "react";
import { type AppRequirement, availableForRole } from "./automation-types";

export type ResearchKind =
  | "reading-notes"
  | "research-digest"
  | "convert-pdfs"
  | "weekly-roundup"
  | "reference-audit"
  | "bibliography";
export type ResearchBindings = {
  workspaceId: string;
  zotero: string;
  obsidian?: string;
  docling?: string;
  folder: string;
};
type Application = { id: string; workspaceId: string; packageId: string; actions: string[] };
export type ResearchAvailability =
  | "loading"
  | "error"
  | "missing-source"
  | "missing-target"
  | "invalid-folder"
  | "ready";

const reportSubfolders: Partial<Record<ResearchKind, string>> = {
  "weekly-roundup": "Weekly roundups",
  "reference-audit": "Reference checks",
  bibliography: "Bibliographies"
};

export function reportSubfolderFor(kind: ResearchKind) {
  return reportSubfolders[kind] ?? null;
}

function defaultFolderFor(kind: ResearchKind) {
  if (kind === "convert-pdfs") return "";
  if (reportSubfolderFor(kind)) return "Research";
  return "Research/Reading";
}

export function ResearchSettings({
  kind,
  requirements,
  busy,
  onChange,
  onAvailabilityChange
}: {
  kind: ResearchKind;
  requirements: AppRequirement[];
  busy: boolean;
  onChange: (bindings: ResearchBindings | null) => void;
  onAvailabilityChange?: (availability: ResearchAvailability) => void;
}) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [discoveryAttempt, setDiscoveryAttempt] = useState(0);
  const folderHintId = useId();
  const folderErrorId = useId();
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [folder, setFolder] = useState(() => defaultFolderFor(kind));
  const destination = kind === "convert-pdfs" ? "docling" : "obsidian";
  const reportSubfolder = reportSubfolderFor(kind);
  const sourceRole = requirements.find((requirement) => requirement.binding === "zotero");
  const targetRole = requirements.find((requirement) => requirement.binding === destination);
  const sources = applications.filter((app) => sourceRole && availableForRole(app, sourceRole));
  const selectedSource = sources.find((app) => `${app.workspaceId}/${app.id}` === source);
  const targets = applications.filter(
    (app) => targetRole && availableForRole(app, targetRole) && app.workspaceId === selectedSource?.workspaceId
  );
  const selectedTarget = targets.find((app) => app.id === target);
  const canBrowse = destination === "docling" && selectedTarget?.actions.includes("browse-folders") === true;

  useEffect(() => {
    const controller = new AbortController();
    const base = window.location.pathname.match(/^(.*\/apps\/[^/]+)/)?.[1] ?? "";
    setLoading(true);
    setError(null);
    void fetch(`${base}/api/research-applications`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          if (result?.code === "research_connection_required") {
            throw new Error("Allow research app access in n8n Configuration before choosing apps.");
          }
          throw new Error("Could not check research applications. Retry app discovery.");
        }
        if (!Array.isArray(result))
          throw new Error("Research app discovery returned an invalid response. Retry app discovery.");
        setApplications(result);
      })
      .catch((caught) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error ? caught.message : "Could not check research applications. Retry app discovery."
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [discoveryAttempt]);

  const resultingFolder = reportSubfolder ? `${folder}/${reportSubfolder}` : folder;
  const validFolder =
    folder.length > 0 &&
    resultingFolder.length <= 200 &&
    folder.split("/").every((part) => part && !part.startsWith(".") && !/[\\\x00-\x1f]/.test(part));
  let availability: ResearchAvailability = "ready";
  if (loading) availability = "loading";
  else if (error) availability = "error";
  else if (sources.length === 0 || !selectedSource) availability = "missing-source";
  else if (targets.length === 0 || !selectedTarget) availability = "missing-target";
  else if (!validFolder) availability = "invalid-folder";
  useEffect(() => {
    if (loading || error || !selectedSource || !selectedTarget || !validFolder) {
      onChange(null);
      return;
    }
    onChange({
      workspaceId: selectedSource.workspaceId,
      zotero: selectedSource.id,
      [destination]: selectedTarget.id,
      folder
    });
  }, [error, loading, selectedSource, selectedTarget, folder, destination, onChange, validFolder]);
  useEffect(() => onAvailabilityChange?.(availability), [availability, onAvailabilityChange]);

  async function browse(folderPath: string): Promise<FolderListing> {
    if (!selectedSource || !selectedTarget) throw new Error("Choose compatible research apps before browsing folders.");
    if (!canBrowse) throw new Error("Folder browsing is unavailable for the selected research app.");
    const base = window.location.pathname.match(/^(.*\/apps\/[^/]+)/)?.[1] ?? "";
    const params = new URLSearchParams({
      workspaceId: selectedSource.workspaceId,
      zotero: selectedSource.id,
      docling: selectedTarget.id,
      folder: folderPath
    });
    const response = await fetch(`${base}/api/research-folders?${params.toString()}`, {
      headers: { "x-requested-with": "ScholarServer" }
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error("Could not browse the shared research folder.");
    if (
      !result ||
      typeof result.path !== "string" ||
      (result.parent !== null && typeof result.parent !== "string") ||
      !Array.isArray(result.folders) ||
      result.folders.some(
        (entry: unknown) =>
          !entry ||
          typeof entry !== "object" ||
          typeof (entry as { name?: unknown }).name !== "string" ||
          typeof (entry as { path?: unknown }).path !== "string"
      )
    ) {
      throw new Error("Folder browsing returned an invalid listing.");
    }
    return result as FolderListing;
  }

  let folderLabel = "Notes folder";
  if (reportSubfolder) {
    folderLabel = "Report root folder";
  } else if (destination === "docling") {
    folderLabel = "Shared PDF folder";
  }
  let folderError: string | null = null;
  if (!validFolder) {
    if (!folder) {
      folderError = "Enter a folder.";
    } else if (resultingFolder.length > 200) {
      folderError = "Use at most 200 characters.";
      if (reportSubfolder) folderError = "Use at most 200 characters, including the report subfolder.";
    } else {
      folderError =
        "Use / between folder names. No empty names, names starting with a dot, backslashes or control characters.";
    }
  }

  return (
    <fieldset className="research-bindings automation-setup-group ss-stack" disabled={busy}>
      <legend>Research apps</legend>
      {loading ? <p role="status">Checking available research apps…</p> : null}
      {error ? (
        <div>
          <p role="alert">{error}</p>
          <button
            type="button"
            className="ss-button ss-button-secondary"
            disabled={busy}
            onClick={() => setDiscoveryAttempt((attempt) => attempt + 1)}
          >
            Retry app discovery
          </button>
        </div>
      ) : null}
      <div className="automation-field-grid">
        <label>
          Zotero library
          <select
            className="ss-input"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setTarget("");
            }}
          >
            <option value="">Choose Zotero</option>
            {sources.map((app) => (
              <option key={`${app.workspaceId}/${app.id}`} value={`${app.workspaceId}/${app.id}`}>
                {app.id} ({app.workspaceId})
              </option>
            ))}
          </select>
        </label>
        <label>
          {destination === "docling" ? "Docling installation" : "Obsidian vault"}
          <select className="ss-input" value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="">Choose {destination === "docling" ? "Docling" : "Obsidian"}</option>
            {targets.map((app) => (
              <option key={app.id} value={app.id}>
                {app.id}
              </option>
            ))}
          </select>
        </label>
      </div>
      {destination === "docling" && canBrowse ? (
        <>
          <FolderPicker
            label={folderLabel}
            help="Browse Docling’s Research documents. Zotero must use the same storage location."
            value={folder}
            disabled={busy || loading || Boolean(error) || !selectedSource || !selectedTarget || !canBrowse}
            onChange={setFolder}
            browse={browse}
          />
        </>
      ) : (
        <label>
          {folderLabel}
          <input
            className="ss-input"
            value={folder}
            maxLength={200}
            onChange={(event) => setFolder(event.target.value)}
            placeholder={destination === "docling" ? "Papers" : "Research/Reading"}
            required
            aria-invalid={!validFolder}
            aria-describedby={`${folderHintId}${!validFolder ? ` ${folderErrorId}` : ""}`}
          />
        </label>
      )}
      {destination === "docling" && selectedTarget && !canBrowse ? (
        <p role="status">
          Folder browsing is unavailable for this installation. Select the folder path manually; browsing currently
          requires Docling&apos;s <code>browse-folders</code> action.
        </p>
      ) : null}
      {!validFolder ? (
        <p id={folderErrorId} role="status">
          {folderError}
        </p>
      ) : null}
      {reportSubfolder ? (
        <p id={folderHintId}>
          Reports are written under the selected root in the fixed “{reportSubfolder}” subfolder. Existing reports are
          not replaced.
        </p>
      ) : (
        <p id={folderHintId}>
          {destination === "docling"
            ? "Use the same relative folder in Zotero's linked attachments and Docling's Research documents. Existing conversion results are reused."
            : "Allows reading recent Zotero metadata and creating notes only in this folder. Existing notes are not replaced."}
        </p>
      )}
      {!loading && !error && sources.length === 0 ? (
        <p>
          Zotero is not available to this platform with the required actions. Check installation, running state, package
          version and access.
        </p>
      ) : null}
      {selectedSource && targets.length === 0 ? (
        <p>
          No compatible {destination === "docling" ? "Docling" : "Obsidian"} is available to this platform in the
          selected workspace.
        </p>
      ) : null}
    </fieldset>
  );
}
