import { packagedAppIcons } from "./app-icons";
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
      {requirements.map((requirement) => {
        const icon = packagedAppIcons[requirement.packageId] ?? icons[requirement.packageId];
        return (
          <li key={requirement.binding}>
            {icon ? (
              <img src={icon} alt="" width="32" height="32" />
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
        );
      })}
    </ul>
  );
}
