import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { SetupPanel } from "@scholarserver/ui/setup-pipeline";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "@scholarserver/ui/styles.css";
import "@scholarserver/ui/appearance";

export function App() {
  const [tab, setTab] = useState("overview");
  return (
    <ApplicationScreen
      name="Stirling PDF"
      description="Inspect PDFs and make rotated copies."
      status={<span className="ss-badge">Draft · not installed</span>}
      tabs={[
        { id: "overview", label: "Overview" },
        { id: "setup", label: "Setup" }
      ]}
      currentTab={tab}
      onNavigate={setTab}
    >
      {tab === "overview" ? (
        <section className="ss-card ss-stack">
          <h2>Review the draft</h2>
          <p>The PDF workspace is not connected yet. No files are uploaded from this preview.</p>
          <p>
            The proposed AI tools inspect and rotate PDFs under 1 MB. Originals are kept separately. Merge and split are
            not included.
          </p>
          <p>PDF text is untrusted. Rotating a signed PDF can invalidate its signature on the copy.</p>
          <button className="ss-button" onClick={() => setTab("setup")}>
            Review setup requirements
          </button>
        </section>
      ) : (
        <SetupPanel
          stage={1}
          total={1}
          title="Approval needed"
          description="The selected release includes licensed components. Confirm usage rights before installation."
        >
          <p>
            No cloud account or desktop software is needed for the proposed web workspace. A suitable Stirling User
            License may be required.
          </p>
          <p>
            After release checks, create a dedicated account in Stirling. Its API key stays in a private server file,
            never in this preview.
          </p>
          <p>
            Choose where to open the native PDF workspace using ScholarServer’s access settings. No access route is
            created by this draft.
          </p>
          <details>
            <summary>Technical review</summary>
            <p>
              Native MCP reuse, private credentials, backup recovery and signed or encrypted PDF behaviour still need
              real runtime checks.
            </p>
          </details>
        </SetupPanel>
      )}
    </ApplicationScreen>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
