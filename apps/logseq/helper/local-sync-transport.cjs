const { readFileSync } = require("node:fs");
const path = require("node:path");
const { getGlobalDispatcher, setGlobalDispatcher } = require("undici");

function localSyncInterceptor(publicOrigin, internalOrigin = "http://sync:8787") {
  return (dispatch) => (options, handler) => {
    if (String(options.origin) !== publicOrigin) return dispatch(options, handler);
    // Tailscale belongs to the server's network container, not this worker.
    // Only downloads from this exact configured origin take the private Docker
    // path. Other hosts keep normal routing and TLS certificate verification.
    return dispatch({ ...options, origin: internalOrigin }, handler);
  };
}
module.exports = { localSyncInterceptor };

if (process.env.LOGSEQ_SYNC_CONFIG) {
  try {
    const { url } = JSON.parse(readFileSync(path.join(process.env.LOGSEQ_SYNC_CONFIG, "address.json"), "utf8"));
    const origin = new URL(url);
    if (
      origin.protocol !== "https:" ||
      !origin.hostname.endsWith(".ts.net") ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      Number(origin.port) < 12000 ||
      Number(origin.port) >= 52000
    ) {
      throw new Error("invalid private address");
    }
    setGlobalDispatcher(getGlobalDispatcher().compose(localSyncInterceptor(origin.origin)));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("The private sync address needs attention.");
  }
}
