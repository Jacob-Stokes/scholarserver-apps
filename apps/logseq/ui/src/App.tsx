import { ApplicationScreen, applicationManagementPath } from "@scholarserver/ui/application-screen";

// Installed entry points redirect before mounting. This also gives an unprefixed
// development URL a way back to Manager without recreating its settings forms.
export function App() {
  const management = applicationManagementPath(window.location.pathname);
  return (
    <ApplicationScreen
      name="Logseq"
      description="Manage your notebook connection in Manager."
      tabs={[]}
      currentTab="manager"
      onNavigate={() => window.location.assign(management)}
    >
      <a className="ss-button" href={management}>
        Open in Manager
      </a>
    </ApplicationScreen>
  );
}
