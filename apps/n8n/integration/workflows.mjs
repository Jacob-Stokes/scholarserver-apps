import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { atomicJson } from "@scholarserver/controller-runtime/files";
import { workflowFingerprint, workflowFromTemplate } from "./templates.mjs";

// One controller process owns this journal. n8n owns workflow content; the journal
// holds only identities and receipts. A pending receipt is never replayed blindly.
export class WorkflowInstallations {
  constructor({ statePath, client, templates }) {
    this.statePath = statePath;
    this.client = client;
    this.templates = templates;
    this.pending = Promise.resolve();
  }

  async read() {
    let content;
    try {
      content = await readFile(this.statePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return { schemaVersion: 1, installations: {} };
      throw error;
    }
    const state = JSON.parse(content);
    if (
      state?.schemaVersion !== 1 ||
      !state.installations ||
      Array.isArray(state.installations) ||
      typeof state.installations !== "object"
    ) {
      throw new Error("Automation installation journal needs recovery");
    }
    return state;
  }

  async save(state) {
    await mkdir(path.dirname(this.statePath), { recursive: true, mode: 0o700 });
    await atomicJson(this.statePath, state);
  }

  serialise(operation) {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }

  install(templateId) {
    return this.serialise(async () => {
      const template = this.templates.find((candidate) => candidate.id === templateId);
      if (!template) throw new Error("Unknown automation template");
      const state = await this.read();
      // One installed copy per template in this first version.
      const existing = state.installations[templateId];
      if (existing) return existing;
      const receipt = {
        templateId,
        templateVersion: template.version,
        operationId: randomUUID(),
        state: "installing",
        workflowId: null,
        fingerprint: null
      };
      const workflow = workflowFromTemplate(template);
      // The marker permits read-only reconciliation after a lost create response.
      receipt.workflowName = `${template.name} [ScholarServer:${receipt.operationId}]`;
      workflow.name = receipt.workflowName;
      state.installations[templateId] = receipt;
      await this.save(state);
      let created;
      try {
        created = await this.client.createWorkflow(workflow);
      } catch (error) {
        receipt.state = error.outcome === "rejected" ? "rejected" : "unconfirmed";
        await this.save(state);
        return receipt;
      }
      if (typeof created?.id !== "string") {
        receipt.state = "unconfirmed";
      } else {
        receipt.state = "installed";
        receipt.workflowId = created.id;
        receipt.fingerprint = workflowFingerprint(created);
      }
      // If this save fails, the durable installing receipt prevents another POST.
      await this.save(state);
      return receipt;
    });
  }

  reconcile(templateId) {
    return this.serialise(async () => {
      const state = await this.read();
      const receipt = state.installations[templateId];
      if (!receipt) throw new Error("Automation has no installation receipt");
      if (receipt.state === "installed" || receipt.state === "rejected") return receipt;
      const matches = [];
      let cursor;
      const cursors = new Set();
      for (let page = 0; page < 100; page++) {
        const result = await this.client.listWorkflows(cursor);
        if (!Array.isArray(result?.data)) throw new Error("Could not read n8n workflow inventory");
        matches.push(...result.data.filter((workflow) => workflow.name === receipt.workflowName));
        cursor = result.nextCursor;
        if (!cursor) break;
        if (cursors.has(cursor) || page === 99) throw new Error("n8n workflow inventory is incomplete");
        cursors.add(cursor);
      }
      if (matches.length === 1 && typeof matches[0].id === "string") {
        const workflow = await this.client.getWorkflow(matches[0].id);
        receipt.workflowId = workflow.id;
        receipt.fingerprint = workflowFingerprint(workflow);
        receipt.state = "installed";
      } else {
        // Absence is not evidence the request cannot still finish upstream.
        receipt.state = "unconfirmed";
      }
      await this.save(state);
      return receipt;
    });
  }
}
