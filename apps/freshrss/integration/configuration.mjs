import { createHash } from "node:crypto";
import { ConfigurationActionError } from "@scholarserver/controller-runtime/configuration-actions";

const styles = new Set(["original", "scholarserver"]);

function revisionOf(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

export async function configurationSection(setup, sectionId) {
  if (sectionId !== "account" && sectionId !== "appearance")
    throw new ConfigurationActionError(404, "Configuration section not found.");
  const status = await setup.status({ prunePassword: false });
  const appearance = await setup.appearance();
  const linked = status.signIn === "scholarserver";
  const ready = status.ready && linked;
  const revision = revisionOf({ username: status.username, signIn: status.signIn, appearance: appearance.style });
  const base = {
    version: 1,
    id: sectionId,
    revision,
    pollAfterMs: 10_000,
    notices: [],
    values: {},
    summary: [],
    fields: [],
    actions: []
  };
  if (sectionId === "account") {
    return {
      ...base,
      title: "Your sign-in",
      description: ready
        ? "Your reader uses your ScholarServer sign-in."
        : "Link this reader to your ScholarServer sign-in before opening it.",
      stage: {
        id: ready ? "ready" : "account",
        label: ready ? "Ready" : "Your sign-in",
        index: ready ? 2 : 1,
        total: 2
      },
      notices:
        status.phase === "preparing"
          ? [{ kind: "info", text: "Your reader is being prepared. Check status before continuing." }]
          : [],
      summary: [
        { label: "Reader account", value: status.username ?? "Not created" },
        { label: "Sign-in", value: linked ? "ScholarServer" : "Not linked" },
        { label: "Reader", value: status.ready ? "Ready" : "Setup needed" }
      ],
      endpointIds: ["reader"],
      instructions: ready
        ? []
        : [
            {
              title: "Enable dashboard sign-in first",
              text: "Enable dashboard sign-in in Access settings, then link this reading list. Existing feeds and saved articles remain in FreshRSS."
            }
          ],
      actions: ready
        ? []
        : [
            {
              id: "link-sign-in",
              label: "Use ScholarServer sign-in",
              kind: "submit",
              target: { kind: "instance-action", actionId: "link-sign-in" },
              fieldIds: [],
              ...(status.phase === "preparing" ? { disabled: true, reason: "Wait for reader setup to finish." } : {})
            }
          ]
    };
  }
  return {
    ...base,
    title: "Reader appearance",
    description:
      "Choose ScholarServer’s colours and branding or keep FreshRSS’s own look. Reload the reader after saving.",
    stage: { id: "appearance", label: "Reader appearance", index: 2, total: 2 },
    fields: [
      {
        id: "style",
        label: "Appearance",
        type: "select",
        required: true,
        disabled: !ready,
        options: [
          { value: "original", label: "FreshRSS original" },
          { value: "scholarserver", label: "Match ScholarServer" }
        ]
      }
    ],
    values: { style: appearance.style },
    summary: [
      {
        label: "Current appearance",
        value: appearance.style === "scholarserver" ? "Match ScholarServer" : "FreshRSS original"
      }
    ],
    actions: [
      {
        id: "save-appearance",
        label: "Save appearance",
        kind: "submit",
        target: { kind: "app" },
        fieldIds: ["style"],
        ...(!ready ? { disabled: true, reason: "Finish reader sign-in first." } : {})
      }
    ]
  };
}

export function validateAppearanceValues(values) {
  if (
    !values ||
    Array.isArray(values) ||
    typeof values !== "object" ||
    Object.keys(values).length !== 1 ||
    !styles.has(values.style)
  )
    throw new ConfigurationActionError(400, "Choose a supported reader appearance.");
  return { style: values.style };
}
