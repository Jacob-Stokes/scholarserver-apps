// Paired-source contract fixtures only: no server, executor or real app is contacted.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { configurationFixtureCases as freshRssCases } from "../apps/freshrss/integration/configuration-fixtures.mjs";
import { logseqConfigurationFixtures } from "../apps/logseq/helper/configuration.fixtures.mjs";
import { configurationFixtureCases as n8nCases } from "../apps/n8n/integration/manager-configuration-fixtures.mjs";
import { obsidianConfigurationFixtures } from "../apps/obsidian/sync/configuration.fixtures.mjs";
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
    { application: "docling", cases: JSON.parse(stdout) },
    { application: "freshrss", cases: await freshRssCases() },
    { application: "n8n", cases: await n8nCases() },
    { application: "obsidian", cases: namedStages(obsidianConfigurationFixtures) },
    { application: "logseq", cases: namedStages(logseqConfigurationFixtures) },
    { application: "zotero", cases: namedStages(zoteroConfigurationFixtures) }
  ])
);
