import { createHash } from "node:crypto";

const target = { kind: "app" };
const submit = (id, label, fieldIds = [], extra = {}) => ({ id, label, kind: "submit", fieldIds, target, ...extra });
const attachmentAccessLabels = {
  "metadata-only": "Citation data only",
  "zotero-storage": "Zotero Storage",
  webdav: "WebDAV",
  "linked-folder": "Shared linked folder",
  "server-only": "References only"
};
const downloadLabels = { "on-demand": "When opened", "on-sync": "During every sync" };

export function zoteroConfiguration(status, draft = {}) {
  const online = status.connectionMode === "online-library";
  const editingStorage = status.state === "ready" && draft.editStorage === true;
  const stages = online ? ["account", "storage", "ready"] : ["account", "storage", "authorization", "ready"];
  let stageId = "account";
  if (status.state === "ready") stageId = editingStorage ? "storage" : "ready";
  else if (status.state === "authorization-required") stageId = "authorization";
  else if (status.accountConnected && status.state === "storage-required") stageId = "storage";
  else if (!online && status.userId && status.desktop !== "available") stageId = "recovery";
  const revision = createHash("sha256")
    .update(
      JSON.stringify([
        status.connectionMode,
        status.state,
        status.accountConnected,
        status.userId,
        status.storageMode,
        status.downloadMode,
        status.groupFileSync,
        status.localApi
      ])
    )
    .digest("hex");
  const section = {
    version: 1,
    id: "setup",
    revision,
    title: "Library connection",
    description: online
      ? "Connect your zotero.org library directly."
      : "Connect the Zotero desktop and choose attachment access.",
    stage: {
      id: stageId,
      label: {
        account: "Account",
        storage: "Attachment access",
        authorization: "Desktop authorization",
        ready: "Connected",
        recovery: "Desktop unavailable"
      }[stageId],
      index: stageId === "recovery" ? 1 : stages.indexOf(stageId) + 1,
      total: stages.length
    },
    pollAfterMs: stageId === "account" ? 3000 : 30000,
    notices: [],
    fields: [],
    values: {},
    summary: [],
    actions: []
  };
  if (!online) section.endpointIds = ["desktop"];
  if (status.lastError) section.notices.push({ kind: "error", text: status.lastError });
  if (stageId === "recovery") {
    section.notices.push({
      kind: "warning",
      text: "A Zotero account was previously saved, but the desktop is unavailable. Restore it before continuing; account linking is not replayed automatically."
    });
    return section;
  }
  if (stageId === "ready") {
    delete section.stage;
    section.summary = [
      { label: "Account", value: status.username || status.userId || "Not reported" },
      { label: "Library mode", value: online ? "Online library only" : "Complete Zotero workspace" },
      {
        label: "Attachment access",
        value: attachmentAccessLabels[status.storageMode] || status.storageMode || "Not configured"
      },
      { label: "File downloads", value: downloadLabels[status.downloadMode] || status.downloadMode || "Not applicable" }
    ];
    if (status.storageMode === "linked-folder") {
      section.summary.push({ label: "Linked folder", value: status.linkedFolder || "Not reported" });
      if (status.linkedFolderAutomation === false) {
        section.notices.push({
          kind: "warning",
          text: "Linked-folder automation is not enabled. Check ZotMoov in the Zotero desktop."
        });
      }
    }
    if (online) {
      section.summary.push(
        { label: "Make changes", value: status.permissions?.write ? "Allowed" : "Read only" },
        { label: "Group libraries", value: String(status.permissions?.groups ?? "None") }
      );
    } else {
      section.summary.push({
        label: "Local API",
        value: status.localApi === "authorized" ? "Approved" : status.localApi || "Not checked"
      });
    }
    section.fields = [{ id: "editStorage", label: "Change attachment settings", type: "boolean" }];
    section.values = { editStorage: false };
    section.actions = [{ id: "check-connection", label: "Check connection", kind: "read", target }];
    if (!online) {
      section.actions.push(
        submit("sync-now", "Sync now", [], {
          disabled: status.syncInProgress === true,
          ...(status.syncInProgress ? { reason: "A sync is already running." } : {})
        })
      );
    }
    section.notices.push({
      kind: "info",
      text: online
        ? "Zotero account approval and group-library files remain managed by Zotero. AI access is reviewed separately."
        : "A saved connection does not confirm initial sync, attachment delivery, or AI access. Check those separately."
    });
    return section;
  }
  if (stageId === "account") {
    if (online) {
      section.fields = [
        {
          id: "apiKey",
          label: "Zotero Web API key",
          type: "secret",
          required: true,
          autocomplete: "off",
          hint: "Create a key in Zotero account settings. It is never returned in status."
        }
      ];
      section.actions = [submit("connect-online-library", "Connect online library", ["apiKey"])];
    } else {
      const session = status.accountLink;
      if (session?.state === "pending") {
        section.outputs = [{ id: "account-login-url", label: "Zotero sign-in link", sensitive: true, kind: "link" }];
        section.notices.push({
          kind: "info",
          text: "Complete approval in Zotero. ScholarServer observes the same pending request across page reloads."
        });
      } else if (session?.state === "starting" || session?.state === "interrupted") {
        section.notices.push({
          kind: "warning",
          text: "Account linking may already have started. Open Zotero and check its account before starting a new request."
        });
      } else {
        section.actions = [submit("start-account-link", "Connect Zotero account")];
      }
      section.endpointIds = ["desktop"];
    }
    return section;
  }
  if (stageId === "storage") {
    const defaultMode = online ? "metadata-only" : "zotero-storage";
    const selectedMode = typeof draft.storageMode === "string" ? draft.storageMode : status.storageMode || defaultMode;
    section.fields = [
      {
        id: "storageMode",
        label: online ? "Attachment access" : "Storage option",
        type: "select",
        required: true,
        options: online
          ? [
              { value: "metadata-only", label: "Citation data only" },
              { value: "zotero-storage", label: "Zotero Storage files on demand" }
            ]
          : [
              { value: "zotero-storage", label: "Zotero Storage" },
              { value: "webdav", label: "WebDAV (personal-library files)" },
              { value: "linked-folder", label: "Shared linked folder" },
              { value: "server-only", label: "References only" }
            ]
      }
    ];
    section.values = { storageMode: selectedMode };
    if (editingStorage) {
      delete section.stage;
      section.title = "Attachment settings";
      section.description = "Changes apply to this connected library. Account sign-in is kept.";
      section.fields.unshift({ id: "editStorage", label: "Change attachment settings", type: "boolean" });
      section.values.editStorage = true;
    }
    if (!online) {
      section.fields.push({
        id: "downloadMode",
        label: "Download attachments",
        type: "select",
        options: [
          { value: "on-demand", label: "When opened" },
          { value: "on-sync", label: "During every sync" }
        ]
      });
      section.fields.push({
        id: "groupFileSync",
        label: "Use Zotero Storage for group-library files",
        type: "boolean"
      });
      section.values.downloadMode = status.downloadMode || "on-demand";
      section.values.groupFileSync = status.groupFileSync === true;
    }
    if (selectedMode === "webdav" && !online) {
      section.fields.push({ id: "url", label: "WebDAV URL", type: "url", required: true });
      section.fields.push({
        id: "username",
        label: "WebDAV username",
        type: "text",
        required: true,
        autocomplete: "username"
      });
      section.fields.push({
        id: "password",
        label: "WebDAV password",
        type: "secret",
        required: true,
        autocomplete: "current-password"
      });
      section.notices.push({
        kind: "warning",
        text: "WebDAV carries personal-library attachments only. Group-library files require Zotero Storage."
      });
    }
    section.actions = [
      submit(
        "save-storage",
        "Save attachment access",
        section.fields.map((field) => field.id)
      )
    ];
    return section;
  }
  section.notices.push({
    kind: "info",
    text: "Approve ongoing local API access in Zotero. Choose Always Allow; a one-time grant is insufficient."
  });
  section.actions = [
    submit("authorize-local", "Request Zotero authorization", [], {
      confirmation: {
        title: "Authorize ScholarServer",
        text: "Zotero will ask you to approve ongoing access in its own interface."
      }
    })
  ];
  return section;
}

export async function attachCurrentSectionWhenAvailable(receipt, readSection) {
  if (receipt.status !== "succeeded") return receipt;
  try {
    return { ...receipt, section: await readSection() };
  } catch {
    // A failed status refresh after saving cannot make replay safe.
    return receipt;
  }
}
