import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { SetupPanel, SetupProgress } from "@scholarserver/ui/setup-pipeline";
import { useState } from "react";

const options = [
  {
    id: "sync-only",
    name: "Self-hosted sync only",
    detail: "Sync Anki on your own devices. No browser study or AI card tools."
  },
  {
    id: "ankiweb-desktop",
    name: "Browser desktop with AnkiWeb",
    detail: "Study in your browser and connect AI tools. Use your existing AnkiWeb account."
  },
  {
    id: "self-hosted-desktop",
    name: "Browser desktop with self-hosted sync",
    detail: "Keep a sync server and a separate desktop copy on your server."
  }
];
const storageKey = "scholarserver-anki-setup-draft";
function initialChoice() {
  try {
    const saved = localStorage.getItem(storageKey);
    return options.some((option) => option.id === saved) ? saved! : "ankiweb-desktop";
  } catch {
    return "ankiweb-desktop";
  }
}

/** Local design preview: deliberately has no installation or account endpoint. */
export function App() {
  const [option, setOption] = useState(initialChoice);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  function save() {
    setFeedback(null);
    setError(null);
    try {
      localStorage.setItem(storageKey, option);
      setFeedback("Draft saved in this browser. No services or accounts have been changed.");
    } catch {
      setError("Could not save the draft. Your current choice is still shown; try again.");
    }
  }
  const desktop = option !== "sync-only";
  const selfHosted = option !== "ankiweb-desktop";
  return (
    <ApplicationScreen
      name="Anki"
      description="Study flashcards and connect your learning tools."
      tabs={[{ id: "configuration", label: "Setup options" }]}
      currentTab="configuration"
      onNavigate={() => {}}
      error={error}
      status={<span className="ss-badge">Design preview</span>}
    >
      <p>This saves a local setup draft. Installation, sign-in and AI access are not connected yet.</p>
      <SetupProgress
        stages={[
          { id: "choice", label: "Choose your setup" },
          { id: "connect", label: "Connect devices" },
          { id: "verify", label: "Check sync" }
        ]}
        current="choice"
      />
      <SetupPanel
        stage={1}
        total={3}
        title="Choose your setup"
        description="A sync server stores a copy for your devices. Browser study and AI card tools also need the Anki desktop."
      >
        <div className="ss-stack">
          {options.map((choice) => (
            <label key={choice.id} className="anki-choice">
              <input
                type="radio"
                name="setup-option"
                checked={option === choice.id}
                onChange={() => {
                  setOption(choice.id);
                  setFeedback(null);
                }}
              />
              <span>
                <strong>{choice.name}</strong>
                <small>{choice.detail}</small>
              </span>
            </label>
          ))}
          <button className="ss-button" onClick={save}>
            Save setup draft
          </button>
          {feedback ? <p role="status">{feedback}</p> : null}
        </div>
      </SetupPanel>
      <section className="ss-card ss-stack">
        <h2>After installation</h2>
        {selfHosted ? (
          <p>
            Choose a private or HTTPS sync address in ScholarServer Access. Each device needs this address and its
            separate sync account. Browser sign-in cannot replace the sync account.
          </p>
        ) : (
          <p>
            Open the browser desktop and sign in to AnkiWeb inside Anki. ScholarServer does not ask for your AnkiWeb
            password.
          </p>
        )}
        {desktop ? (
          <p>
            Open the desktop through ScholarServer Access. Keep Anki open for AI tools. Start with reading cards; card
            creation requires a separate operator step. Editing, deletion and automatic sync are unavailable in this
            draft.
          </p>
        ) : (
          <p>
            Study and edit cards in Anki on your own devices. No desktop or AI card connection is installed by this
            option.
          </p>
        )}
        <p>
          Back up your collection and media before the first sync. If Anki asks which copy to keep, stop and check both
          copies before choosing upload or download.
        </p>
        <p>
          Desktop data and sync-server data remain separate. Future backups must stop their writers and include media
          and private settings. Restoring a server does not restore AnkiWeb.
        </p>
      </section>
    </ApplicationScreen>
  );
}
