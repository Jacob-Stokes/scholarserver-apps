// Design model only: no upload transport or public job enumeration is enabled.
// Persist `submitting` before a future write; restart cannot prove it failed.
export function recoverIngest(record) {
  if (record.phase === "submitting") return { ...record, phase: "unknown" };
  return { ...record };
}

export function advanceIngest(record, event) {
  if (event.type === "submit") {
    if (record.phase !== "prepared" || event.confirmed !== true) throw new Error("submission_not_allowed");
    return { ...record, phase: "submitting" };
  }
  if (event.type === "uncertain" && record.phase === "submitting") return { ...record, phase: "unknown" };
  if (
    event.type === "accepted" &&
    record.phase === "submitting" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.taskId)
  ) {
    return { ...record, phase: "processing", taskId: event.taskId };
  }
  if (
    event.type === "completed" &&
    record.phase === "processing" &&
    Number.isSafeInteger(event.documentId) &&
    event.documentId > 0
  ) {
    return { ...record, phase: "complete", documentId: event.documentId };
  }
  if (event.type === "failed" && record.phase === "processing") return { ...record, phase: "failed" };
  throw new Error("invalid_ingest_transition");
}
