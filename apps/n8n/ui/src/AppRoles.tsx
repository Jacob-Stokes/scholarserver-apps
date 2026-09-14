import { readIconStyle, subscribeIconStyle } from "@scholarserver/ui/icon-preference";
import { useState, useSyncExternalStore } from "react";
import { type AppIcons, packagedAppIcons, selectAppRoleIcon } from "./app-icons";
import type { AppRequirement } from "./automation-types";

export function AppRoles({
  requirements,
  icons,
  compact = false
}: {
  requirements: AppRequirement[];
  icons: AppIcons;
  compact?: boolean;
}) {
  const style = useSyncExternalStore(subscribeIconStyle, readIconStyle, () => "editorial" as const);
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  return (
    <ul className="automation-roles" aria-label="Required applications">
      {requirements.map((requirement) => {
        const icon = selectAppRoleIcon(requirement.packageId, style, icons, failedUrls);
        const editorial =
          style === "editorial" &&
          icon !== undefined &&
          (icon === icons[requirement.packageId]?.editorial ||
            icon === packagedAppIcons[requirement.packageId]?.editorial);
        return (
          <li key={requirement.binding}>
            {icon ? (
              <img
                src={icon}
                className={editorial ? "ss-editorial-icon" : undefined}
                alt=""
                width="32"
                height="32"
                onError={() => setFailedUrls((current) => (current.includes(icon) ? current : [...current, icon]))}
              />
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
