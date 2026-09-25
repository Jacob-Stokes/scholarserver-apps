import { logseqConfiguration } from "./configuration.mjs";

function status(overrides = {}) {
  return {
    phase: "setup",
    addressRequired: true,
    syncAddress: null,
    browserAvailable: true,
    ready: false,
    sync: "unavailable",
    graph: null,
    canRetry: false,
    accountConnected: false,
    account: { state: "idle" },
    error: null,
    updatedAt: "2026-09-25T00:00:00.000Z",
    ...overrides
  };
}

export const logseqConfigurationFixtures = [
  logseqConfiguration(status()),
  logseqConfiguration(status({ syncAddress: "https://logseq.example.ts.net:12345" })),
  logseqConfiguration(
    status({
      syncAddress: "https://logseq.example.ts.net:12345",
      account: {
        state: "waiting",
        authorizationUrl: "https://logseq-prod.auth.us-east-1.amazoncognito.com/oauth2/authorize?state=secret"
      }
    })
  ),
  logseqConfiguration(status({ syncAddress: "https://logseq.example.ts.net:12345", accountConnected: true }), [
    {
      "graph-id": "00000000-0000-4000-8000-000000000001",
      "graph-name": "Research",
      "graph-e2ee?": true,
      "graph-ready-for-use?": true
    }
  ]),
  logseqConfiguration(
    status({
      syncAddress: "https://logseq.example.ts.net:12345",
      accountConnected: true,
      phase: "downloading",
      graph: "Research"
    })
  ),
  logseqConfiguration(
    status({
      syncAddress: "https://logseq.example.ts.net:12345",
      accountConnected: true,
      phase: "needs-attention",
      graph: "Research",
      canRetry: true
    })
  ),
  logseqConfiguration(
    status({
      syncAddress: "https://logseq.example.ts.net:12345",
      accountConnected: true,
      phase: "ready",
      graph: "Research",
      ready: true,
      sync: "up-to-date"
    })
  )
];
