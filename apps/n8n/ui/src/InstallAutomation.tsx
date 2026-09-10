import { useState } from "react";
import type { AppRequirement } from "./automation-types";
import { type ResearchBindings, type ResearchKind, ResearchSettings } from "./ResearchSettings";

export type Schedule = { hoursInterval?: number; minutesInterval?: number; minimum: number; maximum: number };
export type AutomationSettings = { hoursInterval?: number; minutesInterval?: number; research?: ResearchBindings };

export function InstallAutomation({
  schedule,
  research,
  retry,
  busy,
  requirements = [],
  expanded = false,
  onInstall
}: {
  schedule: Schedule | null;
  research?: ResearchKind | null;
  retry: boolean;
  busy: boolean;
  requirements?: AppRequirement[];
  expanded?: boolean;
  onInstall: (settings: AutomationSettings) => void;
}) {
  // Status refreshes must not replace this unsaved choice.
  const minutes = schedule?.minutesInterval !== undefined;
  const [interval, setInterval] = useState(String(schedule?.minutesInterval ?? schedule?.hoursInterval ?? 1));
  const [bindings, setBindings] = useState<ResearchBindings | null>(null);
  const value = Number(interval);
  const validSchedule =
    !schedule || (Number.isInteger(value) && value >= schedule.minimum && value <= schedule.maximum);
  const valid = validSchedule && (!research || bindings !== null);
  const form = (
    <form
      className="ss-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) {
          const settings: AutomationSettings = {};
          if (schedule && minutes) settings.minutesInterval = value;
          else if (schedule) settings.hoursInterval = value;
          if (research && bindings) settings.research = bindings;
          onInstall(settings);
        }
      }}
    >
      {research ? (
        <ResearchSettings kind={research} requirements={requirements} busy={busy} onChange={setBindings} />
      ) : null}
      {schedule ? (
        <label>
          {minutes ? "Check every (minutes)" : "Run every (hours)"}
          <input
            className="ss-input"
            type="number"
            min={schedule.minimum}
            max={schedule.maximum}
            step="1"
            value={interval}
            onChange={(event) => setInterval(event.target.value)}
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
  if (!research || expanded) return form;
  return (
    <details>
      <summary>Choose apps and schedule</summary>
      {form}
    </details>
  );
}
