// One definition for disposable acceptance and the explicitly labelled beta.
export function logseqPackage({ helper, mcp, sync, version, architectures = ["amd64"], beta = false }) {
  if (
    !/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version) ||
    !architectures.length ||
    architectures.some((arch) => !["amd64", "arm64"].includes(arch))
  ) {
    throw new Error("Provide a package version and supported native architectures.");
  }
  if (![helper, mcp, sync].every((value) => typeof value === "string" && /@sha256:[a-f0-9]{64}$/.test(value))) {
    throw new Error("Logseq requires immutable image references.");
  }
  const editor =
    "ghcr.io/yshalsager/logseq-selfhost-web@sha256:46d425b4eafdf5552b22ecefb58ed37d547460f47bec7f25ab77f75520ac4a1d";
  const resources = {
    minimum: { cpu: 1, memory: "2GiB", disk: "2GiB" },
    recommended: { cpu: 2, memory: "3GiB", disk: "10GiB" }
  };
  const data = [
    { id: "graph", mountPath: "/home/node/logseq", uid: 1000, backup: "filesystem-consistent" },
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
    name: beta ? "Logseq (Beta)" : "Logseq",
    presentation: {
      details: { tags: ["Notes", "Knowledge graphs", "Sync"] },
      ...(beta
        ? {
            icon: {
              path: "assets/icons/logseq.webp",
              mediaType: "image/webp",
              attribution: {
                name: "selfh.st/icons",
                url: "https://selfh.st/icons/",
                license: "CC-BY-4.0",
                licenseUrl: "https://github.com/selfhst/icons/blob/main/LICENSE"
              }
            }
          }
        : {})
    },
    packageVersion: version,
    compatibility: { platform: ">=0.1.0", schema: 1 },
    upstream: { name: "Logseq database graphs", version: "2.0.1", license: "AGPL-3.0" },
    support: { tier: "official", architectures },
    delivery: { class: "headless-service", management: "managed" },
    tenancy: { mode: "per-workspace" },
    capabilities: { provides: ["notes.graph", "notes.sync", "mcp.logseq"], requires: ["gateway.mcp"], conflicts: [] },
    variants: [
      {
        id: "browser",
        name: "With browser editor",
        description: "Beta: Logseq 2 database notebooks with a private browser editor, encrypted sync and AI tools.",
        recommended: true,
        services: ["helper", "mcp", "sync", "editor"],
        data: data.map((entry) => entry.id),
        resources,
        highlights: ["Private browser editing", "Encrypted sync and AI tools"],
        limitations: [
          "Beta: use a disposable notebook first",
          "Logseq 2 database graphs only; not legacy Markdown graphs",
          "Requires Tailscale and a Logseq account",
          "Physical-device and public AI sign-in acceptance remain incomplete"
        ]
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
        limitations: [
          "Beta: use a disposable notebook first",
          "No browser editor",
          "Logseq 2 database graphs only",
          "Requires a Logseq account and Tailscale"
        ]
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
          SCHOLARSERVER_VARIANT: "${SCHOLARSERVER_VARIANT}"
        },
        expose: ["8081"],
        volumes: [
          "${SCHOLARSERVER_DATA_GRAPH}:/home/node/logseq",
          "${SCHOLARSERVER_DATA_RUNTIME}:/runtime",
          "${SCHOLARSERVER_DATA_SYNC_CONFIG}:/sync-config"
        ],
        networks: ["instance", "egress", "edge"]
      },
      mcp: {
        ...service(mcp, "1000:1000", "256m", nodeHealth("node", 7013)),
        expose: ["7013"],
        volumes: ["${SCHOLARSERVER_DATA_RUNTIME}:/runtime:ro"],
        networks: { instance: { aliases: ["logseq-mcp"] } }
      },
      sync: {
        ...service(sync, "65532:65532", "512m", nodeHealth("/nodejs/bin/node", 8787)),
        expose: ["8787"],
        volumes: ["${SCHOLARSERVER_DATA_SYNC}:/app/data", "${SCHOLARSERVER_DATA_SYNC_CONFIG}:/sync-config:ro"],
        networks: ["instance", "egress"]
      },
      editor: {
        ...service(editor, "101:101", "128m", ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:8080/"]),
        expose: ["8080"]
      }
    },
    networks: {
      instance: { name: "${SCHOLARSERVER_INSTANCE_NETWORK}", internal: true },
      egress: { name: "${SCHOLARSERVER_EGRESS_NETWORK}", internal: false },
      edge: { name: "scholarserver-edge", external: true }
    }
  };
  return { manifest, compose };
}
