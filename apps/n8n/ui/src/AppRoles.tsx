import type { AppRequirement } from "./automation-types";

export function AppRoles({
  requirements,
  icons,
  compact = false
}: {
  requirements: AppRequirement[];
  icons: Record<string, string>;
  compact?: boolean;
}) {
  return (
    <ul className="automation-roles" aria-label="Required applications">
      {requirements.map((requirement) => (
        <li key={requirement.binding}>
          {icons[requirement.packageId] ? (
            <img src={icons[requirement.packageId]} alt="" width="28" height="28" />
          ) : (
            <span className="automation-initial" aria-hidden="true">
              {requirement.name.slice(0, 1)}
            </span>
          )}
          <span>
            <strong>{requirement.name}</strong>
            {!compact ? <small>{requirement.role}</small> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
