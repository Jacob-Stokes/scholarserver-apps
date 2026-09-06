import { SetupPanel } from "@scholarserver/ui/setup-pipeline";
import type { Status } from "./setup-model";

type Props = {
  online: boolean;
  status: Pick<Status, "accountConnected" | "username" | "userId">;
  busy: boolean;
  checkingAccount: boolean;
  authorizationUrl: string | null;
  onlineApiKey: string;
  onApiKeyChange: (value: string) => void;
  onConnectOnline: () => void;
  onConnectAccount: () => void;
  onContinue: () => void;
};
export function AccountStep({
  online,
  status,
  busy,
  checkingAccount,
  authorizationUrl,
  onlineApiKey,
  onApiKeyChange,
  onConnectOnline,
  onConnectAccount,
  onContinue
}: Props) {
  return (
    <SetupPanel
      stage={1}
      total={online ? 3 : 5}
      title="Connect your Zotero account"
      description={
        online
          ? "Create a dedicated key in Zotero, then paste it here. ScholarServer stores it privately on this server."
          : "Sign in on Zotero's website. ScholarServer never receives your Zotero password."
      }
      next={status.accountConnected ? onContinue : undefined}
      nextLabel="Choose attachment access"
    >
      {status.accountConnected ? (
        <div className="ss-callout">
          Connected as <strong>{status.username ?? status.userId}</strong>.{" "}
          {online
            ? "ScholarServer uses a dedicated Zotero key that you can revoke at any time."
            : "Zotero stores its own account token."}
        </div>
      ) : online ? (
        <div className="ss-stack">
          <div className="ss-callout">
            <strong>Create a ScholarServer key in Zotero.</strong> Allow library and notes access. Enable write access
            if you want AI tools to create or edit citations and notes.
          </div>
          <div className="ss-form-actions">
            <a
              className="ss-button ss-button-secondary"
              href="https://www.zotero.org/settings/keys/new?name=ScholarServer&library_access=1&notes_access=1"
              target="_blank"
              rel="noreferrer"
            >
              Create key on Zotero
            </a>
          </div>
          <label className="ss-field">
            Zotero API key
            <input
              className="ss-input"
              type="password"
              autoComplete="off"
              value={onlineApiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
            />
            <span className="ss-field-help">
              Copy the key Zotero shows after you save it. It is sent only to this ScholarServer.
            </span>
          </label>
          <div className="ss-form-actions">
            <button className="ss-button" disabled={busy || onlineApiKey.trim().length < 16} onClick={onConnectOnline}>
              {busy ? <span className="ss-spinner" /> : null}Connect online library
            </button>
          </div>
        </div>
      ) : (
        <div className="ss-form-actions">
          <button className="ss-button" disabled={busy || checkingAccount} onClick={onConnectAccount}>
            {busy || checkingAccount ? <span className="ss-spinner" /> : null}
            {checkingAccount ? "Waiting for approval…" : "Connect Zotero account"}
          </button>
          {authorizationUrl ? (
            <a className="ss-button ss-button-secondary" href={authorizationUrl} target="_blank" rel="noreferrer">
              Open Zotero sign-in
            </a>
          ) : null}
        </div>
      )}
    </SetupPanel>
  );
}
