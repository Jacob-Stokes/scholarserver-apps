export async function couchRequest(
  label,
  url,
  init,
  accept = (response) => response.ok,
  { startupReadiness = false } = {}
) {
  if (startupReadiness && (init.method !== "GET" || new URL(url).pathname !== "/_up")) {
    throw new Error("Authentication startup retries are limited to the CouchDB readiness probe");
  }
  let lastError;
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    let response;
    let text;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
      text = await response.text();
    } catch (error) {
      lastError = error;
    }
    if (response && text !== undefined) {
      if (accept(response, text)) return text;
      lastError = new Error(`${label} failed (HTTP ${response.status})`);
      // CouchDB opens its listener before finishing admin bootstrap. Only this
      // initial authenticated read may retry a temporary 401, never a mutation.
      const bootstrapPending = startupReadiness && response.status === 401;
      if (response.status < 500 && !bootstrapPending) throw lastError;
    }
    if (attempt < 24) await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}
