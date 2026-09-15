import { scheduleEditIsPending } from "./schedule-management.mjs";

export function allowedActionsFor(receipt, template, workflow) {
  const actions = [];
  const installed = receipt.state === "installed";
  const listed = Boolean(workflow);

  if (installed && listed) {
    if (template?.configuration) actions.push("view-schedule");
    if (workflow.active) {
      actions.push("disable");
    } else {
      const canEnable = Boolean(
        template &&
          receipt.editing === "guided" &&
          !scheduleEditIsPending(receipt.scheduleEdit) &&
          (!template.research || receipt.researchAccess === "ready")
      );
      if (canEnable) actions.push("enable");
    }
    actions.push("runs");
    const scheduleIsEditable = Boolean(
      !workflow.active &&
        template?.configuration &&
        receipt.templateVersion === template.version &&
        receipt.editing === "guided" &&
        !scheduleEditIsPending(receipt.scheduleEdit)
    );
    if (scheduleIsEditable) actions.push("edit-schedule");
  } else if (receipt.state === "rejected") {
    actions.push("retry");
  } else if (!installed) {
    actions.push("reconcile");
  }

  if (template?.research && receipt.researchAccess === "ready") actions.push("revoke-research");
  return actions;
}

export function projectReceipt(receipt, template, workflow) {
  const { scheduleEdit, ...publicReceipt } = receipt;
  const scheduleChange = scheduleEdit
    ? { operationId: scheduleEdit.operationId, state: scheduleEdit.state }
    : undefined;
  return {
    ...publicReceipt,
    ...(scheduleChange ? { scheduleChange } : {}),
    allowedActions: allowedActionsFor(receipt, template, workflow)
  };
}
