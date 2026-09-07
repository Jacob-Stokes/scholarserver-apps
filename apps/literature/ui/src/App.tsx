import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { SetupPanel } from "@scholarserver/ui/setup-pipeline";

export function App() {
  return (
    <ApplicationScreen
      name="Literature"
      description="Find Crossref and arXiv metadata. Papers stay with their sources."
      tabs={[]}
      currentTab="review"
      onNavigate={() => {}}
      status={<span className="ss-badge">Draft · connection not tested</span>}
    >
      <SetupPanel
        stage={1}
        total={1}
        title="Review the connector before enabling it"
        description="This is a setup preview, not an installed or connected service."
      >
        <p>
          No upstream account or desktop software is required for these public metadata tools. Gateway access still
          needs an instance-specific service identity.
        </p>
        <p>
          Crossref contact email is optional and recommended. The draft accepts CROSSREF_CONTACT on the server; it is
          sent to Crossref in the client identification header. There is no browser save action yet.
        </p>
        <p>
          Queries leave your server for the selected provider. Do not include private research information. No query
          history, paper cache or library is created.
        </p>
        <p>
          Search results are candidates, not confirmed bibliography matches. The reported arXiv version is not a
          complete version history. Links do not grant permission to reuse a paper.
        </p>
        <p>
          Only one connector process may call arXiv for now. Its rate policy covers all machines under your control;
          coordinating other clients remains a release gate.
        </p>
        <p>
          <a href="https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/">
            Crossref access requirements
          </a>{" "}
          · <a href="https://info.arxiv.org/help/api/tou.html">arXiv API terms</a>
        </p>
      </SetupPanel>
    </ApplicationScreen>
  );
}
