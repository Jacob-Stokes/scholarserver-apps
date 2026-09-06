import { pathToFileURL } from "node:url";

// Secrets cross a private stdin pipe, not OS command arguments or environment.
// The unmodified upstream CLI still receives its documented options in-process.
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 64 * 1024) process.exit(1);
}
const { entrypoint, args } = JSON.parse(input);
if (!entrypoint.startsWith("/official-client/installed/package/") || !Array.isArray(args)) process.exit(1);
process.argv = [process.execPath, entrypoint, ...args];
await import(pathToFileURL(entrypoint).href);
