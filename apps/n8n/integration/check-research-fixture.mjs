// Disposable native acceptance only. This is not packaged in any runtime image.
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createResearchNote } from "/research-note.mjs";

const vault = await mkdtemp("/tmp/research-vault-");
const serviceConnection = JSON.parse(await readFile("/runtime/manager-connection.json", "utf8"));
const operations = [];
const packages = [
  {
    id: "org.scholarserver.zotero",
    version: "test",
    onboarding: { actions: ["research-items", "match-attachment", "attach-docling-result"].map((id) => ({ id })) }
  },
  { id: "org.scholarserver.obsidian", version: "test", onboarding: { actions: [{ id: "create-research-note" }] } },
  {
    id: "org.scholarserver.docling",
    version: "test",
    onboarding: { actions: ["discover", "enqueue", "job-status"].map((id) => ({ id })) }
  }
];
const job = {
  id: "test-job",
  sourcePath: "Papers/fixture.pdf",
  sourceAttachmentKey: "PDF12345",
  state: "succeeded",
  outputPath: ".scholarserver/docling/fixture/document.md"
};
const attached = new Set();
let statusChecks = 0;
const papers = [
  {
    key: "PAPER123",
    title: "Synthetic <script> & [brackets]",
    authors: ["A Researcher"],
    date: "2026",
    doi: "",
    zoteroUrl: "zotero://select/library/items/PAPER123"
  },
  {
    key: "PAPER124",
    title: "Second synthetic paper",
    authors: [],
    date: "2026",
    doi: "",
    zoteroUrl: "zotero://select/library/items/PAPER124"
  }
];

createServer(async (request, response) => {
  let status = 200;
  let result;
  try {
    if (request.url === "/api/v1/service/actions") {
      assert.equal(request.headers.authorization, `Bearer ${serviceConnection.token}`);
      result = {
        applications: packages.map((app) => ({
          id: app.id.split(".").at(-1),
          packageId: app.id,
          workspaceId: "personal",
          actionIds: app.onboarding.actions.map((action) => action.id)
        }))
      };
    } else if (request.url === "/verify") {
      const notes = await readdir(`${vault}/Research`);
      assert.ok(notes.includes("zotero-PAPER123.md"));
      assert.ok(notes.some((name) => /^digest-\d{4}-\d{2}-\d{2}\.md$/.test(name)));
      assert.equal(notes.length, 3);
      assert.equal(attached.size, 1);
      assert.ok(statusChecks >= 5, "The pending branch and repeat execution must check the conversion again");
      const note = await readFile(`${vault}/Research/zotero-PAPER123.md`, "utf8");
      assert.match(note, /zotero:\/\/select\/library\/items\/PAPER123/);
      assert.match(note, /## Key points/);
      result = { checked: true, notes: notes.length, attachments: attached.size, operations };
    } else {
      const match = request.url.match(
        /^\/api\/v1\/service\/instances\/personal\/(zotero|obsidian|docling)\/actions\/([a-z-]+)$/
      );
      assert.ok(match, "Only known fixture actions may be requested");
      assert.equal(request.headers.authorization, `Bearer ${serviceConnection.token}`);
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const action = match[2];
      operations.push(action);
      switch (action) {
        case "research-items":
          result = { items: papers };
          break;
        case "create-research-note":
          result = await createResearchNote(vault, input);
          break;
        case "discover":
          result = {
            files: [
              { path: "Papers/fixture.pdf", bytes: 100 },
              { path: "Papers/unmatched.pdf", bytes: 100 }
            ]
          };
          break;
        case "match-attachment":
          result = { state: "matched", sourcePath: input.sourcePath, attachmentKey: job.sourceAttachmentKey };
          if (input.sourcePath === "Papers/unmatched.pdf")
            result = { state: "not-found", sourcePath: input.sourcePath };
          break;
        case "enqueue":
          result = job;
          break;
        case "job-status":
          statusChecks++;
          result = job;
          if (statusChecks === 1) result = { ...job, state: "running", createdAt: new Date().toISOString() };
          break;
        case "attach-docling-result":
          attached.add(input.relativePath);
          result = { state: "attached" };
          break;
        default:
          throw new Error("Unexpected fixture action");
      }
    }
  } catch (error) {
    status = 500;
    result = { error: error.message };
  }
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(result));
}).listen(8080, "0.0.0.0");
