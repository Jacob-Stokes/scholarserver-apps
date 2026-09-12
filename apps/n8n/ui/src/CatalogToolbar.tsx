import { useId } from "react";
import type { Template } from "./automation-types";
import { type CatalogFilters, emptyCatalogFilters } from "./catalog-discovery";

export function CatalogToolbar({
  templates,
  filters,
  count,
  onChange
}: {
  templates: Template[];
  filters: CatalogFilters;
  count: number;
  onChange: (filters: CatalogFilters) => void;
}) {
  const controlsId = useId();
  const applications = new Map(
    templates.flatMap((template) =>
      template.requirements.map((requirement) => [requirement.packageId, requirement.name] as const)
    )
  );
  const tags = [...new Set(templates.flatMap((template) => template.presentation?.tags ?? []))].sort();
  const filtered = Boolean(filters.query || filters.application || filters.tags.length);
  return (
    <div className="catalog-toolbar" role="search" aria-label="Find an automation">
      <div className="catalog-controls">
        <div className="catalog-control catalog-search">
          <label htmlFor={`${controlsId}-query`}>Search automations</label>
          <input
            id={`${controlsId}-query`}
            className="ss-input"
            type="search"
            value={filters.query}
            placeholder="Search by outcome or app"
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
          />
        </div>
        <div className="catalog-control">
          <label htmlFor={`${controlsId}-app`}>Application</label>
          <select
            id={`${controlsId}-app`}
            className="ss-input"
            value={filters.application}
            onChange={(event) => onChange({ ...filters, application: event.target.value })}
          >
            <option value="">All applications</option>
            {[...applications]
              .sort((left, right) => left[1].localeCompare(right[1]))
              .map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
          </select>
        </div>
        <div className="catalog-control">
          <label htmlFor={`${controlsId}-sort`}>Sort by</label>
          <select
            id={`${controlsId}-sort`}
            className="ss-input"
            value={filters.sort}
            onChange={(event) => onChange({ ...filters, sort: event.target.value as CatalogFilters["sort"] })}
          >
            <option value="name">Name: A–Z</option>
            <option value="name-desc">Name: Z–A</option>
          </select>
        </div>
      </div>
      <div className="catalog-filter-row">
        <details
          className="catalog-tag-picker"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
        >
          <summary>Tags{filters.tags.length ? ` (${filters.tags.length})` : ""}</summary>
          <fieldset>
            <legend>Match any selected tag</legend>
            {tags.map((tag) => (
              <label key={tag}>
                <input
                  type="checkbox"
                  checked={filters.tags.includes(tag)}
                  onChange={(event) => {
                    const selected = event.target.checked
                      ? [...filters.tags, tag]
                      : filters.tags.filter((value) => value !== tag);
                    onChange({ ...filters, tags: selected });
                  }}
                />
                {tag}
              </label>
            ))}
            {!tags.length ? <p>No tags in this catalog.</p> : null}
          </fieldset>
        </details>
        {filters.tags.map((tag) => (
          <button
            key={tag}
            className="catalog-tag"
            aria-label={`Remove ${tag} filter`}
            onClick={() => onChange({ ...filters, tags: filters.tags.filter((value) => value !== tag) })}
          >
            {tag} <span aria-hidden="true">×</span>
          </button>
        ))}
        <p className="catalog-result-count" role="status">
          {count} of {templates.length} automations
        </p>
        {filtered ? (
          <button
            className="ss-button ss-button-secondary"
            onClick={() => onChange({ ...emptyCatalogFilters, sort: filters.sort })}
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
