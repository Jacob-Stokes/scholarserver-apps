export class GraphError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function text(input, field, maximum) {
  const value = input[field];
  if (typeof value !== "string" || !value.trim() || value.length > maximum || value.includes("\0")) {
    throw new GraphError("invalid-input", `Provide ${field} between 1 and ${maximum} characters.`);
  }
  return value;
}

function fields(input, permitted) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new GraphError("invalid-input", "Provide an operation object.");
  }
  for (const field of Object.keys(input)) {
    if (!permitted.includes(field)) throw new GraphError("invalid-input", `Unexpected field: ${field}.`);
  }
}

function integer(input, field, fallback, maximum) {
  const value = input[field] ?? fallback;
  const minimum = field === "offset" ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new GraphError("invalid-input", `Provide ${field} between ${minimum} and ${maximum}.`);
  }
  return value;
}

function blockId(input) {
  return integer(input, "id", undefined, Number.MAX_SAFE_INTEGER);
}

function pagination(input) {
  return [`--limit=${integer(input, "limit", 50, 100)}`, `--offset=${integer(input, "offset", 0, 1_000_000)}`];
}

// Deliberately small: neither a general CLI bridge nor direct database access.
export function graphCommand(operation, input = {}) {
  switch (operation) {
    case "status":
      fields(input, []);
      return ["graph", "info"];
    case "search-pages":
      fields(input, ["query"]);
      return ["search", "page", `--content=${text(input, "query", 500)}`];
    case "search-blocks":
      fields(input, ["query"]);
      return ["search", "block", `--content=${text(input, "query", 500)}`];
    case "list-pages":
      fields(input, ["limit", "offset"]);
      return ["list", "page", ...pagination(input)];
    case "list-tasks":
      fields(input, ["limit", "offset"]);
      return ["list", "task", ...pagination(input)];
    case "list-task-statuses":
      fields(input, []);
      return ["query", "--name=list-status"];
    case "read-block":
      fields(input, ["id"]);
      return ["show", `--id=${blockId(input)}`, "--level", "8"];
    case "update-block":
      fields(input, ["id", "content"]);
      return ["upsert", "block", `--id=${blockId(input)}`, `--content=${text(input, "content", 32_000)}`];
    case "append-child-block":
      fields(input, ["id", "content"]);
      return [
        "upsert",
        "block",
        `--target-id=${blockId(input)}`,
        `--content=${text(input, "content", 32_000)}`,
        "--pos",
        "last-child"
      ];
    case "set-task-status":
      fields(input, ["id", "status"]);
      return ["upsert", "task", `--id=${blockId(input)}`, `--status=${text(input, "status", 100)}`];
    case "read-page":
      fields(input, ["page"]);
      return ["show", `--page=${text(input, "page", 250)}`, "--level", "8"];
    case "create-page":
      fields(input, ["page"]);
      return ["upsert", "page", `--page=${text(input, "page", 250)}`];
    case "append-block":
      fields(input, ["page", "content"]);
      return [
        "upsert",
        "block",
        `--target-page=${text(input, "page", 250)}`,
        `--content=${text(input, "content", 32_000)}`,
        "--pos",
        "last-child"
      ];
    case "create-task":
      fields(input, ["page", "content"]);
      return [
        "upsert",
        "task",
        `--target-page=${text(input, "page", 250)}`,
        `--content=${text(input, "content", 4_000)}`
      ];
    default:
      throw new GraphError("unknown-operation", "This graph operation is not available.");
  }
}

export function validateGraphName(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/.test(value)) {
    throw new GraphError("invalid-graph", "Use a graph name with letters, numbers, spaces, hyphens or underscores.");
  }
  return value;
}
