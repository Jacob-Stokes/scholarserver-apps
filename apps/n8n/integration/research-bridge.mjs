// Only these reviewed operations cross the application boundary. The workflow
// cannot supply a URL, action name, workspace, application ID or output root.
export class ResearchBridge {
  constructor({ managerUrl = "http://manager:8080", fetchImplementation = fetch }) {
    this.managerUrl = managerUrl;
    this.fetch = fetchImplementation;
  }

  async request(route, input) {
    const response = await this.fetch(`${this.managerUrl}${route}`, {
      method: input === undefined ? "GET" : "POST",
      redirect: "error",
      signal: AbortSignal.timeout(120000),
      headers: { "content-type": "application/json", origin: this.managerUrl },
      body: input === undefined ? undefined : JSON.stringify(input)
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("The selected application could not complete the research operation");
    }
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2 * 1024 * 1024) throw new Error("Research response exceeds the limit");
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  async applications() {
    const [overview, catalog] = await Promise.all([this.request("/api/v1/overview"), this.request("/api/v1/catalog")]);
    return overview.instances
      .filter(
        (instance) =>
          instance.desiredState === "enabled" &&
          instance.observedState === "healthy" &&
          ["org.scholarserver.zotero", "org.scholarserver.obsidian", "org.scholarserver.docling"].includes(
            instance.packageId
          )
      )
      .map(({ id, workspaceId, packageId, packageVersion }) => {
        const declaration = catalog.applications.find((app) => app.id === packageId && app.version === packageVersion);
        const actions = declaration?.onboarding?.actions?.map((action) => action.id) ?? [];
        return { id, workspaceId, packageId, packageVersion, actions };
      });
  }

  async validateScope(scope) {
    const applications = await this.applications();
    const destination = scope.kind === "convert-pdfs" ? "docling" : "obsidian";
    for (const app of ["zotero", destination]) {
      const found = applications.find(
        (instance) =>
          instance.id === scope[app] &&
          instance.workspaceId === scope.workspaceId &&
          instance.packageId === `org.scholarserver.${app}`
      );
      if (!found) throw new Error("A selected research application is unavailable");
      let required;
      if (scope.kind === "convert-pdfs") {
        required = ["discover", "enqueue", "job-status"];
        if (app === "zotero") required = ["match-attachment", "attach-docling-result"];
      } else {
        required = ["create-research-note"];
        if (app === "zotero") required = ["research-items"];
      }
      if (required.some((action) => !found.actions.includes(action))) {
        throw new Error("Update the selected application before connecting this research automation");
      }
    }
  }

  action(scope, app, action, input) {
    const workspace = encodeURIComponent(scope.workspaceId);
    const instance = encodeURIComponent(scope[app]);
    return this.request(`/api/v1/instances/${workspace}/${instance}/actions/${action}`, input);
  }

  sourcePath(scope, value) {
    if (
      typeof value !== "string" ||
      !value.startsWith(`${scope.folder}/`) ||
      value.length > 1000 ||
      value.split("/").some((part) => !part || part.startsWith(".") || /[\\\x00-\x1f]/.test(part))
    ) {
      throw new Error("The document is outside the selected folder");
    }
    return value;
  }

  async execute(scope, operation, input = {}) {
    await this.validateScope(scope);
    if (["reading-notes", "research-digest"].includes(scope.kind)) {
      if (operation === "papers") {
        const until = new Date();
        let days = 7;
        if (scope.kind === "research-digest") {
          until.setUTCHours(0, 0, 0, 0);
          days = 1;
        }
        const since = new Date(until.getTime() - days * 86400000);
        const result = await this.action(scope, "zotero", "research-items", {
          since: since.toISOString(),
          until: until.toISOString()
        });
        return { ...result, date: since.toISOString().slice(0, 10) };
      }
      if (operation === "note") {
        const pattern = scope.kind === "reading-notes" ? /^zotero-[A-Z0-9]{8}\.md$/ : /^digest-\d{4}-\d{2}-\d{2}\.md$/;
        if (typeof input.filename !== "string" || !pattern.test(input.filename))
          throw new Error("Invalid note identity");
        return this.action(scope, "obsidian", "create-research-note", {
          folder: scope.folder,
          filename: input.filename,
          content: input.content
        });
      }
      throw new Error("This operation is not allowed by the research connection");
    }
    if (scope.kind !== "convert-pdfs") throw new Error("Unknown research connection kind");
    switch (operation) {
      case "discover": {
        const result = await this.action(scope, "docling", "discover", { folder: scope.folder, limit: 100 });
        if (!Array.isArray(result.files) || result.files.length >= 100) {
          throw new Error("Choose a folder with fewer than 100 PDFs for this automation");
        }
        return result;
      }
      case "match":
        return this.action(scope, "zotero", "match-attachment", {
          sourcePath: this.sourcePath(scope, input.sourcePath)
        });
      case "enqueue": {
        const sourcePath = this.sourcePath(scope, input.sourcePath);
        const match = await this.action(scope, "zotero", "match-attachment", { sourcePath });
        if (match.state !== "matched") throw new Error("The PDF must match exactly one Zotero attachment");
        return this.action(scope, "docling", "enqueue", {
          sourcePath,
          sourceAttachmentKey: match.attachmentKey,
          ocr: false
        });
      }
      case "job":
      case "attach": {
        if (typeof input.jobId !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(input.jobId)) {
          throw new Error("Choose a conversion job");
        }
        const job = await this.action(scope, "docling", "job-status", { jobId: input.jobId });
        this.sourcePath(scope, job.sourcePath);
        if (operation === "job") return job;
        if (job.state !== "succeeded") throw new Error("The conversion has not succeeded");
        const match = await this.action(scope, "zotero", "match-attachment", { sourcePath: job.sourcePath });
        if (match.state !== "matched" || match.attachmentKey !== job.sourceAttachmentKey) {
          throw new Error("The source attachment no longer matches the conversion");
        }
        return this.action(scope, "zotero", "attach-docling-result", {
          sourceAttachmentKey: job.sourceAttachmentKey,
          relativePath: job.outputPath
        });
      }
      default:
        throw new Error("This operation is not allowed by the research connection");
    }
  }
}
