import { LoaderCircle } from "lucide-react";
import React from "react";

/** Presentation only. Callers retain their data and own requests and retries. */
export function SectionFeedback({
  pending,
  hasData,
  label,
  error,
  onRetry,
  className = ""
}: {
  pending: boolean;
  hasData: boolean;
  label: string;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}): React.ReactElement {
  return (
    <div className={`ss-section-feedback ${className}`} aria-live="polite" aria-atomic="true">
      {error ? (
        <span>
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
          {hasData ? `Refreshing ${label}…` : `Loading ${label}…`}
        </span>
      ) : null}
    </div>
  );
}
