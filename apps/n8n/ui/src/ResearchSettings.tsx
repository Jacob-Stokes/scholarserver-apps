import { useEffect, useState } from "react";
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
  onChange
}: {
  kind: ResearchKind;
  requirements: AppRequirement[];
  busy: boolean;
  onChange: (bindings: ResearchBindings | null) => void;
}) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    const controller = new AbortController();
    const base = window.location.pathname.match(/^(.*\/apps\/[^/]+)/)?.[1] ?? "";
    void fetch(`${base}/api/research-applications`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not check research applications. Refresh this page to retry.");
        setApplications(await response.json());
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught.message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const resultingFolder = reportSubfolder ? `${folder}/${reportSubfolder}` : folder;
    const validFolder =
      folder.length > 0 &&
      resultingFolder.length <= 200 &&
      folder.split("/").every((part) => part && !part.startsWith(".") && !/[\\\x00-\x1f]/.test(part));
    if (!selectedSource || !selectedTarget || !validFolder) {
      onChange(null);
      return;
    }
    onChange({
      workspaceId: selectedSource.workspaceId,
      zotero: selectedSource.id,
      [destination]: selectedTarget.id,
      folder
    });
  }, [selectedSource, selectedTarget, folder, destination, onChange, reportSubfolder]);

  let folderLabel = "Notes folder";
  let folderPlaceholder = "Research/Reading";
  if (reportSubfolder) {
    folderLabel = "Report root folder";
    folderPlaceholder = "Research";
  } else if (destination === "docling") {
    folderLabel = "Shared PDF folder";
    folderPlaceholder = "Papers";
  }

  return (
    <fieldset className="ss-stack" disabled={busy}>
      <legend>Connect research apps</legend>
      {error ? <p role="alert">{error}</p> : null}
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
      <label>
        {folderLabel}
        <input
          className="ss-input"
          value={folder}
          maxLength={200}
          onChange={(event) => setFolder(event.target.value)}
          placeholder={folderPlaceholder}
          required
        />
      </label>
      {reportSubfolder ? (
        <p>
          Reports are written under the selected root in the fixed “{reportSubfolder}” subfolder. Existing reports are
          not replaced.
        </p>
      ) : (
        <p>
          {destination === "docling"
            ? "Use the same relative folder in Zotero's linked attachments and Docling's Research documents. Existing conversion results are reused."
            : "Allows reading recent Zotero metadata and creating notes only in this folder. Existing notes are not replaced."}
        </p>
      )}
      {!error && sources.length === 0 ? (
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
