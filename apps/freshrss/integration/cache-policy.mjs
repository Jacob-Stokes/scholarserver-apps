const PRIVATE_REVALIDATION = "private, max-age=300, must-revalidate";
const CONTENT_TYPES_BY_EXTENSION = new Map([
  [".css", ["text/css"]],
  [".eot", ["application/vnd.ms-fontobject"]],
  [".gif", ["image/gif"]],
  [".ico", ["image/vnd.microsoft.icon", "image/x-icon"]],
  [".jpeg", ["image/jpeg"]],
  [".jpg", ["image/jpeg"]],
  [".js", ["application/javascript", "application/x-javascript", "text/javascript"]],
  [".otf", ["font/otf"]],
  [".png", ["image/png"]],
  [".svg", ["image/svg+xml"]],
  [".ttf", ["font/ttf"]],
  [".webp", ["image/webp"]],
  [".woff", ["font/woff"]],
  [".woff2", ["font/woff2"]]
]);

function header(headers, name) {
  const expected = name.toLowerCase();
  const actual = Object.keys(headers).find((key) => key.toLowerCase() === expected);
  return actual === undefined ? undefined : headers[actual];
}

function hasValue(headers, name) {
  const value = header(headers, name);
  return value !== undefined && String(value).trim() !== "";
}

function decodeAssetPath(requestUrl) {
  const rawPath = String(requestUrl).split(/[?#]/, 1)[0];
  if (!rawPath.startsWith("/") || rawPath.includes("\\")) return undefined;

  const decodedSegments = [];
  for (const segment of rawPath.split("/")) {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return undefined;
    }
    if (
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes("\0") ||
      decoded.includes("%")
    )
      return undefined;
    decodedSegments.push(decoded);
  }
  return decodedSegments;
}

function staticAssetInfo(requestUrl) {
  const segments = decodeAssetPath(requestUrl);
  if (!segments || segments.length < 3) return undefined;
  const root = segments[1].toLowerCase();
  if (root !== "themes" && root !== "scripts") return undefined;

  const assetPath = `/${segments.slice(1).join("/")}`;
  const lowerPath = assetPath.toLowerCase();
  if (lowerPath.includes(".php")) return undefined;

  const fileName = segments.at(-1);
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const allowedContentTypes = CONTENT_TYPES_BY_EXTENSION.get(extension);
  return allowedContentTypes ? { allowedContentTypes } : undefined;
}

function variesBySensitiveInput(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .some((part) => part === "cookie" || part === "authorization" || part === "*");
}

function freshRssCookies(value) {
  return String(value ?? "")
    .split(";")
    .filter((part) => /^\s*FreshRSS(?:[=;]|[A-Za-z0-9_]+=)/.test(part))
    .join(";");
}

export function readerCachePolicy({ method, url, requestHeaders = {} }) {
  const asset = staticAssetInfo(url);
  const isStaticRequest = (method === "GET" || method === "HEAD") && asset !== undefined;

  return {
    cacheable: isStaticRequest,
    forwardConditionals: isStaticRequest,
    allowedContentTypes: asset?.allowedContentTypes ?? []
  };
}

export function applyReaderCachePolicy(responseHeaders, policy, statusCode) {
  const headers = { ...responseHeaders };
  const contentType = String(header(headers, "content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const mimeIsAllowed =
    statusCode === 304 && contentType === "" ? true : policy.allowedContentTypes.includes(contentType);
  const safeResponse =
    policy.cacheable &&
    (statusCode === 200 || statusCode === 304) &&
    mimeIsAllowed &&
    !hasValue(headers, "set-cookie") &&
    !variesBySensitiveInput(header(headers, "vary"));

  headers["cache-control"] = safeResponse ? PRIVATE_REVALIDATION : "no-store";
  return {
    headers,
    cacheable: safeResponse
  };
}

export function forwardReaderConditionals(requestHeaders, policy) {
  const headers = { ...requestHeaders };
  if (!policy.forwardConditionals) {
    delete headers["if-none-match"];
    delete headers["if-modified-since"];
  }
  return headers;
}

export function readerUpstreamHeaders(requestHeaders, policy) {
  const headers = forwardReaderConditionals(requestHeaders, policy);
  for (const key of Object.keys(headers)) {
    if (
      [
        "authorization",
        "x-scholarserver-session",
        "x-scholarserver-browser-identity",
        "remote-user",
        "remote_user",
        "x-webauth-user",
        "x-forwarded-user"
      ].includes(key.toLowerCase()) ||
      key.toLowerCase().startsWith("x-authentik-")
    )
      delete headers[key];
    if (key.toLowerCase() === "cookie") {
      if (policy.cacheable) delete headers[key];
      else headers[key] = freshRssCookies(headers[key]);
    }
  }
  return headers;
}
