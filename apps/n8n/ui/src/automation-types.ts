import type { Schedule } from "./InstallAutomation";
import type { ResearchBindings, ResearchKind } from "./ResearchSettings";

export type AppRequirement = {
  binding: "zotero" | "obsidian" | "docling";
  packageId: string;
  name: string;
  role: string;
  actions: string[];
};
export type Template = {
  id: string;
  name: string;
  description: string;
  schedule: Schedule | null;
  research?: ResearchKind | null;
  requirements: AppRequirement[];
  presentation: { summary: string; maturity: string; effects: string; ai: string } | null;
};
export type Receipt = {
  templateId: string;
  automationId?: string;
  name?: string;
  state: string;
  workflowId: string | null;
  operationId: string;
  researchAccess?: string;
  bindings?: ResearchBindings;
  editing?: "guided" | "customised" | "unavailable" | "unknown";
};
export type Workflow = {
  id: string;
  name: string;
  active: boolean;
  hoursInterval: number | null;
  minutesInterval?: number | null;
};
export type Inventory = {
  templates: Template[];
  installations: Record<string, Receipt>;
  workflows: Workflow[];
  moreAvailable: boolean;
};
export type Run = { id: string; status: string; startedAt: string; stoppedAt: string | null };
export type Application = { id: string; workspaceId: string; packageId: string; actions: string[] };

export function availableForRole(application: Application, requirement: AppRequirement) {
  return (
    application.packageId === requirement.packageId &&
    requirement.actions.every((action) => application.actions.includes(action))
  );
}
