import { open, unlink } from "node:fs/promises";

const readActions = new Set(["version", "deckNames", "modelNames", "modelFieldNames", "findNotes", "notesInfo"]);

/** One instance per desktop. Anki owns its collection; this client never opens it. */
export class AnkiClient {
  private busy = false;
  constructor(
    private readonly endpoint: string,
    private readonly key: string,
    private readonly pendingFile: string,
    private readonly writesEnabled = false,
    private readonly request: typeof fetch = fetch,
    private readonly timeoutMs = 15_000
  ) {
    const url = new URL(endpoint);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error("Use a private AnkiConnect origin without credentials or a path.");
    }
    if (!["http:", "https:"].includes(url.protocol) || key.length < 32) {
      throw new Error("A private AnkiConnect address and service key are required.");
    }
  }

  async invoke(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const writing = action === "addNote";
    if (!readActions.has(action) && !writing) throw new Error("This Anki operation is not enabled.");
    if (writing && !this.writesEnabled) throw new Error("Card creation has not been enabled by the operator.");
    if (this.busy) throw new Error("Anki is busy. No operation was queued.");
    this.busy = true;
    let journalCreated = false;
    try {
      if (writing) {
        // O_EXCL is also the cross-process write lock. Never clear a prior marker
        // automatically: a terminated or timed-out request may have created a note.
        let marker;
        try {
          marker = await open(this.pendingFile, "wx", 0o600);
        } catch {
          throw new Error("Card creation is paused. Inspect the previous outcome before operator recovery.");
        }
        journalCreated = true;
        try {
          await marker.writeFile('{"operation":"addNote","outcome":"unknown"}\n');
          await marker.sync();
        } finally {
          await marker.close();
        }
      }
      const response = await this.request(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, version: 6, key: this.key, params }),
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!response.ok || !response.body) throw new Error("Invalid Anki response.");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > 1_048_576) {
            await reader.cancel();
            throw new Error("Anki response exceeds the limit.");
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!result || result.error !== null || !("result" in result)) throw new Error("Invalid Anki response.");
      if (writing) {
        if (!Number.isSafeInteger(result.result) || result.result <= 0) throw new Error("Invalid note identifier.");
        await unlink(this.pendingFile);
        journalCreated = false;
      }
      return result.result;
    } catch {
      if (journalCreated) {
        throw new Error("Card creation outcome is unknown. Inspect Anki before recovery; do not retry.");
      }
      // Do not forward upstream errors, URLs, note fields or credentials.
      throw new Error("Anki could not complete the request. Check desktop availability and any pending operation.");
    } finally {
      this.busy = false;
    }
  }
}
