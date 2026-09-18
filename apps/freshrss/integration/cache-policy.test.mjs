import assert from "node:assert/strict";
import test from "node:test";
import {
  applyReaderCachePolicy,
  forwardReaderConditionals,
  readerCachePolicy,
  readerUpstreamHeaders
} from "./cache-policy.mjs";

const assetHeaders = {
  "if-none-match": '"theme-v1"',
  "if-modified-since": "Wed, 17 Sep 2026 10:00:00 GMT"
};

test("authenticated browser cookies do not reach FreshRSS for cacheable assets", () => {
  const requestHeaders = {
    cookie: "FreshRSSAuth=private; manager-session=private",
    authorization: "Bearer manager-secret",
    "x-scholarserver-session": "manager-session",
    ...assetHeaders
  };
  const policy = readerCachePolicy({
    method: "GET",
    url: "/themes/ScholarServer/theme.css?v=1",
    requestHeaders
  });
  assert.equal(policy.cacheable, true);
  const upstreamHeaders = readerUpstreamHeaders(requestHeaders, policy);
  assert.equal(upstreamHeaders.cookie, undefined);
  assert.equal(upstreamHeaders.authorization, undefined);
  assert.equal(upstreamHeaders["x-scholarserver-session"], undefined);
  assert.deepEqual(
    { "if-none-match": upstreamHeaders["if-none-match"], "if-modified-since": upstreamHeaders["if-modified-since"] },
    assetHeaders
  );
  assert.equal(applyReaderCachePolicy({ "content-type": "text/css", etag: '"theme-v1"' }, policy, 200).cacheable, true);

  const dynamicPolicy = readerCachePolicy({ method: "GET", url: "/stream/items" });
  const dynamicHeaders = readerUpstreamHeaders(requestHeaders, dynamicPolicy);
  assert.equal(dynamicHeaders.cookie, "FreshRSSAuth=private");
  assert.equal(dynamicHeaders.authorization, undefined);
  assert.equal(dynamicHeaders["x-scholarserver-session"], undefined);
  assert.equal(
    applyReaderCachePolicy({ "content-type": "text/html" }, dynamicPolicy, 200).headers["cache-control"],
    "no-store"
  );
});

test("GET and HEAD recognized theme/script assets allow private revalidation", () => {
  for (const method of ["GET", "HEAD"]) {
    const policy = readerCachePolicy({
      method,
      url: "/themes/ScholarServer/theme.css?v=1",
      requestHeaders: {}
    });
    assert.equal(policy.cacheable, true);
    assert.equal(policy.forwardConditionals, true);
    assert.deepEqual(forwardReaderConditionals(assetHeaders, policy), assetHeaders);
    assert.equal(
      applyReaderCachePolicy({ "content-type": "text/css", etag: '"theme-v1"' }, policy, 200).headers["cache-control"],
      "private, max-age=300, must-revalidate"
    );
  }
});

test("dynamic paths, PHP, and traversal stay no-store", () => {
  for (const url of [
    "/",
    "/login",
    "/api/greader.php/reader/api/0/stream/items/ids",
    "/themes/ScholarServer/login.php",
    "/themes/ScholarServer/../../data/config.php",
    "/scripts/%2e%2e/%2e%2e/data/config.php",
    "/scripts/%252e%252e/%252e%252e/data.css",
    "/scripts/app",
    "/themes/ScholarServer/index.html",
    "/scripts/config.json"
  ]) {
    const policy = readerCachePolicy({ method: "GET", url, requestHeaders: {} });
    assert.equal(policy.cacheable, false, url);
    assert.equal(forwardReaderConditionals(assetHeaders, policy)["if-none-match"], undefined, url);
    assert.equal(
      applyReaderCachePolicy({ "content-type": "text/javascript" }, policy, 200).headers["cache-control"],
      "no-store",
      url
    );
  }

  const postPolicy = readerCachePolicy({
    method: "POST",
    url: "/scripts/freshrss.js",
    requestHeaders: {}
  });
  assert.equal(postPolicy.cacheable, false);
});

test("response MIME must match the recognized asset and cannot be HTML or JSON", () => {
  const cssPolicy = readerCachePolicy({ method: "GET", url: "/themes/Origine/style.css" });
  assert.equal(applyReaderCachePolicy({ "content-type": "text/css; charset=utf-8" }, cssPolicy, 200).cacheable, true);
  for (const contentType of ["text/html", "application/json", "application/javascript"]) {
    assert.equal(applyReaderCachePolicy({ "content-type": contentType }, cssPolicy, 200).cacheable, false);
  }

  const scriptPolicy = readerCachePolicy({ method: "GET", url: "/scripts/freshrss.js" });
  assert.equal(
    applyReaderCachePolicy({ "content-type": "application/javascript; charset=utf-8" }, scriptPolicy, 200).cacheable,
    true
  );
  assert.equal(applyReaderCachePolicy({}, scriptPolicy, 304).cacheable, true);
});

test("credential-bearing headers are stripped from static upstream requests", () => {
  for (const requestHeaders of [
    { cookie: "FreshRSSAuth=private" },
    { authorization: "Bearer secret" },
    { "x-scholarserver-session": "session" }
  ]) {
    const policy = readerCachePolicy({
      method: "GET",
      url: "/scripts/freshrss.js",
      requestHeaders
    });
    assert.equal(policy.cacheable, true);
    const upstreamHeaders = readerUpstreamHeaders(requestHeaders, policy);
    assert.equal(upstreamHeaders.cookie, undefined);
    assert.equal(upstreamHeaders.authorization, undefined);
    assert.equal(upstreamHeaders["x-scholarserver-session"], undefined);
  }
});

test("login-like and sensitive upstream responses remain no-store", () => {
  const policy = readerCachePolicy({
    method: "GET",
    url: "/themes/Origine/style.css",
    requestHeaders: {}
  });
  for (const responseHeaders of [
    { "content-type": "text/html; charset=utf-8" },
    { "content-type": "text/css", "set-cookie": ["FreshRSSAuth=private"] },
    { "content-type": "text/css", vary: "Accept-Encoding, Cookie" },
    { "content-type": "text/css", vary: "*" }
  ]) {
    assert.equal(applyReaderCachePolicy(responseHeaders, policy, 200).cacheable, false);
    assert.equal(applyReaderCachePolicy(responseHeaders, policy, 200).headers["cache-control"], "no-store");
  }
  assert.equal(
    applyReaderCachePolicy({ "content-type": "text/css" }, policy, 304).headers["cache-control"],
    "private, max-age=300, must-revalidate"
  );
  assert.equal(applyReaderCachePolicy({ "content-type": "text/css" }, policy, 404).cacheable, false);
});
