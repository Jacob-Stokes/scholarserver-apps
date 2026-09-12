// Requirements describe reviewed app roles. Platform grants remain an independent
// upper bound; this metadata never permits arbitrary actions from a workflow.
export function validateRequirements(template) {
  if (!template.research) return;
  const requirements = template.requirements;
  if (!Array.isArray(requirements) || requirements.length !== 2) {
    throw new Error("Research templates require two explicit app roles");
  }
  const bindings = new Set();
  for (const requirement of requirements) {
    if (
      !["zotero", "obsidian", "docling"].includes(requirement.binding) ||
      bindings.has(requirement.binding) ||
      requirement.packageId !== `org.scholarserver.${requirement.binding}` ||
      typeof requirement.name !== "string" ||
      !requirement.name.trim() ||
      typeof requirement.role !== "string" ||
      !requirement.role.trim() ||
      !Array.isArray(requirement.actions) ||
      !requirement.actions.length ||
      !requirement.actions.every((action) => typeof action === "string" && /^[a-z][a-z-]+$/.test(action)) ||
      new Set(requirement.actions).size !== requirement.actions.length
    )
      throw new Error("Invalid research app requirement");
    bindings.add(requirement.binding);
  }
  const destination = template.research === "convert-pdfs" ? "docling" : "obsidian";
  if (!bindings.has("zotero") || !bindings.has(destination))
    throw new Error("Research app roles do not match the implementation");
  if (
    template.presentation?.maturity !== "preview" ||
    template.presentation.ai !== "none" ||
    typeof template.presentation.summary !== "string" ||
    !template.presentation.summary.trim() ||
    typeof template.presentation.effects !== "string" ||
    !template.presentation.effects.trim()
  ) {
    throw new Error("Research templates require explicit effects and maturity");
  }
  const tags = template.presentation.tags;
  if (
    !Array.isArray(tags) ||
    tags.length < 1 ||
    tags.length > 8 ||
    !tags.every((tag) => typeof tag === "string" && /^[A-Za-z][A-Za-z0-9 -]{0,31}$/.test(tag) && tag.trim() === tag) ||
    new Set(tags.map((tag) => tag.toLowerCase())).size !== tags.length
  ) {
    throw new Error("Research templates require bounded unique catalog tags");
  }
}

export function requirementsForScope(templates, scope) {
  const template = templates.find((candidate) => candidate.research === scope.kind);
  if (!template) throw new Error("Unknown research automation");
  return template.requirements;
}

export function assertRequiredApplications(requirements, scope, applications) {
  for (const requirement of requirements) {
    const found = applications.find(
      (application) =>
        application.id === scope[requirement.binding] &&
        application.workspaceId === scope.workspaceId &&
        application.packageId === requirement.packageId
    );
    if (!found || requirement.actions.some((action) => !found.actions.includes(action))) {
      throw new Error("A selected research app is unavailable or does not expose the required actions");
    }
  }
}
