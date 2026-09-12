import { readFile } from "node:fs/promises";
import { atomicJson } from "@scholarserver/controller-runtime/files";

export function zoteroLoginUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Zotero did not return a valid sign-in address");
  }
  if (
    url.origin !== "https://www.zotero.org" ||
    url.username ||
    url.password ||
    (url.pathname !== "/login" && !url.pathname.startsWith("/login/"))
  ) {
    throw new Error("Zotero did not return an approved sign-in address");
  }
  return url.href;
}

// The controller owns this session. Browsers observe it; closing a tab does not
// cancel login or cause another account-link request to be sent to Zotero.
export function createAccountLink({ sessionPath, callBridge, saveIdentity }) {
  let operation = Promise.resolve();

  function exclusively(work) {
    const result = operation.then(work);
    operation = result.catch(() => {});
    return result;
  }

  async function readSession() {
    try {
      return JSON.parse(await readFile(sessionPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw new Error("Could not read Zotero account setup state; do not restart account linking");
    }
  }

  function publicSession(session, includeLoginUrl = false) {
    if (!session) return { state: "idle" };
    // Older controllers persisted only the token. Reconcile it, never replace it.
    const result = { state: session.state ?? "pending" };
    if (session.error) result.error = session.error;
    if (includeLoginUrl && result.state === "pending" && session.loginUrl) {
      result.loginUrl = zoteroLoginUrl(session.loginUrl);
    }
    return result;
  }

  async function start() {
    return exclusively(async () => {
      const previous = await readSession();
      if (previous && !["cancelled", "connected"].includes(previous.state)) {
        return publicSession(previous, true);
      }
      // Persist intent before invoking upstream. An interrupted start must not
      // silently create a second login session after controller restart.
      await atomicJson(sessionPath, { state: "starting" });
      try {
        const result = await callBridge("account-start");
        if (typeof result.sessionToken !== "string" || result.sessionToken.length < 16) {
          throw new Error("Invalid login session");
        }
        const session = {
          state: "pending",
          sessionToken: result.sessionToken,
          loginUrl: zoteroLoginUrl(result.loginUrl)
        };
        await atomicJson(sessionPath, session);
        return publicSession(session, true);
      } catch {
        const session = {
          state: "interrupted",
          error:
            "Account linking could not be started reliably. Open Zotero to inspect its account before trying again."
        };
        await atomicJson(sessionPath, session);
        return publicSession(session);
      }
    });
  }

  async function check() {
    return exclusively(async () => {
      const session = await readSession();
      if (session && ["starting", "interrupted"].includes(session.state)) {
        // A user may have completed login in Zotero itself after an uncertain
        // start. Observe that identity without creating another login request.
        const engine = await callBridge("status");
        if (engine?.accountConnected && /^\d+$/.test(String(engine.userId ?? ""))) {
          await saveIdentity({ userId: String(engine.userId) });
          await atomicJson(sessionPath, { state: "connected" });
          return { state: "connected" };
        }
        return publicSession(session);
      }
      if (!session || (session.state && session.state !== "pending")) return publicSession(session);
      try {
        const result = await callBridge("account-complete", { sessionToken: session.sessionToken });
        if (result.state === "pending") {
          if (session.error) await atomicJson(sessionPath, { ...session, error: undefined });
          return { state: "pending" };
        }
        if (result.state === "cancelled") {
          await atomicJson(sessionPath, { state: "cancelled" });
          return { state: "cancelled" };
        }
        if (result.state !== "connected" || !/^\d+$/.test(String(result.userId ?? ""))) {
          throw new Error("Unknown account-link result");
        }
        await saveIdentity({ userId: String(result.userId) });
        await atomicJson(sessionPath, { state: "connected" });
        return { state: "connected" };
      } catch {
        // Retry observation of the same session, never its creation. Upstream
        // errors can contain login URLs/tokens and must not reach status or logs.
        const error = "Could not confirm Zotero sign-in. ScholarServer will check the same request again.";
        await atomicJson(sessionPath, { ...session, state: "pending", error });
        return { state: "pending", error };
      }
    });
  }

  async function snapshot(includeLoginUrl = false) {
    try {
      return publicSession(await readSession(), includeLoginUrl);
    } catch {
      // A damaged setup journal must block setup, not take the application
      // status page down or prevent an already configured MCP from running.
      return {
        state: "interrupted",
        error: "Could not read Zotero account setup state; do not restart account linking."
      };
    }
  }

  return { start, check, snapshot };
}
