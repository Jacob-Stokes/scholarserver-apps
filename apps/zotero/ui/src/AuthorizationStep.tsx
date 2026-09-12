import { SetupPanel } from "@scholarserver/ui/setup-pipeline";

type Props = {
  authorized: boolean;
  busy: boolean;
  desktopUrl: string | null;
  embedded: boolean;
  showDesktop: boolean;
  onShowDesktop: (show: boolean) => void;
  onAuthorize: () => void;
  onBack: () => void;
  onContinue: () => void;
};

export function AuthorizationStep(props: Props) {
  const { authorized, busy, desktopUrl, embedded, showDesktop } = props;
  return (
    <SetupPanel
      stage={4}
      total={5}
      title="Approve ScholarServer in Zotero"
      description="Allow approved tools to make changes to your Zotero library."
      back={props.onBack}
      next={authorized ? props.onContinue : props.onAuthorize}
      nextLabel={authorized ? "Continue" : "Request access"}
      nextDisabled={!desktopUrl}
      busy={busy}
    >
      {authorized ? (
        <p role="status">Zotero access is configured. You can revoke it in Zotero’s Advanced settings.</p>
      ) : (
        <div className="ss-stack">
          <p>
            Select Request access, then choose <strong>Always Allow</strong> in Zotero’s prompt. This permits changes to
            every library this Zotero account can edit. A single-use Allow is not enough for ongoing access.
          </p>
          {busy ? <p role="status">Waiting for your approval in Zotero…</p> : null}
          {desktopUrl ? (
            <div className="ss-form-actions">
              {embedded ? (
                <button className="ss-button ss-button-secondary" onClick={() => props.onShowDesktop(!showDesktop)}>
                  {showDesktop ? "Hide Zotero view" : "Show Zotero view"}
                </button>
              ) : null}
              <a className="ss-button ss-button-secondary" href={desktopUrl} target="_blank" rel="noreferrer">
                Open Zotero in a separate tab
              </a>
            </div>
          ) : null}
          {showDesktop && embedded && desktopUrl ? (
            <div className="ss-stack">
              <p className="ss-muted">
                If the view is blank or asks you to sign in again, use the separate-tab link above.
              </p>
              <iframe
                className="ss-zotero-setup-desktop"
                title="Zotero permission approval"
                src={desktopUrl}
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}
        </div>
      )}
    </SetupPanel>
  );
}
