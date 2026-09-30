import { createServer } from "node:http";
import { VaultWorkers } from "../vaults/workers.mjs";

const workers = new VaultWorkers({ role: "livesync" });
let stopping = false;
let registryError = null;
function reconcile() {
  try {
    workers.reconcile();
    registryError = null;
  } catch {
    registryError = "Vault connections are not yet available or need recovery.";
  }
}
reconcile();
const timer = setInterval(reconcile, 2000);
createServer((_request, response) => {
  response.writeHead(stopping || registryError ? 503 : 200, { "content-type": "application/json" });
  response.end(JSON.stringify({ status: stopping ? "stopping" : "ok", registryError }));
}).listen(8081, "0.0.0.0");
process.once("SIGTERM", () => {
  stopping = true;
  clearInterval(timer);
  void workers.stop().finally(() => process.exit(0));
});
