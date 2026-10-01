// Paired-source contract fixtures only: no server, executor or real app is contacted.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { configurationFixtureCases as freshRssCases } from "../apps/freshrss/integration/configuration-fixtures.mjs";
import { logseqConfigurationFixtures } from "../apps/logseq/helper/configuration.fixtures.mjs";
import { configurationFixtureCases as n8nCases } from "../apps/n8n/integration/manager-configuration-fixtures.mjs";
import { obsidianWorkspaceFixtures } from "../apps/obsidian/sync/configuration.fixtures.mjs";
import { automationConfigurationFixtures } from "../apps/zotero/controller/automation-configuration.fixtures.mjs";
import { zoteroConfigurationFixtures } from "../apps/zotero/controller/configuration.fixtures.mjs";

const run = promisify(execFile);
const doclingFixture = fileURLToPath(new URL("../apps/docling/controller/configuration_fixtures.py", import.meta.url));
const { stdout } = await run(process.env.PYTHON ?? "python3", [doclingFixture], {
  timeout: 15_000,
  maxBuffer: 1024 * 1024
});

function namedStages(sections) {
  return Object.fromEntries(
    sections.map((section, index) => [`${index + 1}-${section.stage?.id ?? section.id}`, section])
  );
}

console.log(
  JSON.stringify([
    {
      application: "docling",
      cases: JSON.parse(stdout),
      pages: { "complete-page": ["docling-defaults", "docling-queue", "docling-service"] }
    },
    {
      application: "freshrss",
      cases: await freshRssCases(),
      pages: {
        "complete-ready": ["freshrss-linked", "freshrss-appearance"],
        "complete-worker-error": ["freshrss-worker-error", "freshrss-appearance-unavailable"]
      }
    },
    {
      application: "n8n",
      cases: await n8nCases(),
      pages: {
        "complete-first-setup": ["n8n-new-owner", "n8n-settings-first-setup"],
        "complete-ready": ["n8n-ready", "n8n-settings"],
        "complete-recovery": ["n8n-recovery", "n8n-settings-recovery"]
      }
    },
    {
      application: "obsidian",
      cases: obsidianWorkspaceFixtures,
      pages: { "complete-list": ["workspace-list"] }
    },
    { application: "logseq", cases: namedStages(logseqConfigurationFixtures) },
    {
      application: "zotero",
      cases: { ...namedStages(zoteroConfigurationFixtures), ...automationConfigurationFixtures },
      pages: {
        "complete-desktop-setup": ["4-account", "processing-unused"],
        "complete-previous-processing": ["9-setup", "processing-inactive"],
        "complete-desktop-ready": ["9-setup", "processing-scheduled"],
        "complete-processing-edit": ["9-setup", "processing-edit"],
        "complete-online-library": ["3-setup", "processing-online-library"],
        "complete-processing-error": ["9-setup", "processing-history-error"]
      }
    }
  ])
);
