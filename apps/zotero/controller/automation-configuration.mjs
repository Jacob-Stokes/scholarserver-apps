import { createHash } from "node:crypto";
import {
  assertConfigurationActionRequest,
  ConfigurationActionError,
  ConfigurationActions
} from "@scholarserver/controller-runtime/configuration-actions";
import { attachCurrentSectionWhenAvailable } from "./configuration.mjs";

const automationId = "convert-zotero-pdfs";
const target = { kind: "app" };
const settingIds = ["active", "enabled", "intervalMinutes", "folder", "limit", "ocr", "attachMarkdown"];

function savedValues(view) {
  const { active, enabled, intervalMinutes, configuration } = view.configuration;
  return { active, enabled, intervalMinutes, ...configuration, folder: configuration.folder || "/" };
}

function boundedText(value, limit = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .slice(0, limit);
}

export function automationConfiguration(view, draft = {}, { online = false, folderListing, folderError } = {}) {
  const section = {
    version: 1,
    id: "automation",
    title: "PDF processing",
    description: "Convert linked Zotero PDFs with Docling and optionally attach the Markdown to their Zotero items.",
    revision: "unavailable",
    pollAfterMs: 10_000,
    fields: [],
    values: {},
    summary: [],
    notices: [],
    actions: []
  };
  if (online) {
    section.pollAfterMs = null;
    section.description = "Linked-folder PDF processing requires the Complete Zotero workspace.";
    return section;
  }
  const saved = savedValues(view);
  const runs = view.configuration.runs;
  const running = runs.some((run) => run.state === "running");
  section.revision = createHash("sha256")
    .update(JSON.stringify([saved, view.configuration.updatedAt, runs[0]?.id, runs[0]?.state]))
    .digest("hex");
  section.summary = [
    { label: "Processing", value: saved.active ? "Active" : "Off" },
    {
      label: "Schedule",
      value: saved.active && saved.enabled ? `Every ${saved.intervalMinutes} minutes` : "Manual runs only"
    },
    { label: "Folder", value: saved.folder === "/" ? "All shared attachments" : boundedText(saved.folder) },
    { label: "PDFs per run", value: String(saved.limit) },
    { label: "OCR", value: saved.ocr ? "Enabled" : "Off" },
    { label: "Markdown attachments", value: saved.attachMarkdown ? "Enabled" : "Off" }
  ];
  if (!view.readiness.ready) section.notices.push({ kind: "warning", text: boundedText(view.readiness.message, 1000) });
  if (running)
    section.notices.push({
      kind: "info",
      text: "A processing run is in progress. Its result remains available after you leave this page."
    });
  const latest = runs[0];
  if (latest?.state === "failed") {
    section.notices.push({ kind: "error", text: boundedText(latest.error || "The last processing run failed.", 1000) });
  }
  section.fields.push({ id: "editSettings", label: "Change processing settings", type: "boolean" });
  section.values.editSettings = draft.editSettings === true;

  if (draft.editSettings === true) {
    const choices = { ...saved, ...draft };
    section.fields.push(
      {
        id: "active",
        label: "Enable PDF processing",
        type: "boolean",
        required: true,
        hint: "Turning processing off prevents new runs. A run already in progress continues."
      },
      {
        id: "enabled",
        label: "Run automatically",
        type: "boolean",
        required: true,
        hint: "Automatic runs require processing to be enabled. The schedule pauses while Docling is unavailable."
      }
    );
    if (choices.enabled === true) {
      section.fields.push({
        id: "intervalMinutes",
        label: "Minutes between runs",
        type: "number",
        min: 15,
        max: 10080,
        required: true
      });
    }
    section.fields.push({ id: "enterFolderPath", label: "Enter folder path manually", type: "boolean" });
    const folder = typeof choices.folder === "string" ? choices.folder : "/";
    const manualFolder = choices.enterFolderPath === true || folder.length > 256 || !folderListing;
    section.values.enterFolderPath = manualFolder;
    if (manualFolder) {
      section.fields.push({
        id: "folder",
        label: "Folder within shared attachments",
        type: "text",
        maxLength: 512,
        hint: "Use / for all shared attachments, or a relative folder such as Papers. Hidden folders and links outside shared storage are not allowed."
      });
    } else {
      const options = new Map([
        [folder, { value: folder, label: folder === "/" ? "All shared attachments" : boundedText(folder, 120) }]
      ]);
      if (folderListing.parent !== null) {
        const parent = folderListing.parent || "/";
        options.set(parent, { value: parent, label: "Go to parent folder" });
      }
      for (const child of folderListing.folders) {
        if (child.path.length > 256 || options.size >= 64) continue;
        options.set(child.path, { value: child.path, label: boundedText(child.name, 120) });
      }
      section.fields.push({
        id: "folder",
        label: "Folder within shared attachments",
        type: "select",
        required: true,
        options: [...options.values()],
        hint: "Choose a subfolder to browse it. Saving applies the folder currently selected."
      });
      if (folderListing.folders.some((child) => !options.has(child.path))) {
        section.notices.push({
          kind: "info",
          text: "Some folders cannot fit in this list. Enter their relative path manually."
        });
      }
    }
    if (folderError) section.notices.push({ kind: "warning", text: boundedText(folderError, 1000) });
    section.fields.push(
      { id: "limit", label: "PDFs per run", type: "number", min: 1, max: 100, required: true },
      {
        id: "ocr",
        label: "Use OCR",
        type: "boolean",
        required: true,
        hint: "Use for scanned PDFs; OCR requires more processing power."
      },
      {
        id: "attachMarkdown",
        label: "Attach Markdown to Zotero",
        type: "boolean",
        required: true,
        hint: "Add each converted document beside its source PDF in the Zotero item."
      }
    );
    for (const id of settingIds) {
      if (section.fields.some((field) => field.id === id)) section.values[id] = choices[id];
    }
    section.actions.push({
      id: "save-automation",
      label: "Save processing settings",
      kind: "submit",
      target,
      fieldIds: ["editSettings", ...settingIds.filter((id) => section.fields.some((field) => field.id === id))]
    });
  }

  section.fields.push({ id: "showHistory", label: "Show recent runs", type: "boolean" });
  section.values.showHistory = draft.showHistory === true;
  if (draft.showHistory === true) {
    if (runs.length === 0) section.summary.push({ label: "Recent runs", value: "No runs yet" });
    else {
      const selected = runs.find((run) => run.id === draft.runId) ?? runs[0];
      section.fields.push({
        id: "runId",
        label: "Processing run",
        type: "select",
        options: runs
          .slice(0, 50)
          .map((run) => ({ value: run.id, label: boundedText(`${run.startedAt} · ${run.state}`, 120) }))
      });
      section.values.runId = selected.id;
      section.summary.push(
        { label: "Run result", value: boundedText(selected.state) },
        { label: "Started", value: boundedText(selected.startedAt) },
        { label: "Finished", value: boundedText(selected.finishedAt || "In progress") },
        { label: "Trigger", value: selected.trigger === "scheduled" ? "Scheduled" : "Manual" }
      );
      if (selected.summary)
        section.summary.push({
          label: "Files",
          value: boundedText(
            Object.entries(selected.summary)
              .map(([key, value]) => `${key}: ${value}`)
              .join(" · ")
          )
        });
      if (selected.error && selected.id !== latest?.id)
        section.notices.push({ kind: "error", text: boundedText(selected.error, 1000) });
    }
  }
  let reason;
  if (!saved.active) reason = "Enable PDF processing before running it.";
  else if (running) reason = "Wait for the current run to finish.";
  else if (!view.readiness.ready) reason = "Resolve the processing warning before starting a run.";
  else if (draft.editSettings === true) reason = "Save or close the settings before starting a run.";
  section.actions.push({
    id: "run-automation",
    label: "Run now",
    kind: "submit",
    target,
    fieldIds: [],
    ...(reason ? { disabled: true, reason } : {}),
    confirmation: {
      title: "Process Zotero PDFs?",
      text: "Run with the saved folder and settings. Processing may create converted files and attach them to Zotero items."
    }
  });
  return section;
}

function automationUpdate(values, view) {
  const saved = savedValues(view);
  const selected = { ...saved, ...values };
  const folder = selected.folder === "/" ? "" : selected.folder;
  if (!Number.isInteger(selected.intervalMinutes) || !Number.isInteger(selected.limit))
    throw new ConfigurationActionError(400, "Choose whole numbers for the interval and PDF limit.");
  if (
    typeof folder !== "string" ||
    folder.length > 512 ||
    /[\\\0\r\n]/.test(folder) ||
    folder.split("/").some((part) => part.startsWith(".") || (!part && folder !== ""))
  )
    throw new ConfigurationActionError(400, "Choose a relative folder inside shared attachments.");
  return {
    active: selected.active,
    enabled: selected.active && selected.enabled,
    intervalMinutes: selected.intervalMinutes,
    configuration: { folder, limit: selected.limit, ocr: selected.ocr, attachMarkdown: selected.attachMarkdown }
  };
}

export function createAutomationConfiguration({ directory, baseUrl, online = false, fetcher = fetch }) {
  const actions = new ConfigurationActions(directory, "automation");
  async function request(suffix, init = {}) {
    const response = await fetcher(`${baseUrl}${suffix}`, { ...init, signal: AbortSignal.timeout(15_000) });
    const value = await response.json();
    if (!response.ok)
      throw new ConfigurationActionError(
        response.status,
        boundedText(value.error || "PDF processing is unavailable.", 1000)
      );
    return value;
  }
  async function readView() {
    const result = await request("/automations");
    const view = result.automations?.find((item) => item.definition.id === automationId);
    if (!view) throw new ConfigurationActionError(503, "PDF processing is unavailable.");
    return view;
  }
  async function describe(view, draft = {}) {
    if (online) return automationConfiguration(null, draft, { online });
    let folderListing;
    let folderError;
    if (draft.editSettings === true && draft.enterFolderPath !== true) {
      const folder = typeof draft.folder === "string" ? draft.folder : view.configuration.configuration.folder;
      try {
        folderListing = await request(`/folders?path=${encodeURIComponent(folder === "/" ? "" : folder)}`);
      } catch {
        folderError = "Could not list this folder. Check its relative path and shared-folder access before saving.";
      }
    }
    return automationConfiguration(view, draft, { folderListing, folderError });
  }
  async function section(draft = {}) {
    return describe(online ? null : await readView(), draft);
  }
  async function run(actionId, wireInput) {
    const input = assertConfigurationActionRequest(wireInput, actionId, "automation");
    let receipt;
    let preparedView;
    try {
      receipt = await actions.run(
        input,
        async () => {
          preparedView = online ? null : await readView();
          return describe(preparedView, input.values);
        },
        async (values) => {
          const route = `/automations/${automationId}`;
          if (actionId === "run-automation")
            await request(`${route}/runs`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: "{}"
            });
          else
            await request(route, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(values)
            });
        },
        (values) => (actionId === "save-automation" ? automationUpdate(values, preparedView) : values)
      );
    } catch (error) {
      if (error instanceof ConfigurationActionError && !(await actions.read(input.requestId)))
        return { requestId: input.requestId, actionId, status: "rejected-before-change" };
      throw error;
    }
    return attachCurrentSectionWhenAvailable(receipt, section);
  }
  return { section, run, read: (requestId) => actions.read(requestId) };
}
