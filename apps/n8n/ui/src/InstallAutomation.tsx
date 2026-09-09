import { useState } from "react";

export type Schedule = { hoursInterval: number; minimum: number; maximum: number };

export function InstallAutomation({
  schedule,
  retry,
  busy,
  onInstall
}: {
  schedule: Schedule | null;
  retry: boolean;
  busy: boolean;
  onInstall: (settings: { hoursInterval?: number }) => void;
}) {
  // Status refreshes must not replace this unsaved choice.
  const [hours, setHours] = useState(String(schedule?.hoursInterval ?? 1));
  const value = Number(hours);
  const valid = !schedule || (Number.isInteger(value) && value >= schedule.minimum && value <= schedule.maximum);
  return (
    <form
      className="ss-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onInstall(schedule ? { hoursInterval: value } : {});
      }}
    >
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
}
