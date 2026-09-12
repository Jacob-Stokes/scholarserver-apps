import path from "node:path";
import { fingerprintRecipe, loadInventory } from "../../scripts/check-image-source.mjs";

export function candidateDefinition(definition, candidate) {
  if (
    candidate?.schemaVersion !== 1 ||
    !/^sha256:[a-f0-9]{64}$/.test(candidate.imageId ?? "") ||
    !/^sha256:[a-f0-9]{64}$/.test(candidate.sourceDigest ?? "") ||
    !/^[a-f0-9]{40}$/.test(candidate.sourceRevision ?? "")
  ) {
    throw new Error("The local candidate selection is invalid; inspect it before starting development.");
  }
  return {
    ...definition,
    integrationImage: candidate.imageId,
    candidate,
    backendIdentity: `local candidate ${candidate.sourceRevision.slice(0, 12)} · integration ${candidate.imageId.slice(7, 19)} · not published`
  };
}

export async function candidateSourceDigest(root) {
  const inventory = await loadInventory(path.join(root, "scripts/image-source-inventory.json"));
  const recipe = inventory.recipes.find((recipe) => recipe.name === "n8n-app");
  if (!recipe) throw new Error("The n8n image recipe is missing.");
  return (await fingerprintRecipe(root, recipe)).digest;
}

export function assertCandidateMatches(candidate, currentDigest) {
  if (candidate.sourceDigest !== currentDigest) {
    throw new Error(
      "The selected integration candidate is stale. Rebuild it or explicitly use-package; it was not replaced automatically."
    );
  }
}
