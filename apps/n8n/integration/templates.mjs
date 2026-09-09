import { createHash } from "node:crypto";
import { parseDocument } from "yaml";

// Templates are reviewed package assets, not uploaded scripts or a second engine.
// n8n remains responsible for interpreting its native node definitions.
export function readTemplate(source) {
  if (Buffer.byteLength(source) > 256 * 1024) throw new Error("Automation template is too large");
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length) throw new Error("Invalid automation template YAML");
  const template = document.toJS({ maxAliasCount: 0 });
  if (template?.schemaVersion !== 1 || !/^[a-z][a-z0-9-]{0,63}$/.test(template.id ?? "")) {
    throw new Error("Invalid automation template identity");
  }
  if (
    !Number.isInteger(template.version) ||
    template.version < 1 ||
    typeof template.name !== "string" ||
    !template.name.trim()
  ) {
    throw new Error("Invalid automation template version or name");
  }
  const workflow = template.workflow;
  if (!Array.isArray(workflow?.nodes) || workflow.nodes.length < 1 || workflow.nodes.length > 100) {
    throw new Error("Automation template requires between 1 and 100 nodes");
  }
  const names = new Set();
  const ids = new Set();
  for (const node of workflow.nodes) {
    if (
      typeof node.name !== "string" ||
      !node.name ||
      names.has(node.name) ||
      typeof node.id !== "string" ||
      !node.id ||
      ids.has(node.id)
    ) {
      throw new Error("Automation nodes require unique names and IDs");
    }
    if (
      typeof node.type !== "string" ||
      !Number.isFinite(node.typeVersion) ||
      !Array.isArray(node.position) ||
      node.position.length !== 2 ||
      !node.position.every(Number.isFinite)
    ) {
      throw new Error("Invalid automation node definition");
    }
    if (node.credentials !== undefined) throw new Error("Template credentials must be connected after installation");
    names.add(node.name);
    ids.add(node.id);
  }
  if (!workflow.connections || typeof workflow.connections !== "object" || Array.isArray(workflow.connections)) {
    throw new Error("Invalid automation connections");
  }
  for (const [sourceName, outputs] of Object.entries(workflow.connections)) {
    if (!names.has(sourceName)) throw new Error("Connection references an unknown source node");
    for (const groups of Object.values(outputs)) {
      if (!Array.isArray(groups)) throw new Error("Invalid connection groups");
      for (const targets of groups) {
        if (!Array.isArray(targets)) throw new Error("Invalid connection targets");
        for (const target of targets) {
          if (!names.has(target.node)) throw new Error("Connection references an unknown target node");
        }
      }
    }
  }
  return template;
}

export function workflowFromTemplate(template) {
  return {
    name: template.name,
    nodes: structuredClone(template.workflow.nodes),
    connections: structuredClone(template.workflow.connections),
    settings: structuredClone(template.workflow.settings ?? {})
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

// Save the fingerprint of n8n's response, not the submitted template: n8n may
// normalise settings. An edited workflow must be reviewed before replacement.
export function workflowFingerprint(workflow) {
  const editable = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(editable)))
    .digest("hex");
}

export class WorkflowEditConflict extends Error {
  constructor() {
    super("This workflow changed in n8n. Open n8n to review and enable it there.");
  }
}

export function assertWorkflowUnchanged(workflow, savedFingerprint) {
  if (!savedFingerprint || workflowFingerprint(workflow) !== savedFingerprint) {
    throw new WorkflowEditConflict();
  }
}
