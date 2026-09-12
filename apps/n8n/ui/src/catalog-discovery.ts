import { type Application, availableForRole, type Template } from "./automation-types.ts";

export type CatalogFilters = { query: string; application: string; tags: string[]; sort: "name" | "name-desc" };

export const emptyCatalogFilters: CatalogFilters = { query: "", application: "", tags: [], sort: "name" };

export function filterTemplates(templates: Template[], filters: CatalogFilters): Template[] {
  const words = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matching = templates.filter((template) => {
    const tags = template.presentation?.tags ?? [];
    const requirements = template.requirements ?? [];
    const searchable = [
      template.name,
      template.description,
      template.presentation?.summary ?? "",
      ...tags,
      ...requirements.flatMap((requirement) => [requirement.name, requirement.role])
    ]
      .join(" ")
      .toLocaleLowerCase();
    if (!words.every((word) => searchable.includes(word))) return false;
    if (filters.application && !requirements.some((requirement) => requirement.packageId === filters.application)) {
      return false;
    }
    return filters.tags.length === 0 || filters.tags.some((tag) => tags.includes(tag));
  });
  return matching.sort((left, right) => {
    const byName = left.name.localeCompare(right.name, "en", { sensitivity: "base", numeric: true });
    const order = byName || left.id.localeCompare(right.id);
    return filters.sort === "name-desc" ? -order : order;
  });
}

export function requiredAppAccess(template: Template, applications: Application[] | null) {
  if (applications === null) return { available: false, message: "App availability could not be checked." };
  const requirements = template.requirements ?? [];
  const unavailable = requirements.filter(
    (requirement) => !applications.some((application) => availableForRole(application, requirement))
  );
  if (unavailable.length) {
    return {
      available: false,
      message: `Not available to this platform: ${unavailable.map((requirement) => requirement.name).join(", ")}.`
    };
  }
  const workspaces = new Set(applications.map((application) => application.workspaceId));
  const compatible = [...workspaces].some((workspace) =>
    requirements.every((requirement) =>
      applications.some(
        (application) => application.workspaceId === workspace && availableForRole(application, requirement)
      )
    )
  );
  if (!compatible) return { available: false, message: "The required apps must be available in the same workspace." };
  return { available: true, message: "Required app actions available." };
}
