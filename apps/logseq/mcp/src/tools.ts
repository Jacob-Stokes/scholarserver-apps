import type { ToolRegistration } from "mcp-common";
import { z } from "zod";

type GraphCall = (operation: string, input: Record<string, unknown>) => Promise<unknown>;
const page = z.string().trim().min(1).max(250);
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
