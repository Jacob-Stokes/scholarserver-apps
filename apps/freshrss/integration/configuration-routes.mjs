import {
  assertConfigurationActionRequest,
  ConfigurationActionError,
  configurationActionResult
} from "@scholarserver/controller-runtime/configuration-actions";
import { configurationSection, validateAppearanceValues } from "./configuration.mjs";

function send(response, status, result) {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(result));
}

async function configurationBody(request) {
  if (request.headers["content-type"] !== "application/json" || request.headers["x-requested-with"] !== "ScholarServer")
    throw new ConfigurationActionError(403, "Use ScholarServer Configuration.");
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 16_384) throw new ConfigurationActionError(413, "The configuration request is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ConfigurationActionError(400, "Invalid configuration request.");
  }
}

async function route(request, response, setup, actions) {
  const url = new URL(request.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "api" || parts[1] !== "configuration")
    return send(response, 404, { error: "Not found." });
  const sectionId = parts[2];
  if (parts.length === 3 && request.method === "GET")
    return send(response, 200, await configurationSection(setup, sectionId));
  if (parts.length === 4 && parts[3] === "evaluate" && request.method === "POST") {
    const input = await configurationBody(request);
    if (
      !input ||
      Array.isArray(input) ||
      typeof input !== "object" ||
      Object.keys(input).some((key) => !["values", "navigateActionId"].includes(key)) ||
      !input.values ||
      Array.isArray(input.values) ||
      typeof input.values !== "object"
    )
      throw new ConfigurationActionError(400, "Invalid configuration evaluation.");
    if (input.navigateActionId !== undefined)
      throw new ConfigurationActionError(409, "This section has no unsaved next step.");
    return send(response, 200, await configurationSection(setup, sectionId));
  }
  if (parts.length === 5 && parts[3] === "actions" && request.method === "POST") {
    const actionId = parts[4];
    if (sectionId !== "appearance" || actionId !== "save-appearance")
      return send(response, 404, { error: "Configuration action not found." });
    const input = assertConfigurationActionRequest(await configurationBody(request), actionId, sectionId);
    try {
      const result = await actions.run(
        input,
        () => configurationSection(setup, sectionId),
        (values) => setup.saveAppearance(values),
        validateAppearanceValues
      );
      return send(response, 200, result);
    } catch (error) {
      if (error instanceof ConfigurationActionError && [400, 409].includes(error.status)) {
        // Helper validation and state checks run before the pending receipt.
        // Never claim a rejection if a receipt exists for this identity.
        const existing = await actions.read(input.requestId, sectionId);
        if (!existing)
          return send(response, error.status, {
            requestId: input.requestId,
            actionId,
            status: "rejected-before-change"
          });
      }
      throw error;
    }
  }
  if (parts.length === 5 && parts[3] === "operations" && request.method === "GET") {
    if (sectionId !== "appearance") return send(response, 404, { error: "Not found." });
    const result = await actions.read(parts[4]);
    return send(
      response,
      result ? 200 : 404,
      result ? configurationActionResult(result) : { error: "Operation not found." }
    );
  }
  return send(response, 404, { error: "Not found." });
}

export async function handleConfiguration(request, response, setup, actions) {
  try {
    await route(request, response, setup, actions);
  } catch (error) {
    if (error instanceof ConfigurationActionError) return send(response, error.status, { error: error.message });
    return send(response, 502, {
      error: "Could not confirm the change. Check Configuration before continuing.",
      unconfirmed: true
    });
  }
}
