var ScholarServerBridge;

function install() {}
function uninstall() {}

async function startup() {
  await Zotero.initializationPromise;

  const bridgeRoot = "/runtime/zotero-bridge";
  const requestsPath = PathUtils.join(bridgeRoot, "requests");
  const responsesPath = PathUtils.join(bridgeRoot, "responses");
  const storageModes = new Set(["zotero-storage", "webdav", "linked-folder", "server-only"]);
  const downloadModes = new Set(["on-sync", "on-demand"]);

  ScholarServerBridge = { stopped: false };
  await IOUtils.makeDirectory(requestsPath, { createAncestors: true, ignoreExisting: true });
  await IOUtils.makeDirectory(responsesPath, { createAncestors: true, ignoreExisting: true });
  Zotero.Prefs.set("httpServer.enabled", true);
  Zotero.Prefs.set("httpServer.localAPI.enabled", true);

  function response(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function errorMessage(error) {
    if (error && typeof error.error === "string") return error.error;
    if (error instanceof Error && error.message) return error.message;
    return String(error || "Zotero setup failed");
  }

  async function status() {
    let accountConnected = false;
    try {
      accountConnected = !!(await Zotero.Sync.Data.Local.getAPIKey());
    } catch {}
    return response({
      state: accountConnected ? "connected" : "account-required",
      accountConnected,
      userId: Zotero.Users.getCurrentUserID() || null,
      username: Zotero.Users.getCurrentUsername() || Zotero.Prefs.get("sync.server.username") || null,
      automaticSync: Zotero.Prefs.get("sync.autoSync"),
      storageEnabled: Zotero.Prefs.get("sync.storage.enabled"),
      storageProtocol: Zotero.Prefs.get("sync.storage.protocol"),
      storageVerified: Zotero.Prefs.get("sync.storage.verified"),
      downloadMode: Zotero.Prefs.get("sync.storage.downloadMode.personal"),
      groupFileSync: Zotero.Prefs.get("sync.storage.groups.enabled"),
      linkedFolder: Zotero.Prefs.get("baseAttachmentPath") || null,
      linkedFolderAutomation: !!Zotero.Prefs.get("extensions.zotmoov.enable_automove"),
      syncInProgress: !!Zotero.Sync.Runner.syncInProgress
    });
  }

  async function startAccountLink() {
    const session = await Zotero.Sync.Runner.startLoginSession();
    if (!session || typeof session.sessionToken !== "string" || typeof session.loginURL !== "string") {
      throw new Error("Zotero did not create an account-linking session");
    }
    return { state: "authorization-required", sessionToken: session.sessionToken, loginUrl: session.loginURL };
  }

  async function completeAccountLink(input) {
    if (!input || typeof input.sessionToken !== "string" || input.sessionToken.length < 16) {
      throw new Error("A valid Zotero account-linking session is required");
    }
    const result = await Zotero.Sync.Runner.checkLoginSession(input.sessionToken);
    if (result.status === "pending") return { state: "pending" };
    if (result.status === "cancelled") return { state: "cancelled" };
    if (result.status !== "completed") throw new Error("Zotero returned an unknown account-linking state");
    const accepted = await Zotero.Sync.Data.Local.checkUser(
      null,
      result.userID,
      result.username,
      result.displayName,
      result.emails
    );
    if (!accepted) throw new Error("Zotero rejected the account change");
    Zotero.Prefs.set("sync.server.username", result.username);
    Zotero.Prefs.set("sync.autoSync", true);
    return { state: "connected", userId: result.userID, username: result.username };
  }

  function setStoragePreferences(storageMode, downloadMode, groupFileSync) {
    if (!storageModes.has(storageMode)) throw new Error("Unsupported Zotero storage mode");
    if (!downloadModes.has(downloadMode)) throw new Error("Unsupported Zotero attachment download mode");
    Zotero.Prefs.set("sync.autoSync", true);
    Zotero.Prefs.set("sync.storage.downloadMode.personal", downloadMode);
    Zotero.Prefs.set("sync.storage.downloadMode.groups", downloadMode);
    Zotero.Prefs.set("sync.storage.groups.enabled", !!groupFileSync);
    Zotero.Prefs.set("httpServer.enabled", true);
    Zotero.Prefs.set("httpServer.localAPI.enabled", true);
    Zotero.Prefs.set("extensions.zotmoov.enable_automove", false);

    if (storageMode === "zotero-storage") {
      Zotero.Prefs.set("sync.storage.enabled", true);
      Zotero.Prefs.set("sync.storage.protocol", "zotero");
      Zotero.Prefs.set("saveRelativeAttachmentPath", false);
      Zotero.Prefs.set("baseAttachmentPath", "");
    } else if (storageMode === "webdav") {
      Zotero.Prefs.set("sync.storage.enabled", true);
      Zotero.Prefs.set("sync.storage.protocol", "webdav");
      Zotero.Prefs.set("saveRelativeAttachmentPath", false);
      Zotero.Prefs.set("baseAttachmentPath", "");
    } else if (storageMode === "linked-folder") {
      Zotero.Prefs.set("sync.storage.enabled", false);
      Zotero.Prefs.set("sync.storage.groups.enabled", false);
      Zotero.Prefs.set("saveRelativeAttachmentPath", true);
      Zotero.Prefs.set("baseAttachmentPath", "/linked");
      Zotero.Prefs.set("extensions.zotmoov.dst_dir", "/linked");
      Zotero.Prefs.set("extensions.zotmoov.file_behavior", "move");
      Zotero.Prefs.set("extensions.zotmoov.enable_automove", true);
      Zotero.Prefs.set("extensions.zotmoov.enable_subdir_move", false);
      Zotero.Prefs.set("extensions.zotmoov.process_synced_files", true);
      Zotero.Prefs.set("extensions.zotmoov.copy_group_libraries", false);
      Zotero.Prefs.set("extensions.zotmoov.add_zotmoov_tag", false);
    } else {
      Zotero.Prefs.set("sync.storage.enabled", false);
      Zotero.Prefs.set("saveRelativeAttachmentPath", false);
      Zotero.Prefs.set("baseAttachmentPath", "");
    }
  }

  async function configureStorage(input) {
    const storageMode = typeof input?.storageMode === "string" ? input.storageMode : "";
    const downloadMode = typeof input?.downloadMode === "string" ? input.downloadMode : "on-demand";
    const groupFileSync =
      typeof input?.groupFileSync === "boolean" ? input.groupFileSync : storageMode === "zotero-storage";
    setStoragePreferences(storageMode, downloadMode, groupFileSync);
    return {
      state: storageMode === "webdav" ? "webdav-credentials-required" : "configured",
      storageMode,
      downloadMode
    };
  }

  function normalizeWebDAVUrl(value) {
    if (typeof value !== "string" || value.length > 2048) throw new Error("Enter a valid WebDAV URL");
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("Enter a complete http:// or https:// WebDAV URL");
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("Enter a WebDAV URL without credentials, query parameters, or fragments");
    }
    let stored = `${parsed.host}${parsed.pathname}`.replace(/\/+$/, "").replace(/\/zotero$/i, "");
    if (!stored) throw new Error("Enter a valid WebDAV server address");
    return { scheme: parsed.protocol.slice(0, -1), stored };
  }

  async function configureWebDAV(input) {
    const username = typeof input?.username === "string" ? input.username.trim() : "";
    const password = typeof input?.password === "string" ? input.password : "";
    if (!username || username.length > 512) throw new Error("Enter the WebDAV username");
    if (!password || password.length > 4096) throw new Error("Enter the WebDAV password");
    const { scheme, stored } = normalizeWebDAVUrl(input?.url);
    setStoragePreferences("webdav", input?.downloadMode || "on-demand", !!input?.groupFileSync);
    Zotero.Prefs.set("sync.storage.scheme", scheme);
    Zotero.Prefs.set("sync.storage.url", stored);
    Zotero.Prefs.set("sync.storage.username", username);
    Zotero.Prefs.set("sync.storage.verified", false);
    Zotero.Sync.Runner.resetStorageController("webdav");
    const controller = Zotero.Sync.Runner.getStorageController("webdav");
    await controller.setPassword(password);
    await controller.checkServer();
    return { state: "verified", storageMode: "webdav", scheme, server: stored };
  }

  async function syncNow() {
    await Zotero.Sync.Runner.sync({ background: true });
    return { state: "complete" };
  }

  async function attachDoclingResult(input) {
    const sourceAttachmentKey =
      typeof input?.sourceAttachmentKey === "string" ? input.sourceAttachmentKey.trim().toUpperCase() : "";
    const relativePath = typeof input?.relativePath === "string" ? input.relativePath.trim() : "";
    if (!/^[A-Z0-9]{8}$/.test(sourceAttachmentKey)) {
      throw new Error("A valid Zotero source attachment key is required");
    }
    const match = /^\.scholarserver\/docling\/([a-f0-9]{64})\/document\.md$/.exec(relativePath);
    if (!match) {
      throw new Error("The Docling result path is outside ScholarServer's generated-output folder");
    }
    const fullPath = PathUtils.join("/linked", ...relativePath.split("/"));
    const metadata = await IOUtils.stat(fullPath);
    if (metadata.type !== "regular" || metadata.size <= 0 || metadata.size > 50 * 1024 * 1024) {
      throw new Error("The Docling result must be a non-empty Markdown file no larger than 50 MiB");
    }
    const source = await Zotero.Items.getByLibraryAndKeyAsync(Zotero.Libraries.userLibraryID, sourceAttachmentKey);
    if (!source) throw new Error("The source Zotero attachment is not present in the personal library");
    const parentItemID = source.isAttachment() ? source.parentID : source.id;
    if (!parentItemID) throw new Error("The source attachment does not belong to a bibliographic item");
    const parent = Zotero.Items.get(parentItemID);
    if (!parent || !parent.isRegularItem()) throw new Error("The source attachment parent is not a bibliographic item");
    const title = `Docling Markdown — ${match[1].slice(0, 12)}`;
    for (const attachmentID of parent.getAttachments()) {
      const existing = Zotero.Items.get(attachmentID);
      if (existing && existing.getField("title") === title) {
        return response({
          state: "already-attached",
          attachmentKey: existing.key,
          parentItemKey: parent.key,
          sourceSha256: match[1]
        });
      }
    }
    const attachment = await Zotero.Attachments.importFromFile({
      file: fullPath,
      parentItemID,
      title,
      contentType: "text/markdown",
      charset: "utf-8"
    });
    return response({
      state: "attached",
      attachmentKey: attachment.key,
      parentItemKey: parent.key,
      sourceSha256: match[1]
    });
  }

  async function perform(request) {
    switch (request.action) {
      case "status":
        return status();
      case "account-start":
        return startAccountLink();
      case "account-complete":
        return completeAccountLink(request.input || {});
      case "configure-storage":
        return configureStorage(request.input || {});
      case "configure-webdav":
        return configureWebDAV(request.input || {});
      case "sync-now":
        return syncNow();
      case "attach-docling-result":
        return attachDoclingResult(request.input || {});
      default:
        throw new Error("Unsupported ScholarServer Zotero setup action");
    }
  }

  async function processRequest(requestPath) {
    const fileName = PathUtils.filename(requestPath);
    if (!/^[a-z0-9-]+\.json$/.test(fileName)) return;
    const responsePath = PathUtils.join(responsesPath, fileName);
    let request;
    try {
      request = await IOUtils.readJSON(requestPath);
    } finally {
      await IOUtils.remove(requestPath, { ignoreAbsent: true });
    }
    let result;
    try {
      result = { ok: true, result: await perform(request) };
    } catch (error) {
      Zotero.logError(error);
      result = { ok: false, error: errorMessage(error) };
    }
    await IOUtils.writeJSON(responsePath, result, { tmpPath: `${responsePath}.tmp`, flush: true });
  }

  async function loop() {
    while (!ScholarServerBridge.stopped) {
      try {
        const files = (await IOUtils.getChildren(requestsPath)).sort();
        for (const file of files) await processRequest(file);
      } catch (error) {
        Zotero.logError(error);
      }
      await Zotero.Promise.delay(250);
    }
  }

  loop().catch((error) => Zotero.logError(error));
}

function shutdown() {
  if (ScholarServerBridge) ScholarServerBridge.stopped = true;
  ScholarServerBridge = null;
}
