import { randomUUID } from "node:crypto";
import {
  configureWorkflow,
  scheduleConfiguration,
  workflowScheduleHours,
  workflowScheduleMinutes
} from "./configuration.mjs";
import { workflowFingerprint } from "./templates.mjs";

export class ScheduleRequestError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}

export function scheduleEditIsPending(edit) {
  return edit?.state === "updating" || edit?.state === "unconfirmed";
}

function editableWorkflow(workflow) {
  const editable = {
    name: workflow.name,
    description: workflow.description,
    nodes: structuredClone(workflow.nodes),
    connections: structuredClone(workflow.connections),
    settings: structuredClone(workflow.settings ?? {}),
    nodeGroups: structuredClone(workflow.nodeGroups),
    staticData: structuredClone(workflow.staticData),
    pinData: structuredClone(workflow.pinData)
  };
  return Object.fromEntries(Object.entries(editable).filter(([, value]) => value !== undefined));
}

function scheduleDetails(template, workflow) {
  const configured = scheduleConfiguration(template);
  if (!configured) throw new ScheduleRequestError("This automation has no editable schedule", 404);
  if (configured.minutesInterval !== undefined) {
    return {
      unit: "minutes",
      label: "Run every",
      min: configured.minimum,
      max: configured.maximum,
      savedValue: workflowScheduleMinutes(template, workflow)
    };
  }
  return {
    unit: "hours",
    label: "Run every",
    min: configured.minimum,
    max: configured.maximum,
    savedValue: workflowScheduleHours(template, workflow)
  };
}

function projectedEdit(automationId, edit, workflow) {
  if (edit.state === "updated") {
    return {
      automationId,
      state: "updated",
      savedValue: edit.requestedValue,
      version: workflow.versionId,
      allowedActions: ["edit-schedule"]
    };
  }
  const allowedActions = edit.state === "rejected" ? ["edit-schedule"] : [];
  return { automationId, state: edit.state, allowedActions };
}

export class ScheduleManagement {
  constructor({ installations, templates, requiredClient }) {
    this.installations = installations;
    this.templates = templates;
    this.requiredClient = requiredClient;
  }

  async context(automationId) {
    if (typeof automationId !== "string" || !automationId) {
      throw new ScheduleRequestError("Choose an installed automation", 400);
    }
    const state = await this.installations.read();
    const receipt = state.installations[automationId];
    if (receipt?.state !== "installed" || typeof receipt.workflowId !== "string") {
      throw new ScheduleRequestError("Automation is not installed", 404);
    }
    const template = this.templates.find((candidate) => candidate.id === receipt.templateId);
    if (!template) throw new ScheduleRequestError("This automation has no editable schedule", 404);
    const client = await this.requiredClient();
    const workflow = await client.getWorkflow(receipt.workflowId);
    return { state, receipt, template, client, workflow };
  }

  async reconcilePending(context) {
    const { state, receipt, workflow } = context;
    const edit = receipt.scheduleEdit;
    if (!scheduleEditIsPending(edit)) return;
    const currentFingerprint = workflowFingerprint(workflow);
    if (currentFingerprint === edit.requestedFingerprint) {
      receipt.fingerprint = currentFingerprint;
      edit.state = "updated";
      edit.version = workflow.versionId;
      await this.installations.save(state);
      return;
    }
    if (edit.state === "updating") {
      edit.state = "unconfirmed";
      await this.installations.save(state);
    }
  }

  read(automationId) {
    return this.installations.serialise(async () => {
      const context = await this.context(automationId);
      await this.reconcilePending(context);
      return this.projectRead(automationId, context);
    });
  }

  projectRead(automationId, { receipt, template, workflow }) {
    const details = scheduleDetails(template, workflow);
    let canEdit = true;
    let reason;
    const editState = receipt.scheduleEdit?.state ?? "none";
    const pending = scheduleEditIsPending(receipt.scheduleEdit);
    if (pending) {
      canEdit = false;
      reason = "The previous schedule change is unconfirmed. Refresh to reconcile it before another change.";
    } else if (receipt.templateVersion !== template.version) {
      canEdit = false;
      reason = "This automation template has changed. Review its schedule in n8n.";
    } else if (workflow.active) {
      canEdit = false;
      reason = "Turn off automatic runs before changing the frequency.";
    } else if (!receipt.fingerprint || workflowFingerprint(workflow) !== receipt.fingerprint) {
      canEdit = false;
      reason = "This workflow changed in n8n. Review its schedule there.";
    } else if (typeof workflow.versionId !== "string" || !workflow.versionId) {
      canEdit = false;
      reason = "The workflow version could not be verified.";
    } else if (!Number.isInteger(details.savedValue)) {
      canEdit = false;
      reason = "The saved schedule is not supported by this form.";
    }
    return {
      automationId,
      ...details,
      version: workflow.versionId ?? "",
      canEdit,
      ...(reason ? { reason } : {}),
      editState,
      ...(receipt.scheduleEdit ? { editExpectedVersion: receipt.scheduleEdit.expectedVersion } : {})
    };
  }

  edit(automationId, value, expectedVersion) {
    if (!Number.isInteger(value)) throw new ScheduleRequestError("Choose a whole-number frequency", 400);
    if (typeof expectedVersion !== "string" || !expectedVersion || expectedVersion.length > 200) {
      throw new ScheduleRequestError("Refresh the saved schedule before changing it", 400);
    }
    return this.installations.serialise(async () => {
      const { state, receipt, template, client, workflow } = await this.context(automationId);
      const existing = receipt.scheduleEdit;
      if (scheduleEditIsPending(existing)) {
        if (existing.expectedVersion !== expectedVersion || existing.requestedValue !== value) {
          throw new ScheduleRequestError("A different schedule change is already awaiting reconciliation");
        }
        return projectedEdit(automationId, existing, workflow);
      }
      if (receipt.templateVersion !== template.version) {
        throw new ScheduleRequestError("This automation template has changed. Review its schedule in n8n.");
      }
      if (workflow.active) {
        throw new ScheduleRequestError("Turn off automatic runs before changing the frequency");
      }
      const currentFingerprint = workflowFingerprint(workflow);
      if (!receipt.fingerprint || currentFingerprint !== receipt.fingerprint) {
        throw new ScheduleRequestError("This workflow changed in n8n. Review its schedule there.");
      }
      if (workflow.versionId !== expectedVersion) {
        throw new ScheduleRequestError("The saved schedule changed. Refresh before trying again.");
      }
      const details = scheduleDetails(template, workflow);
      if (value < details.min || value > details.max) {
        throw new ScheduleRequestError(`Choose a whole number from ${details.min} to ${details.max}`, 400);
      }
      const setting = details.unit === "minutes" ? "minutesInterval" : "hoursInterval";
      const updatedWorkflow = configureWorkflow(template, editableWorkflow(workflow), { [setting]: value });
      const edit = {
        operationId: randomUUID(),
        state: "updating",
        expectedVersion,
        requestedValue: value,
        previousFingerprint: currentFingerprint,
        requestedFingerprint: workflowFingerprint(updatedWorkflow)
      };
      const checkedWorkflow = await client.getWorkflow(receipt.workflowId);
      if (
        checkedWorkflow.active ||
        checkedWorkflow.versionId !== expectedVersion ||
        workflowFingerprint(checkedWorkflow) !== currentFingerprint
      ) {
        throw new ScheduleRequestError(
          "The workflow changed before the schedule could be saved. Refresh and try again."
        );
      }
      receipt.scheduleEdit = edit;
      await this.installations.save(state);
      let updated;
      try {
        updated = await client.updateWorkflow(receipt.workflowId, updatedWorkflow);
      } catch (error) {
        edit.state = error.outcome === "rejected" ? "rejected" : "unconfirmed";
        await this.installations.save(state);
        return projectedEdit(automationId, edit, workflow);
      }
      if (typeof updated?.versionId !== "string" || workflowFingerprint(updated) !== edit.requestedFingerprint) {
        edit.state = "unconfirmed";
      } else {
        edit.state = "updated";
        edit.version = updated.versionId;
        receipt.fingerprint = edit.requestedFingerprint;
      }
      await this.installations.save(state);
      return projectedEdit(automationId, edit, updated ?? workflow);
    });
  }
}
