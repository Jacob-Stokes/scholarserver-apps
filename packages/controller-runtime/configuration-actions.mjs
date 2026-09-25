import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { atomicJson } from "./files.mjs";

const requestIdPattern = /^[a-zA-Z0-9-]{16,80}$/;

export class ConfigurationActionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function assertConfigurationActionRequest(input, actionId, sectionId) {
  if (!input || Array.isArray(input) || typeof input !== "object")
    throw new ConfigurationActionError(400, "Invalid configuration action request.");
  if (Object.keys(input).some((key) => !["requestId", "expectedRevision", "values"].includes(key)))
    throw new ConfigurationActionError(400, "Invalid configuration action request.");
  if (typeof input.requestId !== "string" || !requestIdPattern.test(input.requestId))
    throw new ConfigurationActionError(400, "Invalid request identity.");
  if (typeof input.expectedRevision !== "string" || !input.expectedRevision || input.expectedRevision.length > 128)
    throw new ConfigurationActionError(400, "Invalid configuration revision.");
  if (typeof actionId !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(actionId))
    throw new ConfigurationActionError(400, "Invalid action route.");
  if (sectionId !== undefined && (typeof sectionId !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(sectionId)))
    throw new ConfigurationActionError(400, "Invalid configuration section.");
  if (!input.values || Array.isArray(input.values) || typeof input.values !== "object")
    throw new ConfigurationActionError(400, "Invalid configuration values.");
  if (JSON.stringify(input).length > 16_384)
    throw new ConfigurationActionError(413, "The configuration request is too large.");
  return { ...input, actionId, ...(sectionId === undefined ? {} : { sectionId }) };
}

function validateFields(values, section, action) {
  const allowedIds = new Set(action.fieldIds ?? []);
  if (Object.keys(values).some((id) => !allowedIds.has(id)))
    throw new ConfigurationActionError(400, "The action contains an unavailable field.");
  for (const id of allowedIds) {
    const field = section.fields.find((candidate) => candidate.id === id);
    if (!field || field.disabled) throw new ConfigurationActionError(409, "The action contains an unavailable field.");
    const value = values[id];
    if (value === undefined || value === null || value === "") {
      if (field.required) throw new ConfigurationActionError(400, "Complete the required fields before continuing.");
      continue;
    }
    if (field.type === "boolean") {
      if (typeof value !== "boolean") throw new ConfigurationActionError(400, "Choose a valid field value.");
      continue;
    }
    if (field.type === "number") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        (field.min !== undefined && value < field.min) ||
        (field.max !== undefined && value > field.max)
      )
        throw new ConfigurationActionError(400, "Choose a valid field value.");
      continue;
    }
    if (
      typeof value !== "string" ||
      value.length > 4096 ||
      (field.minLength !== undefined && value.length < field.minLength) ||
      (field.maxLength !== undefined && value.length > field.maxLength)
    )
      throw new ConfigurationActionError(400, "Choose a valid field value.");
    if (field.type === "select" && !field.options?.some((option) => option.value === value && !option.disabled))
      throw new ConfigurationActionError(400, "Choose a supported option.");
  }
}

// A receipt is written before invoking the app. After a crash, an in-flight
// receipt remains unconfirmed: callers may observe it but must not replay it.
export class ConfigurationActions {
  constructor(directory, sectionId = null) {
    this.directory = directory;
    this.sectionId = sectionId;
    this.pending = Promise.resolve();
  }

  serialise(work) {
    const operation = this.pending.then(work);
    this.pending = operation.catch(() => {});
    return operation;
  }

  receiptPath(requestId) {
    if (!requestIdPattern.test(requestId)) throw new ConfigurationActionError(400, "Invalid request identity.");
    return path.join(this.directory, `${requestId}.json`);
  }

  async read(requestId, sectionId = this.sectionId) {
    try {
      const receipt = JSON.parse(await readFile(this.receiptPath(requestId), "utf8"));
      if (receipt.requestId !== requestId || !["succeeded", "unconfirmed"].includes(receipt.status))
        throw new Error("Invalid configuration receipt");
      if (sectionId && receipt.sectionId !== sectionId)
        throw new ConfigurationActionError(409, "Request identity belongs to another configuration section.");
      return receipt;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async hasUnconfirmedReceipt() {
    let names;
    try {
      names = await readdir(this.directory);
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
    for (const name of names) {
      if (!name.endsWith(".json") || !requestIdPattern.test(name.slice(0, -5))) continue;
      const receipt = await this.read(name.slice(0, -5), null);
      if (receipt.status === "unconfirmed") return true;
    }
    return false;
  }

  run(input, prepare, apply, validate = null) {
    return this.serialise(async () => {
      const previous = await this.read(input.requestId, input.sectionId ?? this.sectionId);
      if (previous) {
        if (previous.actionId !== input.actionId)
          throw new ConfigurationActionError(409, "Request identity belongs to another action.");
        if (!input.sectionId && !this.sectionId) {
          const current = await prepare(input);
          if (previous.sectionId !== current.id)
            throw new ConfigurationActionError(409, "Request identity belongs to another configuration section.");
        }
        return configurationActionResult(previous);
      }
      if (await this.hasUnconfirmedReceipt())
        throw new ConfigurationActionError(
          409,
          "An earlier change is unconfirmed. Check its operation before continuing."
        );
      const section = await prepare(input);
      if (input.sectionId && section.id !== input.sectionId)
        throw new ConfigurationActionError(409, "Configuration section changed. Refresh before saving.");
      if (this.sectionId && section.id !== this.sectionId)
        throw new ConfigurationActionError(409, "Configuration section changed. Refresh before saving.");
      if (section.revision !== input.expectedRevision)
        throw new ConfigurationActionError(409, "Configuration changed. Refresh before saving.");
      const action = section.actions.find((candidate) => candidate.id === input.actionId);
      if (!action || action.disabled || action.target?.kind !== "app" || action.kind === "navigate")
        throw new ConfigurationActionError(409, "This action is not available in the current step.");
      validateFields(input.values, section, action);
      const validated = validate ? await validate(input.values, section) : input.values;
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const receiptPath = this.receiptPath(input.requestId);
      const receipt = {
        requestId: input.requestId,
        actionId: input.actionId,
        sectionId: section.id,
        status: "unconfirmed"
      };
      await atomicJson(receiptPath, receipt);
      try {
        await apply(validated, section);
        receipt.status = "succeeded";
        await atomicJson(receiptPath, receipt);
      } catch {
        receipt.status = "unconfirmed";
      }
      return { requestId: receipt.requestId, actionId: receipt.actionId, status: receipt.status };
    });
  }
}

export function configurationActionResult(receipt) {
  return { requestId: receipt.requestId, actionId: receipt.actionId, status: receipt.status };
}
