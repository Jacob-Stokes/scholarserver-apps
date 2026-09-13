export function allowedActionsFor(receipt, template, workflow) {
  const actions = [];
  const installed = receipt.state === "installed";
  const listed = Boolean(workflow);

  if (installed && listed) {
    if (workflow.active) {
      actions.push("disable");
    } else {
      const canEnable = Boolean(
        template && receipt.editing === "guided" && (!template.research || receipt.researchAccess === "ready")
      );
      if (canEnable) actions.push("enable");
    }
    actions.push("runs");
  } else if (receipt.state === "rejected") {
    actions.push("retry");
  } else if (!installed) {
    actions.push("reconcile");
  }

  if (template?.research && receipt.researchAccess === "ready") actions.push("revoke-research");
  return actions;
}

export function projectReceipt(receipt, template, workflow) {
  return { ...receipt, allowedActions: allowedActionsFor(receipt, template, workflow) };
}
