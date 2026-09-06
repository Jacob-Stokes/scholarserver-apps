// The kernel sees only this filename. Research content stays on stdin, even when
// the upstream CLI expects positional arguments. This process is private to the helper.
let payload = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  payload += chunk;
  if (payload.length > 100_000) process.exit(2);
});
process.stdin.on("end", () => {
  try {
    const args = JSON.parse(payload);
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) process.exit(2);
    const entry = "/opt/logseq/resources/app.asar/logseq-cli.js";
    process.argv = [process.execPath, entry, ...args];
    require(entry);
  } catch {
    process.stderr.write("Could not start the graph command.\n");
    process.exit(2);
  }
});
