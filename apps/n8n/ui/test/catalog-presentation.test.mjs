import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/AutomationCatalog.tsx", import.meta.url), "utf8");
const install = await readFile(new URL("../src/InstallAutomation.tsx", import.meta.url), "utf8");
const research = await readFile(new URL("../src/ResearchSettings.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/automations.css", import.meta.url), "utf8");

test("embedded catalog uses a borderless selected form and leaves the template title to Manager", () => {
  assert.match(source, /embedded\s*=\s*false/);
  assert.match(source, /automation-setup-form-embedded ss-stack/);
  assert.match(source, /!embedded \? <h2>\{selected\.template\.name\}<\/h2> : null/);
  assert.match(
    source,
    /embedded\s*\? "automation-setup-form automation-setup-form-embedded ss-stack"\s*: "automation-setup-form ss-card ss-stack"/
  );
});

test("setup pairs research selectors using intrinsic width and keeps the folder full width", () => {
  const group = research.match(/<div className="automation-field-grid">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(group);
  assert.equal((group.match(/<select/g) ?? []).length, 2);
  assert.doesNotMatch(group, /folderLabel/);
  assert.match(styles, /\.automation-install-form\s*\{[^}]*container-type: inline-size/s);
  assert.match(styles, /\.automation-field-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/s);
  assert.match(
    styles,
    /@container \(min-width: 36rem\)\s*\{\s*\.automation-field-grid\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s
  );
  const submitRules = styles.match(/\.automation-submit\s*\{([^}]*)\}/g) ?? [];
  assert.ok(submitRules.length > 0);
  for (const rule of submitRules) assert.doesNotMatch(rule, /position:|overflow:|max-height:/);
});

test("blank names explain the disabled primary action without locking editable research fields", () => {
  assert.match(source, /busy=\{busy\}\s*disabledReason=\{!name\.trim\(\) \? "Enter an automation name\." : null\}/);
  assert.match(install, /if \(valid && !busy && !disabledReason\)/);
  assert.match(install, /disabled=\{busy \|\| !valid \|\| Boolean\(disabledReason\)\}/);
  assert.match(install, /aria-describedby=\{unavailableReason \? feedbackId : undefined\}/);
  assert.match(install, /<p id=\{feedbackId\} role="status">/);
  assert.match(install, /retry \? "Retry installation" : "Add automation"/);
  assert.match(install, /Wait for the current request to finish/);
  assert.match(install, /Choose compatible research apps and enter a valid folder/);
});

test("schedule presentation preserves units, whole-number limits and disabled installation guidance", () => {
  assert.match(install, /minutes \? "Check every \(minutes\)" : "Run every \(hours\)"/);
  assert.match(install, /Number\.isInteger\(value\) && value >= schedule.minimum && value <= schedule.maximum/);
  assert.match(install, /min=\{schedule.minimum\}\s*max=\{schedule.maximum\}\s*step="1"/);
  assert.match(
    install,
    /if \(schedule && minutes\) settings.minutesInterval = value;\s*else if \(schedule\) settings.hoursInterval = value;/
  );
  assert.match(install, /aria-describedby=\{!validSchedule \? scheduleErrorId : undefined\}/);
  assert.match(
    install,
    /!validSchedule \? \(\s*<p className="automation-field-hint" id=\{scheduleErrorId\} role="status">/
  );
  assert.match(install, /Enter a whole number from \{schedule.minimum\} to \{schedule.maximum\}/);
  assert.doesNotMatch(install, /Every \{schedule.minimum\}|not a daily start time|not a time of day|scheduleHintId/);
  assert.match(install, /added with its schedule disabled\. Review it before enabling it/);
  assert.match(install, /previous request was rejected\. Retry sends a new installation request/);
});

test("folder and availability guidance stays visible with existing permission and privacy boundaries", () => {
  assert.match(research, /aria-invalid=\{!validFolder\}/);
  assert.match(research, /<p id=\{folderErrorId\} role="status">/);
  assert.match(research, /if \(!validFolder\) \{\s*if \(!folder\) \{\s*folderError = "Enter a folder\."/);
  assert.match(research, /Use at most 200 characters, including the report subfolder/);
  assert.match(research, /No empty names, names starting with a dot, backslashes or control characters/);
  assert.match(research, /resultingFolder.length <= 200/);
  assert.match(research, /app.workspaceId === selectedSource\?\.workspaceId/);
  assert.match(research, /setSource\(event.target.value\);\s*setTarget\(""\)/);
  assert.match(research, /loading \? <p role="status">Checking available research apps/);
  assert.match(research, /!loading && !error && sources.length === 0/);
  assert.match(research, /error \? <p role="alert">\{error\}<\/p>/);
  assert.match(
    research,
    /Allows reading recent Zotero metadata and creating notes only in this folder\. Existing notes are not replaced/
  );
  assert.match(
    research,
    /Use the same relative folder in Zotero's linked attachments and Docling's Research documents\. Existing conversion results are reused/
  );
  assert.match(research, /fixed “\{reportSubfolder\}” subfolder\. Existing reports are/);
  assert.match(research, /Check installation, running state, package/);
});
