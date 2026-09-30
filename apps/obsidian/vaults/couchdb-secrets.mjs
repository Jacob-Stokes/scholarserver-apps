import { randomBytes } from "node:crypto";
import { open, readFile } from "node:fs/promises";
import path from "node:path";

export async function ensureCouchDbSecrets(directory) {
  const filename = path.join(directory, "livesync-couchdb.env");
  try {
    const content = await readFile(filename, "utf8");
    const username = content.match(/^COUCHDB_USER=(.+)$/m)?.[1];
    const password = content.match(/^COUCHDB_PASSWORD=(.+)$/m)?.[1];
    if (username && password) return { username, password };
    throw new Error("Saved CouchDB administrator credentials need recovery.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const credentials = { username: "scholarserver", password: randomBytes(32).toString("base64url") };
  let file;
  try {
    file = await open(filename, "wx", 0o644);
  } catch (error) {
    if (error.code === "EEXIST") return ensureCouchDbSecrets(directory);
    throw error;
  }
  try {
    await file.writeFile(`COUCHDB_USER=${credentials.username}\nCOUCHDB_PASSWORD=${credentials.password}\n`);
    await file.sync();
  } finally {
    await file.close();
  }
  return credentials;
}
