import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { preserveIncompleteDownload, selectedRemote, syncObservation, verifyReplica } from "./setup.mjs";

const remote = {
  "graph-id": "91433be7-718c-48a3-b76c-672568a8a19d",
  "graph-name": "Research",
  "graph-e2ee?": true,
  "graph-ready-for-use?": true
};
test("selection uses the listed encrypted identity, never an arbitrary name", () => {
  assert.deepEqual(selectedRemote([remote], remote["graph-id"]), { graph: "Research", remoteId: remote["graph-id"] });
  assert.throws(() => selectedRemote([remote], "missing"));
  assert.throws(() => selectedRemote([{ ...remote, "graph-e2ee?": false }], remote["graph-id"]));
  assert.throws(() => selectedRemote([{ ...remote, "graph-name": "../../data" }], remote["graph-id"]));
  assert.throws(() => selectedRemote([remote, { ...remote, "graph-id": "another" }], remote["graph-id"]), /same name/);
});
test("a downloaded replica must match both remote identity and encryption", () => {
  const selected = { remoteId: remote["graph-id"] };
  const kv = { "logseq.kv/graph-uuid": selected.remoteId, "logseq.kv/graph-rtc-e2ee?": true };
  verifyReplica({ kv }, selected);
  assert.throws(() => verifyReplica({ kv: { ...kv, "logseq.kv/graph-uuid": "other" } }, selected));
  assert.throws(() => verifyReplica({ kv: { ...kv, "logseq.kv/graph-rtc-e2ee?": false } }, selected));
});
test("local readiness is not evidence that remote sync is current", () => {
  const value = {
    "graph-id": "proof",
    "last-error": null,
    "ws-state": "open",
    "pending-local": 0,
    "pending-asset": 0,
    "pending-server": 0,
    "local-checksum": "same",
    "remote-checksum": "same"
  };
  assert.equal(syncObservation(value, "proof"), "up-to-date");
  assert.equal(syncObservation(value, "different"), "unavailable");
  assert.equal(syncObservation({ ...value, "pending-asset": 1 }, "proof"), "syncing");
  assert.equal(syncObservation({ ...value, "pending-local": undefined }, "proof"), "checking");
  assert.equal(syncObservation({ ...value, "remote-checksum": "different" }, "proof"), "checking");
  assert.equal(syncObservation({ ...value, "ws-state": "closed" }, "proof"), "reconnecting");
  assert.equal(syncObservation({ ...value, "last-error": "private diagnostic" }, "proof"), "needs-attention");
});

test("retry preserves our incomplete files after stopping the worker, never connected data", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "logseq-download-recovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "graphs", "Research");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "db.sqlite"), "synthetic incomplete data");
  let stopped = false;
  const saved = await preserveIncompleteDownload(root, { graph: "Research", phase: "downloading" }, async () => {
    assert.ok(await lstat(directory));
    stopped = true;
  });
  assert.ok(stopped);
  assert.equal(await readFile(path.join(saved, "db.sqlite"), "utf8"), "synthetic incomplete data");
  await assert.rejects(lstat(directory), { code: "ENOENT" });
  await assert.rejects(
    preserveIncompleteDownload(root, { graph: "Research", phase: "connected" }, async () => {}),
    /cannot be replaced/
  );
});
