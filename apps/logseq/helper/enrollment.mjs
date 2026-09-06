import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { GraphError } from "./operations.mjs";

const authorizeEndpoint = "https://logseq-prod.auth.us-east-1.amazoncognito.com/oauth2/authorize";
const tokenEndpoint = "https://logseq-prod.auth.us-east-1.amazoncognito.com/oauth2/token";
const redirectUri = "http://localhost:8765/auth/callback";
const clientId = "69cs1lgme7p8kbgld8n5kseii6";

function sameValue(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function callbackTarget(value, state) {
  const invalid = () =>
    new GraphError("invalid-return-link", "Paste the complete return link from this sign-in attempt.");
  if (typeof value !== "string" || value.length > 8192) throw invalid();
  let url;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  if (`${url.origin}${url.pathname}` !== redirectUri || url.username || url.password || url.hash) throw invalid();
  const states = url.searchParams.getAll("state");
  const codes = url.searchParams.getAll("code");
  if (
    states.length !== 1 ||
    !sameValue(states[0], state) ||
    codes.length !== 1 ||
    !/^[\x21-\x7e]{1,4096}$/.test(codes[0])
  ) {
    throw invalid();
  }
  for (const key of url.searchParams.keys()) {
    if (key !== "state" && key !== "code") throw invalid();
  }
  // Never fetch a user-supplied host, port or path. The pinned CLI listens here.
  return `http://[::1]:8765/auth/callback?${new URLSearchParams({ state, code: codes[0] })}`;
}

export class Enrollment {
  #session;
  #starting = false;

  constructor({ runtime, root, runLogin, fetchImpl = fetch, now = Date.now, lifetimeMs = 300_000 }) {
    this.runtime = runtime;
    this.root = root;
    this.runLogin = runLogin;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.lifetimeMs = lifetimeMs;
  }

  status() {
    const session = this.#session;
    if (!session) return { state: "idle" };
    return {
      state: session.phase,
      authorizationUrl: session.phase === "waiting" ? session.authorizationUrl : null,
      expiresAt: new Date(session.expiresAt).toISOString(),
      error: session.error ?? null
    };
  }

  async start() {
    if (this.#starting) throw new GraphError("busy", "Sign-in is starting. Please wait.", 409);
    if (["waiting", "authenticating"].includes(this.#session?.phase)) return this.status();
    this.#starting = true;
    let directory;
    try {
      // A timed-out child must release its fixed callback port before another starts.
      await this.#session?.finished;
      await mkdir(this.runtime, { recursive: true, mode: 0o700 });
      directory = await mkdtemp(path.join(this.runtime, "login-"));
      const state = randomBytes(24).toString("base64url");
      const verifier = randomBytes(48).toString("base64url");
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      const configPath = path.join(directory, "cli.edn");
      // These are supported upstream CLI settings. Logseq owns token exchange,
      // credential persistence and refresh; the temporary verifier never enters argv.
      const settings = {
        "auth-path": path.join(this.root, "auth.json"),
        "oauth-authorize-endpoint": authorizeEndpoint,
        "oauth-token-endpoint": tokenEndpoint,
        "oauth-state": state,
        "oauth-code-verifier": verifier
      };
      const fields = Object.entries(settings).map(([key, value]) => `:${key} ${JSON.stringify(value)}`);
      await writeFile(
        configPath,
        `{${fields.join("\n")}\n:open-browser false\n:login-timeout-ms ${this.lifetimeMs}}\n`,
        {
          mode: 0o600,
          flag: "wx"
        }
      );
      const authorizationUrl = new URL(authorizeEndpoint);
      authorizationUrl.search = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        scope: "email openid phone",
        redirect_uri: redirectUri,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256"
      }).toString();
      const session = {
        phase: "waiting",
        state,
        authorizationUrl: authorizationUrl.toString(),
        expiresAt: this.now() + this.lifetimeMs,
        abort: new AbortController()
      };
      this.#session = session;
      session.timer = setTimeout(() => {
        session.phase = "expired";
        session.error = "Sign-in expired. Start again for a new link.";
        session.abort.abort();
      }, this.lifetimeMs);
      session.timer.unref?.();
      session.finished = this.#run(session, configPath, directory);
      return this.status();
    } catch (error) {
      if (directory) await rm(directory, { recursive: true, force: true });
      throw error;
    } finally {
      this.#starting = false;
    }
  }

  async #run(session, configPath, directory) {
    try {
      await this.runLogin(configPath, session.abort.signal);
      if (["waiting", "authenticating"].includes(session.phase)) session.phase = "connected";
    } catch {
      if (session.phase !== "cancelled" && session.phase !== "expired") {
        session.phase = "failed";
        session.error =
          "Logseq could not complete sign-in. Start again for a new link. Your existing graph was not changed.";
      }
    } finally {
      clearTimeout(session.timer);
      // Remove only the private directory this attempt created, never the auth file.
      await rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  }

  async complete(returnLink) {
    const session = this.#session;
    if (!session || session.phase !== "waiting" || this.now() >= session.expiresAt) {
      throw new GraphError("sign-in-expired", "Start sign-in again for a new link.", 409);
    }
    const target = callbackTarget(returnLink, session.state);
    session.phase = "authenticating";
    try {
      const response = await this.fetchImpl(target, { redirect: "error", signal: AbortSignal.timeout(10_000) });
      await response.body?.cancel();
      if (!response.ok) throw new Error("Callback rejected");
    } catch {
      // A one-shot callback may already have consumed the code. Never replay it.
      session.phase = "failed";
      session.error = "The return link could not be accepted. Start sign-in again.";
      session.abort.abort();
      await session.finished;
    }
    return this.status();
  }

  async cancel() {
    const session = this.#session;
    if (!session) return;
    if (["waiting", "authenticating"].includes(session.phase)) session.phase = "cancelled";
    session.abort.abort();
    await session.finished;
  }
}
