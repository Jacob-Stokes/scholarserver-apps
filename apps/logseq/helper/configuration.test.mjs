import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";
import { logseqConfigurationFixtures } from "./configuration.fixtures.mjs";
import { attachCurrentSectionWhenAvailable } from "./configuration.mjs";
import { Enrollment } from "./enrollment.mjs";

test("Logseq private endpoint is selected through Manager without inventing an address", () => {
  const [connection, account] = logseqConfigurationFixtures;
  assert.equal(connection.stage.id, "connection");
  assert.deepEqual(connection.endpointIds, ["sync", "editor"]);
  assert.equal(connection.fields[0].sourceEndpointId, "sync");
  assert.equal(connection.values.url, undefined);
  assert.equal(account.stage.id, "account");
  assert.equal(account.actions[0].id, "start-sign-in");
});

test("confirmed notebook action remains confirmed when next status read fails", async () => {
  const receipt = { requestId: "logseq-request-0001", actionId: "join-notebook", status: "succeeded" };
  assert.deepEqual(
    await attachCurrentSectionWhenAvailable(receipt, async () => {
      throw new Error("read failed");
    }),
    receipt
  );
});

test("generated Logseq sign-in output uses the manifest-approved origin", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "logseq-link-test-"));
  try {
    const enrollment = new Enrollment({
      runtime: directory,
      root: directory,
      runLogin: (_, signal) => new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }))
    });
    const session = await enrollment.start();
    assert.equal(session.state, "waiting");
    const manifest = YAML.parse(await readFile(new URL("../package/scholarserver-app.yaml", import.meta.url), "utf8"));
    const approved = new Set(manifest.presentation.details.links.map((link) => new URL(link.url).origin));
    assert.ok(approved.has(new URL(session.authorizationUrl).origin));
    await enrollment.cancel();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Logseq sign-in URL remains a sensitive explicit output and download is not replayable", () => {
  const [, , waiting, notebooks, downloading, retry, ready] = logseqConfigurationFixtures;
  assert.equal(waiting.outputs[0].id, "sign-in-url");
  assert.ok(!JSON.stringify(waiting).includes("state=secret"));
  assert.equal(notebooks.fields[0].options.length, 1);
  assert.equal(notebooks.actions[0].id, "find-notebooks");
  assert.equal(notebooks.actions[1].id, "join-notebook");
  assert.equal(downloading.actions.length, 0);
  assert.equal(retry.actions[0].id, "retry-download");
  assert.equal(ready.stage.id, "ready");
  assert.equal(
    ready.actions.some((action) => action.id === "join-notebook"),
    false
  );
});
