import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { SetupPanel, SetupProgress } from "@scholarserver/ui/setup-pipeline";
import { useState } from "react";
import { DocumentAccess } from "./DocumentAccess";

export function App() {
  const [tab, setTab] = useState("overview");
  return (
    <ApplicationScreen
      name="Paperless"
      description="Find and read your archived documents."
      tabs={[
        { id: "overview", label: "Overview" },
        { id: "setup", label: "Setup" }
      ]}
      currentTab={tab}
      onNavigate={setTab}
      status={<span className="ss-badge">Draft · not installable</span>}
    >
      {tab === "overview" ? (
        <section className="ss-card ss-stack">
          <h2>Your document archive</h2>
          <p>
            This draft can search and read documents through a restricted Paperless account. It does not upload, delete
            or change documents.
          </p>
          <p>
            Original files, OCR text and permissions remain in Paperless. AI access uses one connected account, not each
            visitor’s native identity.
          </p>
          <p role="status">
            Uploads and import tracking are not connected yet. Never retry an import whose outcome is unknown without
            checking Paperless first.
          </p>
        </section>
      ) : (
        <>
          <SetupProgress
            stages={[
              { id: "review", label: "Review draft" },
              { id: "verify", label: "Verify installation" }
            ]}
            current="review"
          />
          <SetupPanel
            stage={1}
            total={2}
            title="Review before connecting"
            description="No account or service is created by this screen."
          >
            <p>
              Use a dedicated account with access only to the documents you want AI clients to read. Do not use an
              administrator token.
            </p>
            <p>
              Account setup, encrypted backup and recovery still need installation tests. Keep the original archive and
              its backups.
            </p>
            <a href="https://docs.paperless-ngx.com/usage/" target="_blank" rel="noreferrer">
              Paperless usage guide
            </a>
          </SetupPanel>
          <DocumentAccess />
        </>
      )}
    </ApplicationScreen>
  );
}
