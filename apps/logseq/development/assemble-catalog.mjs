// Disposable-host acceptance only. This is not a release/publication command.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const [output, helper, mcp] = process.argv.slice(2);
if (
  !output ||
  ![helper, mcp].every((value) => /^localhost:5000\/logseq-(helper|mcp)@sha256:[a-f0-9]{64}$/.test(value))
) {
  throw new Error("Provide a new output directory and the two digest-pinned test-registry images.");
}
const sync =
  "ghcr.io/yshalsager/logseq-selfhost-sync@sha256:354c0913eefbee78a6f6a8b122ef257226b625e9c29708e41518dec61943aef5";
const editor =
  "ghcr.io/yshalsager/logseq-selfhost-web@sha256:46d425b4eafdf5552b22ecefb58ed37d547460f47bec7f25ab77f75520ac4a1d";
const resources = {
  minimum: { cpu: 1, memory: "2GiB", disk: "2GiB" },
  recommended: { cpu: 2, memory: "3GiB", disk: "10GiB" }
};
const data = [
  { id: "graph", mountPath: "/graph", uid: 1000, backup: "filesystem-consistent" },
  { id: "runtime", mountPath: "/runtime", uid: 1000, backup: "reproducible" },
  { id: "sync", mountPath: "/app/data", uid: 65532, backup: "filesystem-consistent" },
  { id: "sync-config", mountPath: "/sync-config", uid: 1000, backup: "reproducible" }
].map(({ uid, ...entry }) => ({
  ...entry,
  owner: "logseq",
  filesystem: { uid, gid: uid, mode: entry.id === "sync-config" ? "0755" : "0700" },
  retention: "preserve"
}));
const origin = { routing: "origin", private: true, public: false, authentik: "unsupported", defaultAuthentik: false };
const manifest = {
  schemaVersion: 1,
  id: "org.scholarserver.logseq",
  name: "Logseq",
  packageVersion: "0.1.0-acceptance.1",
  compatibility: { platform: ">=0.1.0", schema: 1 },
  upstream: { name: "Logseq database graphs", version: "2.0.1", license: "AGPL-3.0" },
  support: { tier: "official", architectures: ["amd64"] },
  delivery: { class: "headless-service", management: "managed" },
  tenancy: { mode: "per-workspace" },
  capabilities: { provides: ["notes.graph", "notes.sync", "mcp.logseq"], requires: ["gateway.mcp"], conflicts: [] },
  variants: [
    {
      id: "browser",
      name: "With browser editor",
      description: "Open your notebook in a private browser editor as well as your devices.",
      recommended: true,
      services: ["helper", "mcp", "sync", "editor"],
      data: data.map((entry) => entry.id),
      resources,
      highlights: ["Private browser editing", "Encrypted sync and AI tools"],
      limitations: ["Requires Tailscale on your devices", "Requires a Logseq account"]
    },
    {
      id: "devices",
      name: "Devices only",
      description: "Use Logseq on your own devices, with a synced server copy for AI tools.",
      recommended: false,
      services: ["helper", "mcp", "sync"],
      data: data.map((entry) => entry.id),
      resources,
      highlights: ["Encrypted sync and AI tools"],
      limitations: ["No browser editor", "Requires a Logseq account and Tailscale"]
    }
  ],
  resources,
  permissions: { networkEgress: ["logseq-account"], hostMounts: [], devices: [] },
  hardening: { readOnlyRoot: true, noNewPrivileges: true, dropCapabilities: ["ALL"] },
  images: Object.entries({ helper, mcp, sync, editor }).map(([service, reference]) => ({ service, reference })),
  data,
  endpoints: [
    {
      id: "app-ui",
      service: "helper",
      port: 8081,
      protocol: "http",
      exposure: "human-optional",
      auth: "platform-session"
    },
    {
      id: "sync",
      service: "sync",
      port: 8787,
      protocol: "http",
      exposure: "human-optional",
      auth: "native-oidc",
      remoteAccess: origin
    },
    {
      id: "editor",
      service: "editor",
      port: 8080,
      protocol: "http",
      exposure: "human-optional",
      auth: "none-private",
      remoteAccess: origin
    },
    {
      id: "mcp",
      service: "mcp",
      port: 7013,
      protocol: "http",
      exposure: "gateway",
      auth: "service-identity",
      gateway: {
        displayName: "Logseq",
        namespace: "logseq",
        hostname: "logseq-mcp",
        credentialData: "runtime",
        credentialFile: "service-token"
      }
    }
  ],
  ui: { mode: "standalone", endpoint: "app-ui", defaultPath: "/configuration" },
  lifecycle: { supportsDisable: true, removeDataDefault: false, rollback: "backup-required" },
  onboarding: {
    readyWhen: "compose-health",
    checklist: [
      "Set up the private connection",
      "Connect your Logseq account",
      "Choose an encrypted notebook",
      "Enable the AI connection"
    ]
  }
};
function service(image, user, memory, health) {
  return {
    image,
    user,
    restart: "unless-stopped",
    read_only: true,
    cap_drop: ["ALL"],
    security_opt: ["no-new-privileges:true"],
    pids_limit: 128,
    mem_limit: memory,
    tmpfs: ["/tmp:rw,noexec,nosuid,nodev,size=64m"],
    networks: ["instance"],
    healthcheck: { test: health, interval: "5s", timeout: "3s", start_period: "30s", retries: 18 }
  };
}
const nodeHealth = (node, port, suffix = "/health") => [
  "CMD",
  node,
  "-e",
  `fetch('http://127.0.0.1:${port}${suffix}').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`
];
const compose = {
  services: {
    helper: {
      ...service(helper, "1000:1000", "1536m", nodeHealth("node", 8081)),
      environment: {
        LOGSEQ_MANAGED_SETUP: "1",
        LOGSEQ_SYNC_CONFIG: "/sync-config",
        SCHOLARSERVER_VARIANT: "${SCHOLARSERVER_VARIANT}"
      },
      volumes: [
        "${SCHOLARSERVER_DATA_GRAPH}:/graph",
        "${SCHOLARSERVER_DATA_GRAPH}:/home/node/logseq",
        "${SCHOLARSERVER_DATA_RUNTIME}:/runtime",
        "${SCHOLARSERVER_DATA_SYNC_CONFIG}:/sync-config"
      ],
      networks: ["instance", "egress", "edge"]
    },
    mcp: {
      ...service(mcp, "1000:1000", "256m", nodeHealth("node", 7013)),
      volumes: ["${SCHOLARSERVER_DATA_RUNTIME}:/runtime:ro"],
      depends_on: { helper: { condition: "service_healthy" } },
      networks: { instance: { aliases: ["logseq-mcp"] } }
    },
    sync: {
      ...service(sync, "65532:65532", "512m", nodeHealth("/nodejs/bin/node", 8787)),
      command: ["/sync-config/launcher.mjs"],
      environment: {
        COGNITO_ISSUER: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_dtagLnju8",
        COGNITO_CLIENT_ID: "69cs1lgme7p8kbgld8n5kseii6",
        COGNITO_JWKS_URL: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_dtagLnju8/.well-known/jwks.json"
      },
      volumes: ["${SCHOLARSERVER_DATA_SYNC}:/app/data", "${SCHOLARSERVER_DATA_SYNC_CONFIG}:/sync-config:ro"],
      networks: ["instance", "egress"],
      depends_on: { helper: { condition: "service_healthy" } }
    },
    editor: service(editor, "101:101", "128m", ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:8080/"])
  },
  networks: {
    instance: { name: "${SCHOLARSERVER_INSTANCE_NETWORK}", internal: true },
    egress: { name: "${SCHOLARSERVER_EGRESS_NETWORK}", internal: false },
    edge: { name: "scholarserver-edge", external: true }
  }
};
await mkdir(output); // Never overwrite an existing package or published version.
await writeFile(path.join(output, "scholarserver-app.yaml"), JSON.stringify(manifest, null, 2));
await writeFile(path.join(output, "compose.yaml"), JSON.stringify(compose, null, 2));
await writeFile(
  path.join(output, "README.md"),
  "Disposable AMD64 acceptance package only. Not for catalog publication. See the apps repository Logseq README, DEVELOPMENT_NOTES and RELEASE_BLOCKED before use.\n"
);
