/** Compatibility entry points for this package's native Manager configuration. */
export function managerDestination(pathname: string, search = ""): string | null {
  const match = /^\/apps\/([a-z][a-z0-9-]{0,62})(\/.*)?$/.exec(pathname);
  if (!match) return null;
  const instanceId = match[1]!;
  const route = (match[2] ?? "").replace(/\/$/, "");
  const management = `/applications/manage/${encodeURIComponent(instanceId)}`;
  if (route === "/automation-setup" && new URLSearchParams(search).get("managerSetup") === "1") return null;
  if (route === "/configuration") return `${management}/configuration`;
  if (route === "/catalog") return `/automations/catalog?${new URLSearchParams({ engine: instanceId })}`;
  if (["", "/", "/overview", "/automations", "/automation-setup"].includes(route)) {
    return `/automations?${new URLSearchParams({ engine: instanceId })}`;
  }
  return null;
}
