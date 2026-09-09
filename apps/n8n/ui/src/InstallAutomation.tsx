import { useState } from "react";
import { type ResearchBindings, type ResearchKind, ResearchSettings } from "./ResearchSettings";

export type Schedule = { hoursInterval: number; minimum: number; maximum: number };

export function InstallAutomation({
  schedule,
  research,
  retry,
  busy,
  onInstall
}: {
  schedule: Schedule | null;
  research?: ResearchKind | null;
  retry: boolean;
  busy: boolean;
  onInstall: (settings: { hoursInterval?: number; research?: ResearchBindings }) => void;
}) {
  // Status refreshes must not replace this unsaved choice.
  const [hours, setHours] = useState(String(schedule?.hoursInterval ?? 1));
  const [bindings, setBindings] = useState<ResearchBindings | null>(null);
  const value = Number(hours);
  const validSchedule =
    !schedule || (Number.isInteger(value) && value >= schedule.minimum && value <= schedule.maximum);
  const valid = validSchedule && (!research || bindings !== null);
  const form = (
    <form
      className="ss-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) {
          const settings: { hoursInterval?: number; research?: ResearchBindings } = {};
          if (schedule) settings.hoursInterval = value;
          if (research && bindings) settings.research = bindings;
          onInstall(settings);
        }
      }}
    >
      {research ? <ResearchSettings kind={research} busy={busy} onChange={setBindings} /> : null}
      {schedule ? (
        <label>
          Run every (hours)
          <input
            className="ss-input"
            type="number"
            min={schedule.minimum}
            max={schedule.maximum}
            step="1"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            required
            disabled={busy}
          />
        </label>
      ) : null}
      <p>The workflow is added with its schedule disabled. Review it before enabling it.</p>
      {retry ? (
        <p>The previous request was rejected. Retry sends a new installation request with these settings.</p>
      ) : null}
      <button className="ss-button" disabled={busy || !valid}>
        {retry ? "Retry installation" : "Add automation"}
      </button>
    </form>
  );
  if (!research) return form;
  return (
    <details>
      <summary>Choose apps and schedule</summary>
      {form}
    </details>
  );
}
