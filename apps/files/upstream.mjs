import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const supportedTools = new Set([
  "read_text_file",
  "read_media_file",
  "read_multiple_files",
  "write_file",
  "edit_file",
  "create_directory",
  "list_directory",
  "list_directory_with_sizes",
  "move_file",
  "search_files",
  "directory_tree",
  "get_file_info",
  "list_allowed_directories"
]);

export async function connectFilesystem(roots, onFailure = () => {}) {
  // Never advertise Roots: remote clients must not replace the server's allowlist.
  const client = new Client({ name: "scholarserver-files", version: "0.1.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(import.meta.resolve("@modelcontextprotocol/server-filesystem/dist/index.js")), ...roots],
    env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp" },
    stderr: "pipe"
  });
  // Upstream diagnostics may include paths or contents; never copy them into logs.
  transport.stderr?.resume();
  await client.connect(transport);
  const { tools } = await client.listTools();
  const available = tools.filter((tool) => supportedTools.has(tool.name));
  let pending = 0;
  let unavailable = false;
  let closing = false;
  client.onclose = () => {
    unavailable = true;
    if (!closing) onFailure();
  };
  let queue = Promise.resolve();
  return {
    tools: available.map((tool) => ({ ...tool, name: `files_${tool.name}` })),
    async call(name, args) {
      const original = name.startsWith("files_") ? name.slice(6) : "";
      if (!available.some((tool) => tool.name === original)) throw new Error("Unknown file operation");
      if (pending >= 16) throw new Error("Files is busy. Try again shortly.");
      pending++;
      const deadline = Date.now() + 60_000;
      const operation = queue
        .catch(() => {})
        .then(async () => {
          if (unavailable) throw new Error("Files needs to restart before accepting more operations.");
          if (Date.now() >= deadline) throw new Error("File operation expired before starting. No changes made.");
          try {
            return await client.callTool({ name: original, arguments: args ?? {} }, undefined, { timeout: 60_000 });
          } catch (error) {
            // An interrupted write has an unknown outcome. Stop the worker instead
            // of letting the next queued request overlap it or silently retry it.
            unavailable = true;
            await client.close().catch(() => {});
            throw error;
          }
        });
      queue = operation;
      try {
        return await operation;
      } finally {
        pending--;
      }
    },
    healthy: async () => {
      if (unavailable) throw new Error("Files worker is unavailable");
      await client.ping({ timeout: 5_000 });
    },
    close: async () => {
      closing = true;
      await client.close();
    }
  };
}
