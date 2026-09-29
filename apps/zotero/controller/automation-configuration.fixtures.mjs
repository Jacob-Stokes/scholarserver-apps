import { automationConfiguration } from "./automation-configuration.mjs";

export const processingView = {
  definition: { id: "convert-zotero-pdfs" },
  configuration: {
    active: true,
    enabled: true,
    intervalMinutes: 90,
    configuration: { folder: "Papers", limit: 3, ocr: true, attachMarkdown: true },
    updatedAt: "2026-09-29T08:00:00Z",
    runs: []
  },
  readiness: { ready: true, message: "Zotero and Docling are ready" }
};

export const processingFolders = {
  path: "Papers",
  parent: "",
  folders: [{ name: "History", path: "Papers/History" }]
};

const inactive = structuredClone(processingView);
inactive.configuration.active = false;
inactive.configuration.enabled = false;
const failed = structuredClone(processingView);
failed.configuration.runs = [
  {
    id: "processing-run-fixture-0001",
    state: "failed",
    trigger: "scheduled",
    startedAt: "2026-09-29T08:01:00Z",
    finishedAt: "2026-09-29T08:02:00Z",
    error: "Docling stopped before the conversion finished.",
    summary: null
  }
];
const running = structuredClone(failed);
running.configuration.runs[0] = { ...running.configuration.runs[0], state: "running", finishedAt: null, error: null };

export const automationConfigurationFixtures = {
  "processing-inactive": automationConfiguration(inactive),
  "processing-scheduled": automationConfiguration(processingView),
  "processing-edit": automationConfiguration(
    processingView,
    { editSettings: true },
    { folderListing: processingFolders }
  ),
  "processing-history-error": automationConfiguration(failed, { showHistory: true }),
  "processing-running": automationConfiguration(running),
  "processing-unavailable": automationConfiguration({
    ...processingView,
    readiness: { ready: false, message: "Install and start Docling before running this automation" }
  }),
  "processing-online-library": automationConfiguration(null, {}, { online: true })
};
