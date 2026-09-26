import { LoaderCircle } from "lucide-react";
import React from "react";

/** Presentation only. Callers retain their data and own requests and retries. */
export function SectionFeedback({
  pending,
  hasData,
  label,
  error,
  onRetry,
  inline = false,
  pendingLabel,
  className = ""
}: {
  pending: boolean;
  hasData: boolean;
  label: string;
  error?: string | null;
  onRetry?: () => void;
  inline?: boolean;
  pendingLabel?: string;
  className?: string;
}): React.ReactElement {
  return (
    <span
      className={`ss-section-feedback ${inline ? "ss-section-feedback-inline" : ""} ${className}`}
      aria-live="polite"
      aria-atomic="true"
      data-error={Boolean(error)}
    >
      {error ? (
        <span role="alert">
          {hasData ? "Shown information may be out of date. " : ""}
          {error}
          {onRetry ? (
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </span>
      ) : pending ? (
        <span role="status">
          <LoaderCircle aria-hidden="true" className="ss-section-spinner" />
          {pendingLabel ?? (hasData ? `Refreshing ${label}…` : `Loading ${label}…`)}
        </span>
      ) : null}
    </span>
  );
}
