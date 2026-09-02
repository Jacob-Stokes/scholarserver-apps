export function desktopLaunchUrl(currentUrl) {
  const current = new URL(currentUrl);
  const endpointPath = current.pathname.replace(/\/(?:index\.html)?$/, "");
  const target = new URL("vnc.html", current);
  target.search = new URLSearchParams({
    autoconnect: "1",
    reconnect: "1",
    resize: "remote",
    path: `${endpointPath}/websockify`.replace(/^\/+/, "")
  }).toString();
  return target.toString();
}

if (typeof window !== "undefined") {
  window.location.replace(desktopLaunchUrl(window.location.href));
}
