import assert from "node:assert/strict";
import test from "node:test";
import { managerConfigurationSection } from "./manager-configuration.mjs";

function setup(status) {
  return { status: async () => status };
}

const installations = {
  read: async () => ({
    installations: {
      first: { state: "installed" },
      second: { state: "unconfirmed" }
    }
  })
};

test("new n8n owner section confirms password locally but sends only declared setup fields", async () => {
  const section = await managerConfigurationSection(
    "connection",
    setup({ connected: false, phase: "password-required", ownerEmail: "owner@scholarserver.invalid" }),
    installations
  );
  assert.equal(section.version, 1);
  assert.equal(section.actions[0].target.kind, "instance-action");
  assert.deepEqual(section.actions[0].fieldIds, ["password"]);
  assert.equal(section.fields.find((field) => field.id === "confirmPassword").confirmField, "password");
  assert.equal(section.values.password, undefined);
});

test("existing n8n owner section offers email, password and optional MFA without echoing secrets", async () => {
  const section = await managerConfigurationSection(
    "connection",
    setup({ connected: false, phase: "existing-account" }),
    installations
  );
  assert.deepEqual(section.actions[0].fieldIds, ["email", "password", "mfaCode"]);
  assert.equal(section.fields.find((field) => field.id === "mfaCode").required, false);
  assert.deepEqual(section.values, {});
});

test("recovery blocks setup and settings summarize installed and unresolved automations", async () => {
  const recovering = await managerConfigurationSection(
    "connection",
    setup({ connected: false, phase: "recovery-required" }),
    installations
  );
  assert.deepEqual(recovering.actions, []);
  assert.equal(recovering.notices[0].kind, "error");
  const settings = await managerConfigurationSection(
    "settings",
    setup({ connected: true, phase: "ready" }),
    installations
  );
  assert.deepEqual(
    settings.summary.map((item) => item.value),
    ["Ready", "1", "1"]
  );
  assert.equal(settings.instructions[0].link, undefined);
});
