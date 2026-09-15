import { AutomationConfigurationError, scheduleConfiguration } from "./configuration.mjs";
import { assertRequiredApplications } from "./requirements.mjs";

export const nativeSetupTemplateId = "zotero-pdf-markdown";
export const nativeSetupFormVersion = 1;

const valueKeys = ["name", "source", "target", "folder", "interval"];
const appIdPattern = /^[a-z0-9][a-z0-9-]{0,62}$/;

export class NativeSetupFormError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function assertNativeSetupRequest(input, allowedKeys) {
  if (!input || Array.isArray(input) || typeof input !== "object") {
    throw new NativeSetupFormError("Invalid request");
  }
  if (Object.keys(input).some((key) => !allowedKeys.includes(key))) {
    throw new NativeSetupFormError("Unknown request field");
  }
}

function choiceFor(application) {
  return Buffer.from(JSON.stringify([application.workspaceId, application.id])).toString("base64url");
}

function applicationChoice(application, includeWorkspace) {
  return {
    value: choiceFor(application),
    label: includeWorkspace ? `${application.id} (${application.workspaceId})` : application.id
  };
}

function validApplication(application) {
  return (
    application &&
    appIdPattern.test(application.id ?? "") &&
    appIdPattern.test(application.workspaceId ?? "") &&
    typeof application.packageId === "string" &&
    Array.isArray(application.actions) &&
    application.actions.every((action) => typeof action === "string")
  );
}

function validateValues(values) {
  if (!values || Array.isArray(values) || typeof values !== "object") {
    throw new NativeSetupFormError("Setup values must be an object");
  }
  if (Object.keys(values).some((key) => !valueKeys.includes(key))) {
    throw new NativeSetupFormError("Unknown setup form field");
  }
  if (Object.values(values).some((value) => typeof value !== "string")) {
    throw new NativeSetupFormError("Setup form values must be text");
  }
  if (Object.values(values).some((value) => value.length > 2000)) {
    throw new NativeSetupFormError("Setup form values must be at most 2000 characters");
  }
  return values;
}

function validateFolder(value) {
  return (
    value.length > 0 &&
    value.length <= 200 &&
    value.split("/").every((part) => part && !part.startsWith(".") && !/[\\\x00-\x1f]/.test(part))
  );
}

function matchingChoice(applications, value) {
  return applications.find((application) => choiceFor(application) === value);
}

function decodeChoice(value) {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 2 ||
      !appIdPattern.test(decoded[0] ?? "") ||
      !appIdPattern.test(decoded[1] ?? "")
    ) {
      return null;
    }
    return { workspaceId: decoded[0], id: decoded[1] };
  } catch {
    return null;
  }
}

export function advertisesNativeSetup(template) {
  return template.id === nativeSetupTemplateId && template.research === "convert-pdfs";
}

export class N8nNativeSetupForm {
  constructor({ templates, researchBridge, installations, requiredClient }) {
    this.templates = templates;
    this.researchBridge = researchBridge;
    this.installations = installations;
    this.requiredClient = requiredClient;
  }

  template(templateId) {
    const template = this.templates.find((candidate) => candidate.id === templateId);
    if (!template || !advertisesNativeSetup(template)) {
      throw new NativeSetupFormError("This automation does not support native setup");
    }
    return template;
  }

  async evaluate(templateId, suppliedValues) {
    const template = this.template(templateId);
    const applications = (await this.researchBridge.applications()).filter(validApplication);
    const sourceRequirement = template.requirements.find((requirement) => requirement.binding === "zotero");
    const targetRequirement = template.requirements.find((requirement) => requirement.binding === "docling");
    const sources = applications.filter(
      (application) =>
        application.packageId === sourceRequirement.packageId &&
        sourceRequirement.actions.every((action) => application.actions.includes(action))
    );

    const initial = suppliedValues === undefined;
    const values = initial ? {} : validateValues(suppliedValues);
    const initialSource = sources.length === 1 ? choiceFor(sources[0]) : "";
    const sourceValue = initial ? initialSource : (values.source ?? "");
    const selectedSource = matchingChoice(sources, sourceValue);
    const compatibleTargets = applications.filter(
      (application) =>
        application.workspaceId === selectedSource?.workspaceId &&
        application.packageId === targetRequirement.packageId &&
        targetRequirement.actions.every((action) => application.actions.includes(action))
    );
    const targets = compatibleTargets.filter((application) => application.actions.includes("browse-folders"));
    let targetValue;
    if (!initial) {
      targetValue = values.target ?? "";
    } else if (targets.length === 1) {
      targetValue = choiceFor(targets[0]);
    } else {
      targetValue = "";
    }
    const selectedTarget = matchingChoice(targets, targetValue);
    const nameValue = initial ? template.name : (values.name ?? "");
    const folderValue = initial ? "" : (values.folder ?? "");
    const schedule = scheduleConfiguration(template);
    const initialInterval = schedule.minutesInterval ?? schedule.hoursInterval;
    const intervalValue = initial ? String(initialInterval) : (values.interval ?? "");
    const interval = Number(intervalValue);

    let nameError;
    const trimmedName = nameValue.trim();
    if (!trimmedName || trimmedName.length > 120 || /[\x00-\x1f\x7f]/.test(nameValue)) {
      nameError = "Enter a name of up to 120 characters without control characters.";
    }
    let sourceError;
    if (!sources.length) sourceError = "No compatible Zotero library is available.";
    else if (!selectedSource) sourceError = "Choose a current Zotero library.";
    let targetError;
    if (!selectedSource) targetError = "Choose a Zotero library first.";
    else if (compatibleTargets.length > 0 && !targets.length) {
      targetError = "No compatible Docling installation has folder browsing access in this workspace.";
    } else if (!targets.length) targetError = "No compatible Docling installation is available in this workspace.";
    else if (!selectedTarget) targetError = "Choose a current Docling installation in the same workspace.";
    const folderError = validateFolder(folderValue)
      ? undefined
      : "Enter a relative folder without hidden folders, empty names or parent paths.";
    const intervalError =
      Number.isInteger(interval) && interval >= schedule.minimum && interval <= schedule.maximum
        ? undefined
        : `Enter a whole number from ${schedule.minimum} to ${schedule.maximum}.`;

    const fields = [
      { id: "name", label: "Automation name", type: "text", value: nameValue, error: nameError },
      {
        id: "source",
        label: "Zotero library",
        type: "select",
        value: sourceValue,
        options: sources.map((application) => applicationChoice(application, true)),
        error: sourceError
      },
      {
        id: "target",
        label: "Docling installation",
        type: "select",
        value: targetValue,
        options: targets.map((application) => applicationChoice(application, false)),
        dependsOn: ["source"],
        error: targetError,
        disabled: !selectedSource
      },
      {
        id: "folder",
        label: "Shared PDF folder",
        type: "folder",
        value: folderValue,
        dependsOn: ["source", "target"],
        hint: "Use the same relative folder in Zotero linked attachments and Docling Research documents.",
        error: folderError,
        disabled: !selectedSource || !selectedTarget
      },
      {
        id: "interval",
        label: "Check every (minutes)",
        type: "number",
        value: intervalValue,
        min: schedule.minimum,
        max: schedule.maximum,
        error: intervalError
      }
    ].map((field) =>
      Object.fromEntries(Object.entries(field).filter(([, value]) => value !== undefined && value !== false))
    );

    return {
      version: nativeSetupFormVersion,
      description: template.description,
      notice: "The automation is added with its schedule disabled. Review it before enabling it.",
      fields,
      canSubmit: fields.every((field) => !field.error) && Boolean(selectedSource && selectedTarget)
    };
  }

  selectionFrom(form) {
    const values = Object.fromEntries(form.fields.map((field) => [field.id, field.value]));
    const sourceField = form.fields.find((field) => field.id === "source");
    const targetField = form.fields.find((field) => field.id === "target");
    const source = sourceField.options.find((option) => option.value === sourceField.value);
    const target = targetField.options.find((option) => option.value === targetField.value);
    if (!source || !target) throw new NativeSetupFormError("Choose current research applications", 422);
    return { values, sourceValue: source.value, targetValue: target.value };
  }

  async scopeFrom(templateId, values, requireCompleteForm = true) {
    const form = await this.evaluate(templateId, values);
    if (requireCompleteForm && !form.canSubmit) {
      throw new NativeSetupFormError("Correct the setup form before submitting", 422);
    }
    const selected = this.selectionFrom(form);
    const source = decodeChoice(selected.sourceValue);
    const target = decodeChoice(selected.targetValue);
    if (!source || !target || source.workspaceId !== target.workspaceId) {
      throw new NativeSetupFormError("Choose current research applications", 422);
    }
    const applications = await this.researchBridge.applications();
    const template = this.template(templateId);
    const scope = {
      workspaceId: source.workspaceId,
      zotero: source.id,
      docling: target.id,
      folder: selected.values.folder
    };
    try {
      assertRequiredApplications(template.requirements, scope, applications);
    } catch {
      throw new NativeSetupFormError("The selected research applications are no longer available", 422);
    }
    const currentTarget = applications.find(
      (application) => application.workspaceId === scope.workspaceId && application.id === scope.docling
    );
    if (!currentTarget?.actions.includes("browse-folders")) {
      throw new NativeSetupFormError("Folder browsing is not allowed for the selected Docling installation", 422);
    }
    return { form, scope };
  }

  async folders(templateId, values, folderPath) {
    if (typeof folderPath !== "string") throw new NativeSetupFormError("Choose a folder path");
    const { scope } = await this.scopeFrom(templateId, validateValues(values), false);
    return this.researchBridge.folders({ ...scope, folder: folderPath });
  }

  async submit(templateId, values, automationId) {
    if (typeof automationId !== "string" || !/^[a-f0-9-]{36}$/.test(automationId)) {
      throw new NativeSetupFormError("Invalid automation identity");
    }
    const { form, scope } = await this.scopeFrom(templateId, validateValues(values));
    const formValues = Object.fromEntries(form.fields.map((field) => [field.id, field.value]));
    try {
      await this.installations.validateInstallRequest(templateId, automationId, formValues.name);
    } catch (error) {
      if (error instanceof AutomationConfigurationError) {
        throw new NativeSetupFormError(error.message, 422);
      }
      throw error;
    }
    await this.requiredClient();
    return this.installations.install(
      templateId,
      { minutesInterval: Number(formValues.interval), research: scope },
      null,
      automationId,
      formValues.name
    );
  }
}
