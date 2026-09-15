import assert from "node:assert/strict";
import test from "node:test";
import { couchDbAddress } from "./couchdb-address.mjs";

test("managed instances never use the shared generic database alias", () => {
  assert.equal(
    couchDbAddress({ SCHOLARSERVER_WORKSPACE_ID: "personal", SCHOLARSERVER_INSTANCE_ID: "obsidian-dev" }),
    "http://obsidian-db-personal-obsidian-dev:5984"
  );
  assert.notEqual(
    couchDbAddress({ SCHOLARSERVER_WORKSPACE_ID: "personal", SCHOLARSERVER_INSTANCE_ID: "obsidian" }),
    couchDbAddress({ SCHOLARSERVER_WORKSPACE_ID: "personal", SCHOLARSERVER_INSTANCE_ID: "obsidian-dev" })
  );
});

test("standalone fixtures retain their private service address when both identities are absent", () => {
  assert.equal(couchDbAddress({}), "http://livesync-couchdb:5984");
});

test("partial or invalid managed identities fail closed", () => {
  for (const environment of [
    { SCHOLARSERVER_WORKSPACE_ID: "personal" },
    { SCHOLARSERVER_INSTANCE_ID: "obsidian" },
    { SCHOLARSERVER_WORKSPACE_ID: "", SCHOLARSERVER_INSTANCE_ID: "obsidian" },
    { SCHOLARSERVER_WORKSPACE_ID: "personal", SCHOLARSERVER_INSTANCE_ID: "host/path" }
  ])
    assert.throws(() => couchDbAddress(environment), /identities are required/);
});
