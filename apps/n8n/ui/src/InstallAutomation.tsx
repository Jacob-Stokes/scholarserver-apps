import { useId, useState } from "react";
import type { AppRequirement } from "./automation-types";
import {
  type ResearchAvailability,
  type ResearchBindings,
  type ResearchKind,
  ResearchSettings
} from "./ResearchSettings";

export type Schedule = { hoursInterval?: number; minutesInterval?: number; minimum: number; maximum: number };
export type AutomationSettings = { hoursInterval?: number; minutesInterval?: number; research?: ResearchBindings };

export function InstallAutomation({
  schedule,
  research,
  retry,
  busy,
  disabledReason = null,
  requirements = [],
  expanded = false,
  onInstall
}: {
  schedule: Schedule | null;
  research?: ResearchKind | null;
  retry: boolean;
  busy: boolean;
  disabledReason?: string | null;
  requirements?: AppRequirement[];
  expanded?: boolean;
  onInstall: (settings: AutomationSettings) => void;
}) {
  // Status refreshes must not replace this unsaved choice.
  const minutes = schedule?.minutesInterval !== undefined;
  const [interval, setInterval] = useState(String(schedule?.minutesInterval ?? schedule?.hoursInterval ?? 1));
  const [bindings, setBindings] = useState<ResearchBindings | null>(null);
  const [researchAvailability, setResearchAvailability] = useState<ResearchAvailability>("loading");
  const feedbackId = useId();
  const scheduleErrorId = useId();
  const value = Number(interval);
  const validSchedule =
    !schedule || (Number.isInteger(value) && value >= schedule.minimum && value <= schedule.maximum);
  const valid = validSchedule && (!research || (researchAvailability === "ready" && bindings !== null));
  let unavailableReason = disabledReason;
  if (busy) {
    unavailableReason = "Wait for the current request to finish.";
  } else if (!unavailableReason && research && researchAvailability === "loading") {
    unavailableReason = "Wait for research app discovery to finish.";
  } else if (!unavailableReason && research && researchAvailability === "error") {
    unavailableReason = "Resolve the research app access message above.";
  } else if (!unavailableReason && research && researchAvailability === "missing-source") {
    unavailableReason = "Choose a compatible Zotero library.";
  } else if (!unavailableReason && research && researchAvailability === "missing-target") {
    unavailableReason = "Choose a compatible research app in the same workspace.";
  } else if (!unavailableReason && research && researchAvailability === "invalid-folder") {
    unavailableReason = "Enter a valid research folder.";
  } else if (!unavailableReason && validSchedule && research && !bindings) {
    unavailableReason = "Choose compatible research apps and enter a valid folder.";
  }
  const form = (
    <form
      className="automation-install-form ss-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !busy && !disabledReason) {
          const settings: AutomationSettings = {};
          if (schedule && minutes) settings.minutesInterval = value;
          else if (schedule) settings.hoursInterval = value;
          if (research && bindings) settings.research = bindings;
          onInstall(settings);
        }
      }}
    >
      {research ? (
        <ResearchSettings
          kind={research}
          requirements={requirements}
          busy={busy}
          onChange={setBindings}
          onAvailabilityChange={setResearchAvailability}
        />
      ) : null}
      {schedule ? (
        <fieldset className="automation-setup-group automation-schedule">
          <legend>Schedule</legend>
          <div className="automation-field-grid">
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
                aria-invalid={!validSchedule}
                aria-describedby={!validSchedule ? scheduleErrorId : undefined}
              />
            </label>
            {!validSchedule ? (
              <p className="automation-field-hint" id={scheduleErrorId} role="status">
                Enter a whole number from {schedule.minimum} to {schedule.maximum} {minutes ? "minutes" : "hours"}.
              </p>
            ) : null}
          </div>
        </fieldset>
      ) : null}
      <div className="automation-submit">
        <div className="ss-stack">
          <p>
            Choose how often this runs. It starts paused; turn on automatic runs from Manage when you&apos;re ready.
          </p>
          {retry ? (
            <p>The previous request was rejected. Retry sends a new installation request with these settings.</p>
          ) : null}
          {unavailableReason ? (
            <p id={feedbackId} role="status">
              {unavailableReason}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          className="ss-button"
          disabled={busy || !valid || Boolean(disabledReason)}
          aria-describedby={unavailableReason ? feedbackId : undefined}
        >
          {retry ? "Retry installation" : "Add automation"}
        </button>
      </div>
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
