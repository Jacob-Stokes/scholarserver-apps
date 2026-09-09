// n8n 2.38.1's account endpoints are private API, unlike workflow execution.
// Keep this compatibility boundary small and test it against the pinned image.
export class SetupError extends Error {}

export const setupScopes = [
  "workflow:create",
  "workflow:list",
  "workflow:read",
  "workflow:update",
  "workflow:activate",
  "workflow:deactivate",
  "execution:list",
  "credential:create"
];

export class BootstrapClient {
  constructor(baseUrl, fetchImplementation = fetch) {
    this.baseUrl = new URL(baseUrl);
    this.fetch = fetchImplementation;
    this.cookie = "";
  }

  async request(route, body) {
    let response;
    try {
      response = await this.fetch(new URL(`/rest/${route}`, this.baseUrl), {
        method: body === undefined ? "GET" : "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          "content-type": "application/json",
          origin: this.baseUrl.origin,
          cookie: this.cookie
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new SetupError("Could not confirm setup. Check status, then enter your password again to resume.");
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) {
        throw new SetupError("n8n did not accept the sign-in. Check the password and any two-factor code.");
      }
      throw new SetupError(
        "n8n could not complete setup. Check status before continuing; existing accounts will not be reset."
      );
    }
    const cookie = response.headers.getSetCookie().find((value) => value.startsWith("n8n-auth="));
    if (cookie) this.cookie = cookie.split(";")[0];
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) throw new Error("oversized");
        chunks.push(chunk);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")).data;
    } catch {
      throw new SetupError(
        "The setup response was incomplete. Check status, then enter your password again to resume."
      );
    }
  }

  async needsOwner() {
    const settings = await this.request("settings");
    const fresh = settings?.userManagement?.showSetupOnFirstLoad;
    if (typeof fresh !== "boolean") throw new SetupError("This n8n version needs a setup compatibility check.");
    return fresh;
  }

  createOwner(email, password) {
    // Unlike the environment loader, this endpoint rejects an existing owner.
    return this.request("owner/setup", { email, password, firstName: "ScholarServer", lastName: "Owner" });
  }

  async signIn(email, password, mfaCode) {
    const user = await this.request("login", { emailOrLdapLoginId: email, password, ...(mfaCode ? { mfaCode } : {}) });
    if (user?.role !== "global:owner" && user?.role?.slug !== "global:owner") {
      throw new SetupError("Use the existing n8n owner account to restore this connection.");
    }
  }

  async findSetupKey(label) {
    const query = new URLSearchParams({ ownership: "mine", label, take: "100", skip: "0" });
    const result = await this.request(`api-keys?${query}`);
    if (!Array.isArray(result?.items) || result.counts?.mine > 100) {
      throw new SetupError("The setup key inventory needs review before continuing.");
    }
    const matches = result.items.filter((key) => key.label === label);
    if (matches.length > 1) throw new SetupError("More than one setup key was found. No keys were changed.");
    return matches[0] ?? null;
  }

  createKey(label) {
    return this.request("api-keys", { label, expiresAt: null, scopes: setupScopes });
  }

  rotateKey(id) {
    return this.request(`api-keys/${encodeURIComponent(id)}/rotate`, {});
  }
}
