import assert from "node:assert/strict";
import test from "node:test";
import { assertCandidateMatches, candidateDefinition } from "../dev/n8n/candidate.mjs";

const candidate = {
  schemaVersion: 1,
  imageId: `sha256:${"a".repeat(64)}`,
  sourceDigest: `sha256:${"b".repeat(64)}`,
  sourceRevision: "c".repeat(40)
};
test("candidate selection preserves the package runtime and explicitly identifies the local integration build", () => {
  const original = { n8nImage: "pinned-runtime", integrationImage: "pinned-integration", packageVersion: "test" };
  const selected = candidateDefinition(original, candidate);
  assert.equal(selected.n8nImage, original.n8nImage);
  assert.equal(original.integrationImage, "pinned-integration");
  assert.equal(selected.integrationImage, candidate.imageId);
  assert.match(selected.backendIdentity, /local candidate .*not published/);
});
test("candidate selection rejects mutable image tags, missing build labels and stale source", () => {
  for (const field of ["imageId", "sourceDigest", "sourceRevision"]) {
    assert.throws(() => candidateDefinition({}, { ...candidate, [field]: "unknown" }));
  }
  assert.throws(() => candidateDefinition({}, { ...candidate, imageId: "my-image:latest" }));
  assert.doesNotThrow(() => assertCandidateMatches(candidate, candidate.sourceDigest));
  assert.throws(() => assertCandidateMatches(candidate, `sha256:${"d".repeat(64)}`), /stale/);
});
