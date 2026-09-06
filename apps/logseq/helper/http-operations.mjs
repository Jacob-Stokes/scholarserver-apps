import { randomUUID } from "node:crypto";
import { GraphError, graphCommand } from "./operations.mjs";
import { prepareReferences, readableTitles } from "./references.mjs";
import { keyword as k, list, map, symbol as s, uuid } from "./worker-http.mjs";

const identity = [k("db/id"), k("block/uuid"), k("block/name"), k("block/title")];
const nodeFields = [
  s("*"),
  ...identity,
  map({
    "logseq.property/status": [k("db/ident"), k("block/title")],
    "block/tags": [...identity, k("db/ident")],
    "block/page": identity,
    "block/parent": identity
  })
];
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function treeSelector(depth) {
  return [...nodeFields, ...(depth ? [map({ "block/_parent": treeSelector(depth - 1) })] : [])];
}

function tree(node) {
  const { "block/_parent": children = [], ...data } = node;
  return {
    ...data,
    "block/children": children
      .filter((child) => !child["logseq.property/deleted-at"])
      .sort((a, b) => compare(a["block/order"] ?? "", b["block/order"] ?? ""))
      .map(tree)
  };
}

// Fixed operations only. Logseq's worker still owns transactions and encrypted sync.
export class HttpOperations {
  #tail = Promise.resolve();
  #pending = 0;

  constructor({ worker, graph, timeoutMs = 60_000 }) {
    this.worker = worker;
    this.graph = graph;
    this.timeoutMs = timeoutMs;
  }

  execute(operation, input = {}) {
    graphCommand(operation, input); // Share the established boundary validation with the CLI reference path.
    if (this.#pending >= 16) return Promise.reject(new GraphError("busy", "Logseq is busy. Try again shortly.", 503));
    this.#pending++;
    const deadline = Date.now() + this.timeoutMs;
    const result = this.#tail.then(async () => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new GraphError("busy", "Logseq was busy. This operation was not started.", 503);
      const signal = AbortSignal.timeout(remaining);
      let started = false;
      try {
        await this.worker.check(signal);
        signal.throwIfAborted();
        started = true;
        return await this.operation(operation, input, (method, args) => this.worker.invoke(method, args, signal));
      } catch (error) {
        if (error instanceof GraphError) throw error;
        // Never repeat a request after dispatch: a lost response does not imply a failed write.
        throw new GraphError(
          started ? "outcome-unknown" : "unavailable",
          started
            ? "The connection to Logseq was interrupted. Check the graph before repeating a change."
            : "Logseq is unavailable. Restart the helper and try again.",
          503
        );
      }
    });
    this.#tail = result.catch(() => {});
    return result.finally(() => {
      this.#pending--;
    });
  }

  async operation(operation, input, call) {
    const pull = (lookup, selector = identity) => call("pull", [selector, lookup]);
    const required = async (lookup, selector) => {
      const node = await pull(lookup, selector);
      if (!node?.["block/uuid"] || node["logseq.property/deleted-at"])
        throw new GraphError("not-found", "That page or block was not found.", 404);
      return node;
    };
    const query = (q, ...args) => call("q", [[q, ...args]]);
    const apply = (ops) => call("apply-outliner-ops", [ops, map()]);
    const ensurePage = async (title) => {
      const lookup = [k("block/name"), title];
      let node = await pull(lookup);
      if (!node?.["db/id"]) {
        await apply([[k("create-page"), [title, map()]]]);
        node = await required(lookup);
      }
      return node;
    };
    const statuses = () =>
      query([
        k("find"),
        [list(s("pull"), s("?v"), [k("db/id"), k("db/ident"), k("block/order")]), s("...")],
        k("where"),
        [s("?p"), k("db/ident"), k("logseq.property/status")],
        [s("?v"), k("block/closed-value-property"), s("?p")]
      ]);
    const taskOperations = async (blockUuid, status) => {
      const available = await statuses();
      if (!available.some((item) => item["db/ident"] === status))
        throw new GraphError("invalid-status", "Choose one of the task statuses returned by list_task_statuses.");
      const tag = await pull([k("db/ident"), k("logseq.class/Task")]);
      if (!tag?.["db/id"]) throw new GraphError("missing-task-tag", "Logseq's Task tag is missing.", 503);
      return [
        [k("batch-set-property"), [[uuid(blockUuid)], k("block/tags"), tag["db/id"], map()]],
        [k("batch-set-property"), [[uuid(blockUuid)], k("logseq.property/status"), k(status), map()]]
      ];
    };

    switch (operation) {
      case "status": {
        const rows = await query([
          k("find"),
          s("?ident"),
          s("?value"),
          k("where"),
          [s("?e"), k("db/ident"), s("?ident")],
          [list(s("namespace"), s("?ident")), s("?ns")],
          [list(s("="), "logseq.kv", s("?ns"))],
          [s("?e"), k("kv/value"), s("?value")]
        ]);
        const kv = Object.fromEntries(rows);
        return {
          graph: this.graph,
          "logseq.kv/graph-created-at": kv["logseq.kv/graph-created-at"] ?? null,
          "logseq.kv/schema-version": kv["logseq.kv/schema-version"] ?? null,
          kv
        };
      }
      case "list-pages":
      case "list-tasks": {
        const items = await call(operation === "list-pages" ? "cli-list-pages" : "cli-list-tasks", [map()]);
        items.sort((a, b) => (b["block/updated-at"] ?? 0) - (a["block/updated-at"] ?? 0) || b["db/id"] - a["db/id"]);
        return readableTitles(
          { items: items.slice(input.offset ?? 0, (input.offset ?? 0) + (input.limit ?? 50)) },
          pull
        );
      }
      case "list-task-statuses":
        return { result: await statuses() };
      case "search-pages":
      case "search-blocks": {
        const attr = k(operation === "search-pages" ? "block/name" : "block/title");
        const items = await query(
          [
            k("find"),
            [list(s("pull"), s("?e"), nodeFields), s("...")],
            k("in"),
            s("$"),
            s("?query"),
            k("where"),
            [s("?e"), attr, s("?title")],
            [list(s("clojure.string/lower-case"), s("?title")), s("?lower")],
            [list(s("clojure.string/includes?"), s("?lower"), s("?query"))]
          ],
          input.query.toLowerCase()
        );
        return readableTitles(
          {
            items: items
              .filter((item) => !item["logseq.property/deleted-at"])
              .sort(
                (a, b) =>
                  compare(a["block/title"].toLowerCase(), b["block/title"].toLowerCase()) || a["db/id"] - b["db/id"]
              )
          },
          pull
        );
      }
      case "read-page":
      case "read-block": {
        const root = tree(
          await required(operation === "read-page" ? [k("block/name"), input.page] : input.id, treeSelector(8))
        );
        const references = await call("get-block-refs", [root["db/id"]]);
        return readableTitles({ root, "linked-references": { count: references.length, blocks: references } }, pull);
      }
      case "create-page":
        return { result: [(await ensurePage(input.page))["db/id"]] };
      case "set-task-status": {
        const block = await required(input.id);
        await apply(await taskOperations(block["block/uuid"], input.status));
        return { result: [input.id] };
      }
      case "update-block": {
        const block = await required(input.id);
        const { refs, content } = await prepareReferences(input.content, ensurePage, pull);
        await apply([
          [
            k("save-block"),
            [map({ "block/uuid": uuid(block["block/uuid"]), "block/title": content, "block/refs": refs }), map()]
          ]
        ]);
        return { result: null };
      }
      default: {
        const target = await required(operation === "append-child-block" ? input.id : [k("block/name"), input.page]);
        const blockUuid = randomUUID();
        const extra = operation === "create-task" ? await taskOperations(blockUuid, "logseq.property/status.todo") : [];
        const { refs, content } = await prepareReferences(input.content, ensurePage, pull);
        const block = map({
          "block/uuid": uuid(blockUuid),
          "block/title": content,
          ...(refs.length ? { "block/refs": refs } : {})
        });
        await apply([
          [
            k("insert-blocks"),
            [
              [block],
              uuid(target["block/uuid"]),
              map({
                "sibling?": false,
                "bottom?": operation !== "create-task",
                "keep-uuid?": true,
                "outliner-op": k("insert-blocks")
              })
            ]
          ],
          ...extra
        ]);
        return { result: [(await required([k("block/uuid"), uuid(blockUuid)]))["db/id"]] };
      }
    }
  }
}
