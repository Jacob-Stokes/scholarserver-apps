import { createHash } from "node:crypto";

const target = { kind: "app" };
const submit = (id, label, fieldIds = [], extra = {}) => ({ id, label, kind: "submit", fieldIds, target, ...extra });

export function logseqConfiguration(status, graphs = []) {
  const stageIds = status.addressRequired
    ? ["connection", "account", "notebook", "ready"]
    : ["account", "notebook", "ready"];
  let stageId = "account";
  if (status.addressRequired && !status.syncAddress) stageId = "connection";
  else if (status.ready) stageId = "ready";
  else if (status.accountConnected) stageId = "notebook";
  const revision = createHash("sha256")
    .update(
      JSON.stringify([
        status.syncAddress,
        status.accountConnected,
        status.account?.state,
        status.graph,
        status.phase,
        status.ready
      ])
    )
    .digest("hex");
  const section = {
    version: 1,
    id: "setup",
    revision,
    title: "Notebook connection",
    description: "Connect an encrypted Logseq 2 database notebook. An existing notebook is not replaced.",
    stage: {
      id: stageId,
      label: { connection: "Private connection", account: "Account", notebook: "Notebook", ready: "Connected" }[
        stageId
      ],
      index: stageIds.indexOf(stageId) + 1,
      total: stageIds.length
    },
    pollAfterMs: stageId === "ready" ? 30000 : 3000,
    notices: [],
    fields: [],
    values: {},
    summary: [],
    actions: []
  };
  if (status.error) section.notices.push({ kind: "error", text: status.error });
  if (status.account?.error) section.notices.push({ kind: "error", text: status.account.error });
  if (stageId === "connection") {
    section.endpointIds = status.browserAvailable ? ["sync", "editor"] : ["sync"];
    section.fields = [
      {
        id: "url",
        label: "Private sync address",
        type: "url",
        required: true,
        sourceEndpointId: "sync",
        hint: "Prepare the sync endpoint in Access. Its selected address appears here when ready."
      }
    ];
    section.actions = [submit("configure-address", "Save private sync address", ["url"])];
    section.notices.push({ kind: "info", text: "Keep Tailscale connected on devices using this notebook." });
  } else if (stageId === "account") {
    section.notices.push({
      kind: "info",
      text: "Logseq owns account sign-in and notebook encryption. Account consent happens in Logseq."
    });
    if (status.account?.state === "waiting") {
      section.outputs = [{ id: "sign-in-url", label: "Open Logseq sign-in", sensitive: true, kind: "link" }];
      section.fields = [
        { id: "returnLink", label: "Full return link", type: "secret", required: true, autocomplete: "off" }
      ];
      section.actions = [
        submit("complete-sign-in", "Finish sign-in", ["returnLink"]),
        submit("cancel-sign-in", "Cancel sign-in")
      ];
    } else if (status.account?.state === "authenticating") {
      section.notices.push({ kind: "info", text: "Logseq is completing sign-in. Check this stage before retrying." });
    } else {
      section.actions = [submit("start-sign-in", "Start Logseq sign-in")];
    }
  } else if (stageId === "notebook") {
    if (status.graph) {
      section.summary = [{ label: "Selected notebook", value: status.graph }];
      if (status.canRetry) {
        section.fields = [
          { id: "password", label: "Notebook encryption password", type: "secret", required: true, autocomplete: "off" }
        ];
        section.actions = [
          submit("retry-download", "Retry download", ["password"], {
            confirmation: {
              title: "Retry the incomplete download",
              text: "The incomplete server copy moves to a recovery folder. The remote notebook is not changed."
            }
          })
        ];
      } else {
        section.notices.push({
          kind: "info",
          text: "The selected notebook is being downloaded or reopened. Do not start another selection."
        });
      }
    } else {
      const options = graphs
        .filter((graph) => graph?.["graph-e2ee?"] === true && graph?.["graph-ready-for-use?"] === true)
        .map((graph) => ({
          value: graph["graph-id"],
          label: typeof graph["graph-name"] === "string" ? graph["graph-name"].slice(0, 120) : null
        }))
        .filter((option) => typeof option.value === "string" && typeof option.label === "string");
      section.fields = [
        { id: "remoteId", label: "Encrypted notebook", type: "select", required: true, options },
        { id: "password", label: "Notebook encryption password", type: "secret", required: true, autocomplete: "off" }
      ];
      section.actions = [
        { id: "find-notebooks", label: "Find my notebooks", kind: "navigate", target },
        submit("join-notebook", "Download notebook", ["remoteId", "password"], {
          disabled: options.length === 0,
          ...(options.length === 0 ? { reason: "Find an encrypted notebook first." } : {})
        })
      ];
      if (!options.length)
        section.notices.push({
          kind: "info",
          text: "Find an encrypted notebook in Logseq, or create and upload one there first."
        });
    }
  } else {
    section.summary = [
      { label: "Notebook", value: status.graph || "Not reported" },
      { label: "Sync address", value: status.syncAddress || "Not reported" },
      { label: "Sync", value: status.sync || "Not checked" }
    ];
    section.actions = [{ id: "check-connection", label: "Check connection", kind: "read", target }];
  }
  return section;
}

export async function attachCurrentSectionWhenAvailable(receipt, readSection) {
  if (receipt.status !== "succeeded") return receipt;
  try {
    return { ...receipt, section: await readSection() };
  } catch {
    // The receipt is authoritative; a subsequent read failure does not reject the write.
    return receipt;
  }
}
