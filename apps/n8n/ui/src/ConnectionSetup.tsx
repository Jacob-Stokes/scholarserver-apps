import { SetupPanel } from "@scholarserver/ui/setup-pipeline";
import { type FormEvent, useState } from "react";

export type ConnectionStatus = {
  connected: boolean;
  phase:
    | "ready"
    | "password-required"
    | "setting-up"
    | "resume"
    | "existing-account"
    | "connection-error"
    | "recovery-required";
  ownerEmail?: string;
};

export function ConnectionSetup({
  status,
  busy,
  onSetup,
  onRefresh
}: {
  status: ConnectionStatus;
  busy: boolean;
  onSetup: (input: { password: string; email?: string; mfaCode?: string }) => Promise<boolean>;
  onRefresh: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [email, setEmail] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [showMfa, setShowMfa] = useState(false);
  const fresh = status.phase === "password-required";
  const existing = status.phase === "existing-account" || status.phase === "connection-error";
  const valid =
    password.length >= 8 && (!fresh || (password === confirmation && /[A-Z]/.test(password) && /\d/.test(password)));
  let submitLabel = "Connect automatically";
  if (fresh) submitLabel = "Finish installation";
  if (busy) submitLabel = "Setting up…";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    const input = { password, ...(existing ? { email } : {}), ...(mfaCode ? { mfaCode } : {}) };
    if (await onSetup(input)) {
      setPassword("");
      setConfirmation("");
      setMfaCode("");
    }
  }

  if (status.phase === "setting-up") return <p role="status">Setting up n8n and connecting your automations…</p>;
  if (status.phase === "recovery-required")
    return (
      <section className="ss-card ss-stack">
        <h2>n8n state needs recovery</h2>
        <p>
          A previous setup exists, but n8n has no owner account. Restore its application data before continuing. No
          account has been reset.
        </p>
        <button className="ss-button" onClick={onRefresh} disabled={busy}>
          Check status
        </button>
      </section>
    );
  return (
    <SetupPanel
      stage={1}
      total={1}
      title={fresh ? "Set your n8n password" : "Finish connecting n8n"}
      description={
        fresh
          ? "ScholarServer will create your local account and connect automations automatically."
          : "Sign in to finish the connection. Your account and workflows will not be replaced."
      }
    >
      {!fresh && status.ownerEmail ? (
        <p>Continue as {status.ownerEmail} using the password you already chose.</p>
      ) : null}
      <form className="ss-stack" onSubmit={(event) => void submit(event)}>
        {existing ? (
          <label>
            Existing n8n owner email
            <input
              className="ss-input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={busy}
            />
          </label>
        ) : null}
        <label>
          Password
          <input
            className="ss-input"
            type="password"
            autoComplete={fresh ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            maxLength={64}
            required
            disabled={busy}
          />
        </label>
        {fresh ? (
          <>
            <p>Use 8–64 characters, including an uppercase letter and a number.</p>
            <label>
              Confirm password
              <input
                className="ss-input"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                disabled={busy}
              />
            </label>
            {confirmation && confirmation !== password ? <p role="alert">The passwords do not match.</p> : null}
          </>
        ) : (
          <details open={showMfa || Boolean(mfaCode)} onToggle={(event) => setShowMfa(event.currentTarget.open)}>
            <summary>Two-factor authentication</summary>
            <label>
              Authentication code
              <input
                className="ss-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                pattern="[0-9]{6}"
                disabled={busy}
              />
            </label>
          </details>
        )}
        <button className="ss-button" disabled={busy || !valid}>
          {submitLabel}
        </button>
      </form>
      <button className="ss-button ss-button-secondary" onClick={onRefresh} disabled={busy}>
        Check status
      </button>
      {fresh ? (
        <p>
          If you use the optional n8n editor later, sign in as {status.ownerEmail}. This is a local account, not an
          email inbox.
        </p>
      ) : null}
    </SetupPanel>
  );
}
