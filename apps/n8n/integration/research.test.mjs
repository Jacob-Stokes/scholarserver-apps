import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { researchItems } from "../../zotero/controller/research-items.mjs";
import { readCatalog } from "./catalog.mjs";
import { ResearchAccess, researchConfiguration } from "./research-access.mjs";
import { ResearchBridge } from "./research-bridge.mjs";
import { WorkflowInstallations } from "./workflows.mjs";

const templates = await readCatalog(new URL("../templates/", import.meta.url));
const scope = { kind: "convert-pdfs", workspaceId: "personal", zotero: "zotero", docling: "docling", folder: "Papers" };

test("catalog contains four unique native workflows with disabled-by-default creation", () => {
  assert.equal(templates.length, 4);
  for (const template of templates) {
    assert.equal(template.workflow.active, undefined);
    assert.ok(template.workflow.nodes.some((node) => node.type === "n8n-nodes-base.manualTrigger"));
    for (const node of template.workflow.nodes) {
      assert.equal(node.credentials, undefined);
      if (node.type === "n8n-nodes-base.httpRequest") {
        assert.match(node.parameters.url, /^http:\/\/integration:8081\/research\/[a-z]+$/);
        if (template.research === "convert-pdfs") {
          assert.equal(node.retryOnFail, true);
          assert.equal(node.maxTries, 3);
          assert.equal(node.waitBetweenTries, 3000);
        } else {
          assert.equal(node.retryOnFail, undefined);
        }
      }
    }
  }
});

test("PDF watcher polls every minute and checks cached conversion status before waiting", () => {
  const template = templates.find((candidate) => candidate.research === "convert-pdfs");
  const trigger = template.workflow.nodes.find((node) => node.id === "schedule");
  assert.deepEqual(trigger.parameters.rule.interval, [{ field: "minutes", minutesInterval: 1 }]);
  assert.equal(template.workflow.connections[trigger.name].main[0][0].node, "Find shared PDFs");
  assert.equal(template.workflow.connections["Queue Docling conversion"].main[0][0].node, "Check conversion status");
  assert.equal(
    template.workflow.connections["Wait before checking conversion"].main[0][0].node,
    "Check conversion status"
  );
  assert.equal(
    template.workflow.connections["Attach Markdown to original paper"].main[0][0].node,
    "One conversion at a time"
  );
});

test("research scopes reject URLs, traversal, hidden folders and extra bindings", () => {
  const template = templates.find((candidate) => candidate.research === "convert-pdfs");
  const { kind, ...bindings } = scope;
  assert.deepEqual(researchConfiguration(template, { research: bindings }), scope);
  for (const folder of ["", "/Papers", "Papers/../vault", "Papers/.obsidian", "Papers\\secret", "Papers//x"]) {
    assert.throws(() => researchConfiguration(template, { research: { ...bindings, folder } }));
  }
  assert.throws(() => researchConfiguration(template, { research: { ...bindings, url: "http://host" } }));
});

test("n8n owns the bearer; journal stores only verifier, scoped apps and credential receipt", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "research-access-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let submitted;
  const access = new ResearchAccess({
    directory,
    client: {
      async createCredential(value) {
        submitted = value;
        return { id: "credential-one", name: value.name };
      }
    }
  });
  const id = randomUUID();
  await access.provision(id, scope);
  assert.deepEqual(await access.authorize(submitted.data.value), scope);
  const journal = await readFile(path.join(directory, `${id}.json`), "utf8");
  assert.equal(journal.includes(submitted.data.value.split(".")[1]), false);
  await assert.rejects(access.authorize(`${id}.${"0".repeat(64)}`));
  await access.revoke(id);
  await assert.rejects(access.authorize(submitted.data.value));
});

test("lost credential receipt is inert after restart and is never automatically retried", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "research-access-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  let token;
  const client = {
    async createCredential(value) {
      calls++;
      token = value.data.value;
      throw new Error("lost reply");
    }
  };
  const id = randomUUID();
  await assert.rejects(new ResearchAccess({ directory, client }).provision(id, scope));
  const restarted = new ResearchAccess({ directory, client });
  await assert.rejects(restarted.provision(id, scope));
  await assert.rejects(restarted.authorize(token));
  assert.equal(calls, 1);
});

test("invalid research configuration fails before a receipt or n8n request exists", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "research-install-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const installations = new WorkflowInstallations({
    statePath: path.join(directory, "install.json"),
    templates,
    client: {
      createWorkflow() {
        assert.fail("must not contact n8n");
      }
    }
  });
  await assert.rejects(installations.install("zotero-reading-notes", {}));
  assert.deepEqual((await installations.read()).installations, {});
});

test("research discovery uses only the scoped Manager service API", async () => {
  const requests = [];
  const bridge = new ResearchBridge({
    managerConnection: {
      read: async () => ({
        url: "http://scholarserver-manager:8080/api/v1/service",
        token: "a".repeat(43)
      })
    },
    fetchImplementation: async (url, options) => {
      requests.push({ url, options });
      return new Response(
        JSON.stringify({
          applications: [
            {
              id: "zotero",
              workspaceId: "personal",
              packageId: "org.scholarserver.zotero",
              packageVersion: "1.0.0",
              actionIds: ["research-items"]
            }
          ]
        })
      );
    }
  });
  assert.deepEqual(await bridge.applications(), [
    {
      id: "zotero",
      workspaceId: "personal",
      packageId: "org.scholarserver.zotero",
      packageVersion: "1.0.0",
      actions: ["research-items"]
    }
  ]);
  assert.equal(requests[0].url, "http://scholarserver-manager:8080/api/v1/service/actions");
  assert.equal(requests[0].options.headers.authorization, `Bearer ${"a".repeat(43)}`);
  assert.equal(requests[0].options.headers.origin, undefined);
});

test("PDF grant rejects unrelated operations, paths and caller-supplied output attachments", async () => {
  const bridge = new ResearchBridge({});
  bridge.validateScope = async () => {};
  const calls = [];
  bridge.action = async (_scope, app, action, input) => {
    calls.push({ app, action, input });
    if (action === "job-status")
      return {
        state: "succeeded",
        sourcePath: "Papers/test.pdf",
        sourceAttachmentKey: "ABCD1234",
        outputPath: "trusted-output"
      };
    if (action === "match-attachment") return { state: "matched", attachmentKey: "ABCD1234" };
    return { state: "existing" };
  };
  await assert.rejects(bridge.execute(scope, "note", {}));
  await assert.rejects(bridge.execute(scope, "enqueue", { sourcePath: "Papers/../secret.pdf" }));
  await bridge.execute(scope, "attach", { jobId: "job-one", sourceAttachmentKey: "EVIL1234", outputPath: "elsewhere" });
  assert.deepEqual(calls.at(-1), {
    app: "zotero",
    action: "attach-docling-result",
    input: { sourceAttachmentKey: "ABCD1234", relativePath: "trusted-output" }
  });
});

test("disabled, wrong-workspace and missing-action applications cannot receive a grant", async () => {
  const bridge = new ResearchBridge({});
  bridge.applications = async () => [
    { id: "zotero", workspaceId: "other", packageId: "org.scholarserver.zotero", actions: [] }
  ];
  await assert.rejects(bridge.validateScope(scope));
  bridge.applications = async () => [
    { id: "zotero", workspaceId: "personal", packageId: "org.scholarserver.zotero", actions: [] },
    {
      id: "docling",
      workspaceId: "personal",
      packageId: "org.scholarserver.docling",
      actions: ["discover", "enqueue", "job-status"]
    }
  ];
  await assert.rejects(bridge.validateScope(scope), /unavailable|actions/);
});

test("Zotero metadata is bounded and excludes private notes, file paths and attachments", async () => {
  const result = await researchItems(
    { since: "2026-09-08T00:00:00Z", until: "2026-09-09T00:00:00Z" },
    {
      userId: "123",
      request: async (route) => {
        assert.match(route, /^\/users\/123\/items\/top\?/);
        return [
          {
            key: "ABCD1234",
            data: {
              title: "Example",
              itemType: "journalArticle",
              dateAdded: "2026-09-08T12:00:00Z",
              note: "private",
              path: "/secret",
              creators: [{ firstName: "A", lastName: "Researcher" }]
            }
          },
          { key: "NOTE1234", data: { itemType: "note", dateAdded: "2026-09-08T12:00:00Z" } }
        ];
      }
    }
  );
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0].authors, ["A Researcher"]);
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(JSON.stringify(result).includes("/secret"), false);
  assert.equal(result.items[0].zoteroUrl, "zotero://select/library/items/ABCD1234");
});

test("Zotero pagination refuses a truncated result instead of silently losing papers", async () => {
  const request = async () =>
    Array.from({ length: 100 }, () => ({
      key: "ABCD1234",
      data: { itemType: "journalArticle", dateAdded: "2026-09-08T12:00:00Z" }
    }));
  await assert.rejects(
    researchItems({ since: "2026-09-08T00:00:00Z", until: "2026-09-09T00:00:00Z" }, { userId: "123", request }),
    /1,000/
  );
});
