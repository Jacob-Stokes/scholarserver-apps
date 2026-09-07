import { readFile } from "node:fs/promises";
import { convert } from "html-to-text";

async function boundedText(response, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error("The result is too large. Request fewer articles.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export class FreshRssClient {
  constructor(base, credentials) {
    this.base = base;
    this.credentials = credentials;
  }

  async request(endpoint, parameters = {}, method = "GET") {
    const account = JSON.parse(await readFile(this.credentials, "utf8"));
    const login = await fetch(`${this.base}/api/greader.php/accounts/ClientLogin`, {
      method: "POST",
      body: new URLSearchParams({ Email: account.username, Passwd: account.apiPassword }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000)
    });
    if (!login.ok) throw new Error("FreshRSS sign-in failed. Check the connection in Configuration.");
    const token = (await boundedText(login, 16_384)).match(/^Auth=(.+)$/m)?.[1];
    if (!token) throw new Error("FreshRSS has not finished setting up its API.");
    const query = new URLSearchParams(parameters);
    const headers = { authorization: `GoogleLogin auth=${token}` };
    if (method === "POST") {
      const csrf = await fetch(`${this.base}/api/greader.php/reader/api/0/token`, {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(10_000)
      });
      if (!csrf.ok) throw new Error("FreshRSS could not authorize this change.");
      query.set("T", await boundedText(csrf, 16_384));
    }
    const url = `${this.base}/api/greader.php/reader/api/0/${endpoint}`;
    const response = await fetch(method === "GET" ? `${url}?${query}` : url, {
      method,
      headers,
      body: method === "POST" ? query : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error(`FreshRSS could not complete the request (${response.status}).`);
    const text = await boundedText(response, 4_000_000);
    if (response.headers.get("content-type")?.includes("json")) return JSON.parse(text);
    return text;
  }
}

export function article(item) {
  return {
    id: item.id,
    title: item.title,
    published: item.published,
    url: safeUrl(item.alternate?.[0]?.href),
    feed: item.origin?.title,
    categories: item.categories,
    text: convert((item.summary?.content ?? "").slice(0, 100_000), {
      wordwrap: false,
      selectors: [{ selector: "img", format: "skip" }]
    }).slice(0, 12_000)
  };
}

export function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return undefined;
    url.username = "";
    url.password = "";
    return url.href;
  } catch {
    return undefined;
  }
}
