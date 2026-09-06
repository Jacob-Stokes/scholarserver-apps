import type { ToolRegistration } from "mcp-common";
import { z } from "zod";

type GraphCall = (operation: string, input: Record<string, unknown>) => Promise<unknown>;
const page = z.string().trim().min(1).max(250);
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const pagination = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).max(1_000_000).optional()
  })
  .strict();
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

export function graphTools(call: GraphCall): ToolRegistration[] {
  return [
    {
      def: {
        name: "graph_status",
        description: "Inspect the server's Logseq database graph. This is not proof that device sync has completed.",
        inputSchema: z.object({}).strict(),
        annotations: read
      },
      handler: () => call("status", {})
    },
    {
      def: {
        name: "search_pages",
        description: "Find research pages by title. Read the selected page before adding notes.",
        inputSchema: z.object({ query: z.string().trim().min(1).max(500) }).strict(),
        annotations: read
      },
      handler: (input) => call("search-pages", input)
    },
    {
      def: {
        name: "list_pages",
        description:
          "Browse research pages, newest updated first. Use limit and offset to page through results (default 50, maximum 100).",
        inputSchema: pagination,
        annotations: read
      },
      handler: (input) => call("list-pages", input)
    },
    {
      def: {
        name: "search_blocks",
        description:
          "Find text within notes using case-insensitive substring search. Returns graph-local db/id values for reading or editing blocks. Not semantic search; narrow the query if the result is too large.",
        inputSchema: z.object({ query: z.string().trim().min(1).max(500) }).strict(),
        annotations: read
      },
      handler: (input) => call("search-blocks", input)
    },
    {
      def: {
        name: "read_block",
        description:
          "Read a block and its children, up to eight levels deep. Use a db/id returned by this graph, not an ID from another device or graph.",
        inputSchema: z.object({ id }).strict(),
        annotations: read
      },
      handler: (input) => call("read-block", input)
    },
    {
      def: {
        name: "update_block",
        description:
          "Replace an existing block's text, preserving its children. Read it first and preserve citations and source attribution. After a timeout, inspect it before retrying. Use this graph's db/id.",
        inputSchema: z.object({ id, content: z.string().min(1).max(32_000) }).strict(),
        annotations: { ...write, destructiveHint: true, idempotentHint: true }
      },
      handler: (input) => call("update-block", input)
    },
    {
      def: {
        name: "append_child_block",
        description:
          "Append a nested research note under an existing block using this graph's db/id. After a timeout, read the parent before retrying to avoid duplicates.",
        inputSchema: z.object({ id, content: z.string().min(1).max(32_000) }).strict(),
        annotations: write
      },
      handler: (input) => call("append-child-block", input)
    },
    {
      def: {
        name: "list_tasks",
        description:
          "Browse research tasks and their current status, newest updated first. Returns this graph's db/id. Use limit and offset (default 50, maximum 100).",
        inputSchema: pagination,
        annotations: read
      },
      handler: (input) => call("list-tasks", input)
    },
    {
      def: {
        name: "list_task_statuses",
        description:
          "List the task statuses defined by this graph before changing a task. Use the returned db/ident value with set_task_status.",
        inputSchema: z.object({}).strict(),
        annotations: read
      },
      handler: (input) => call("list-task-statuses", input)
    },
    {
      def: {
        name: "set_task_status",
        description:
          "Set a task's status using this graph's db/id and a db/ident returned by list_task_statuses. Read the task first. After a timeout, check its status before retrying.",
        inputSchema: z.object({ id, status: z.string().trim().min(1).max(100) }).strict(),
        annotations: { ...write, destructiveHint: true, idempotentHint: true }
      },
      handler: (input) => call("set-task-status", input)
    },
    {
      def: {
        name: "read_page",
        description: "Read a Logseq page and its block tree, up to eight levels deep.",
        inputSchema: z.object({ page }).strict(),
        annotations: read
      },
      handler: (input) => call("read-page", input)
    },
    {
      def: {
        name: "create_page",
        description: "Create a research page if it does not already exist. Does not replace existing page contents.",
        inputSchema: z.object({ page }).strict(),
        annotations: { ...write, idempotentHint: true }
      },
      handler: (input) => call("create-page", input)
    },
    {
      def: {
        name: "append_block",
        description:
          "Append a block to an existing research page. Preserve citations, DOI links and source attribution. After a timeout, read the page before retrying to avoid duplicates.",
        inputSchema: z.object({ page, content: z.string().min(1).max(32_000) }).strict(),
        annotations: write
      },
      handler: (input) => call("append-block", input)
    },
    {
      def: {
        name: "create_task",
        description: "Add a research follow-up task to a page. After a timeout, inspect the page before retrying.",
        inputSchema: z.object({ page, content: z.string().min(1).max(4_000) }).strict(),
        annotations: write
      },
      handler: (input) => call("create-task", input)
    }
  ];
}
