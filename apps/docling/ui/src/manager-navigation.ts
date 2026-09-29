/** Compatibility entry points for this package's native Manager configuration. */
export function managerDestination(pathname: string): string | null {
  const match = /^\/apps\/([a-z][a-z0-9-]{0,62})(\/.*)?$/.exec(pathname);
  if (!match) return null;
  const instanceId = match[1]!;
  const route = (match[2] ?? "").replace(/\/$/, "");
  const management = `/applications/manage/${encodeURIComponent(instanceId)}`;
  if (route === "/configuration") return `${management}/configuration`;
  return null;
}
