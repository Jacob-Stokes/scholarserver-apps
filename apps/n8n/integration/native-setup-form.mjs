import { AutomationConfigurationError, scheduleConfiguration } from "./configuration.mjs";
import { assertRequiredApplications } from "./requirements.mjs";
import { noteOutputFolder, researchConfiguration } from "./research-access.mjs";

export const nativeSetupFormVersion = 2;

// These are reviewed app-owned forms, not a configuration language in Manager.
const nativeTemplates = new Map([
  ["zotero-pdf-markdown", "convert-pdfs"],
  ["zotero-reading-notes", "reading-notes"],
  ["zotero-daily-digest", "research-digest"],
  ["zotero-weekly-roundup", "weekly-roundup"],
  ["zotero-reference-audit", "reference-audit"],
  ["zotero-bibliography", "bibliography"]
]);

function destinationFor(template) {
  if (template.research === "convert-pdfs") {
    return { binding: "docling", label: "Docling installation", folderLabel: "Shared PDF folder" };
  }
  return { binding: "obsidian", label: "Obsidian vault", folderLabel: "Save notes in" };
}

function folderHint(template, folder) {
  if (template.research === "convert-pdfs") {
    return "Use the same relative folder in Zotero linked attachments and Docling Research documents.";
  }
  const output = noteOutputFolder({ kind: template.research, folder: folder || "Selected folder" });
  return `Notes are saved in ${output}. Existing notes are not replaced.`;
}

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
  if (Object.hasOwn(input, "version") && input.version !== 1 && input.version !== 2) {
    throw new NativeSetupFormError("Unsupported setup form version");
  }
}

function choiceFor(application) {
  // Fixed v2 binding value contract: unpadded base64url of a UTF-8 JSON tuple.
  // This identifies a choice; only service discovery can establish authorization.
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
      typeof decoded[0] !== "string" ||
      typeof decoded[1] !== "string" ||
      !appIdPattern.test(decoded[0]) ||
      !appIdPattern.test(decoded[1])
    ) {
      return null;
    }
    const application = { workspaceId: decoded[0], id: decoded[1] };
    return choiceFor(application) === value ? application : null;
  } catch {
    return null;
  }
}

export function advertisesNativeSetup(template) {
  return nativeTemplates.has(template.id) && nativeTemplates.get(template.id) === template.research;
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

  async evaluate(templateId, suppliedValues, version = 1) {
    if (version !== 1 && version !== 2) {
      throw new NativeSetupFormError("Unsupported setup form version");
    }
    const template = this.template(templateId);
    const destination = destinationFor(template);
    const applications = (await this.researchBridge.applications()).filter(validApplication);
    const sourceRequirement = template.requirements.find((requirement) => requirement.binding === "zotero");
    const targetRequirement = template.requirements.find((requirement) => requirement.binding === destination.binding);
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
    // An unapproved v2 source can constrain the owner picker without permitting
    // folder access or submission. Those still require both authorized selections.
    let sourceWorkspace = selectedSource?.workspaceId;
    if (version === 2 && !selectedSource) sourceWorkspace = decodeChoice(sourceValue)?.workspaceId;
    const compatibleTargets = applications.filter(
      (application) =>
        application.workspaceId === sourceWorkspace &&
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
      targetError = `No compatible ${destination.label} has folder browsing access in this workspace.`;
    } else if (!targets.length) targetError = `No compatible ${destination.label} is available in this workspace.`;
    else if (!selectedTarget) targetError = `Choose a current ${destination.label} in the same workspace.`;
    let folderError = validateFolder(folderValue)
      ? undefined
      : "Enter a relative folder without hidden folders, empty names or parent paths.";
    if (!folderError && noteOutputFolder({ kind: template.research, folder: folderValue }).length > 200) {
      folderError = "Choose a shorter folder to leave room for the report subfolder.";
    }
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
        label: destination.label,
        type: "select",
        value: targetValue,
        options: targets.map((application) => applicationChoice(application, false)),
        dependsOn: ["source"],
        error: targetError,
        disabled: !sourceWorkspace
      },
      {
        id: "folder",
        label: destination.folderLabel,
        type: "folder",
        value: folderValue,
        dependsOn: ["source", "target"],
        hint: folderHint(template, folderValue),
        error: folderError,
        disabled: !selectedSource || !selectedTarget
      },
      {
        id: "interval",
        label: schedule.minutesInterval === undefined ? "Run every (hours)" : "Check every (minutes)",
        type: "number",
        value: intervalValue,
        min: schedule.minimum,
        max: schedule.maximum,
        error: intervalError
      }
    ].map((field) =>
      Object.fromEntries(Object.entries(field).filter(([, value]) => value !== undefined && value !== false))
    );

    const form = {
      version,
      description: template.description,
      notice: "Choose how often this runs. It starts paused; turn on automatic runs from Manage when you're ready.",
      fields,
      canSubmit: fields.every((field) => !field.error) && Boolean(selectedSource && selectedTarget)
    };
    if (version === 2) {
      form.bindings = [
        {
          fieldId: "source",
          packageId: sourceRequirement.packageId,
          actionIds: [...sourceRequirement.actions]
        },
        {
          fieldId: "target",
          packageId: targetRequirement.packageId,
          actionIds: [...new Set([...targetRequirement.actions, "browse-folders"])],
          dependsOn: ["source"]
        }
      ];
    }
    return form;
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
    const destination = destinationFor(template);
    const scope = {
      workspaceId: source.workspaceId,
      zotero: source.id,
      [destination.binding]: target.id,
      folder: selected.values.folder
    };
    if (requireCompleteForm) {
      researchConfiguration(template, { research: scope });
    }
    try {
      assertRequiredApplications(template.requirements, scope, applications);
    } catch {
      throw new NativeSetupFormError("The selected research applications are no longer available", 422);
    }
    const currentTarget = applications.find(
      (application) => application.workspaceId === scope.workspaceId && application.id === target.id
    );
    if (!currentTarget?.actions.includes("browse-folders")) {
      throw new NativeSetupFormError(`Folder browsing is not allowed for the selected ${destination.label}`, 422);
    }
    return { form, scope };
  }

  async folders(templateId, values, folderPath) {
    if (typeof folderPath !== "string") throw new NativeSetupFormError("Choose a folder path");
    const { scope } = await this.scopeFrom(templateId, validateValues(values), false);
    return this.researchBridge.folders({ ...scope, kind: this.template(templateId).research, folder: folderPath });
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
    const schedule = scheduleConfiguration(this.template(templateId));
    const intervalSetting = schedule.minutesInterval === undefined ? "hoursInterval" : "minutesInterval";
    return this.installations.install(
      templateId,
      { [intervalSetting]: Number(formValues.interval), research: scope },
      null,
      automationId,
      formValues.name
    );
  }
}
