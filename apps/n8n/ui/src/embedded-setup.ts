import type { Receipt, Template } from "./automation-types";

export type EmbeddedSetup = {
  enabled: boolean;
  templateId: string | null;
  automationId: string | null;
};

export type EmbeddedSetupResolution =
  | { kind: "engine" }
  | { kind: "invalid"; message: string }
  | { kind: "new"; template: Template }
  | { kind: "retry"; template: Template; receipt: Receipt };

export function parseEmbeddedSetup(search: string): EmbeddedSetup {
  const parameters = new URLSearchParams(search);
  const enabled = parameters.get("managerSetup") === "1";
  const templateId = parameters.get("templateId")?.trim() || null;
  const automationId = parameters.get("automationId")?.trim() || null;
  return { enabled, templateId, automationId };
}

export function resolveEmbeddedSetup(
  setup: EmbeddedSetup,
  templates: Template[],
  installations: Record<string, Receipt>
): EmbeddedSetupResolution {
  if (!setup.templateId) {
    return setup.automationId
      ? { kind: "invalid", message: "Manager did not provide the template for this automation." }
      : { kind: "engine" };
  }
  const template = templates.find((candidate) => candidate.id === setup.templateId);
  if (!template) return { kind: "invalid", message: "This automation template is no longer available." };
  if (!setup.automationId) return { kind: "new", template };
  const receipt = installations[setup.automationId];
  if (!receipt) return { kind: "invalid", message: "This automation could not be found." };
  if (receipt.templateId !== setup.templateId) {
    return { kind: "invalid", message: "The automation and template do not match." };
  }
  if (receipt.state !== "rejected") {
    return { kind: "invalid", message: `This automation already has status “${receipt.state}”.` };
  }
  return { kind: "retry", template, receipt };
}
