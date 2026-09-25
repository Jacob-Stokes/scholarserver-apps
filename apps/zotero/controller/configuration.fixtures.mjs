import { zoteroConfiguration } from "./configuration.mjs";
import { desktopWorkspaceStatus, onlineLibraryStatus } from "./status-model.mjs";

function online(config = null, account = null) {
  return onlineLibraryStatus({ config, account, accountError: null, lastError: null, variant: "online-library" });
}

function desktop(config = null, engine = null, localApi = "not-configured", desktopState = "available") {
  return {
    ...desktopWorkspaceStatus({
      config,
      desktop: desktopState,
      localApi,
      version: "10.0.1",
      engine,
      lastError: null,
      variant: "complete-workspace"
    }),
    accountLink: { state: "idle" }
  };
}

export const zoteroConfigurationFixtures = [
  zoteroConfiguration(online()),
  zoteroConfiguration(
    online({ mode: "online-library", userId: "123" }, { userId: "123", permissions: { library: true } })
  ),
  zoteroConfiguration(
    online(
      { mode: "online-library", userId: "123", storageMode: "metadata-only" },
      { userId: "123", permissions: { library: true } }
    )
  ),
  zoteroConfiguration(desktop(null, { accountConnected: false })),
  zoteroConfiguration({
    ...desktop(null, { accountConnected: false }),
    accountLink: { state: "pending", loginUrl: "https://www.zotero.org/login?token=secret" }
  }),
  zoteroConfiguration(desktop({ userId: "123" }, { accountConnected: true, userId: "123" })),
  zoteroConfiguration(desktop({ userId: "123" }, { accountConnected: true, userId: "123" }), { storageMode: "webdav" }),
  zoteroConfiguration(
    desktop({ userId: "123", storageMode: "webdav" }, { accountConnected: true, userId: "123" }, "read-only")
  ),
  zoteroConfiguration(
    desktop(
      { userId: "123", storageMode: "zotero-storage" },
      { accountConnected: true, userId: "123", downloadMode: "on-demand" },
      "authorized"
    )
  ),
  zoteroConfiguration(desktop({ userId: "123", storageMode: "zotero-storage" }, null, "unavailable", "unavailable"))
];
