import React from "react";
import { ScholarServerLogo } from "./logo.tsx";
import { MotionSurface } from "./motion.tsx";
import { Notifications, SuccessNotice } from "./notifications.tsx";
import { SectionFeedback } from "./section-feedback.tsx";

/** A compact settings summary; the caller owns its data and editing workflow. */
export function ApplicationSettingsRow({
  title,
  icon,
  description,
  action,
  feedback
}: {
  title: string;
  icon?: React.ReactNode;
  description: React.ReactNode;
  action?: React.ReactNode;
  feedback?: React.ReactNode;
}) {
  const headingId = React.useId();
  return (
    <section className="ss-settings-row" aria-labelledby={headingId}>
      <h2 id={headingId}>
        {icon ? (
          <span aria-hidden="true" className="ss-settings-row-icon">
            {icon}
          </span>
        ) : null}
        {title}
      </h2>
      <div
        className={
          feedback ? "ss-settings-row-description ss-settings-row-with-feedback" : "ss-settings-row-description"
        }
      >
        {description}
        {feedback}
      </div>
      {action ? <div className="ss-settings-row-action">{action}</div> : null}
    </section>
  );
}

export function applicationManagementPath(pathname: string): string {
  const instance = pathname.match(/^\/apps\/([a-z][a-z0-9-]{0,62})(?:\/|$)/)?.[1];
  return instance ? `/applications/manage/${encodeURIComponent(instance)}` : "/applications";
}

export interface ApplicationTab<T extends string> {
  id: T;
  label: string;
}

type ApplicationScreenProps<T extends string> = {
  name: string;
  description: string;
  status?: React.ReactNode;
  tabs: ApplicationTab<T>[];
  currentTab: T;
  onNavigate: (tab: T) => void;
  notice?: string | null;
  error?: string | null;
  loading?: boolean;
  feedback?: React.ReactNode;
  children: React.ReactNode;
};

// Presentation only: each application owns its routes, requests and editable state.
export function ApplicationScreen<T extends string>({
  name,
  description,
  status,
  tabs,
  currentTab,
  onNavigate,
  notice,
  error,
  loading = false,
  feedback,
  children
}: ApplicationScreenProps<T>) {
  const managementPath = applicationManagementPath(typeof window === "undefined" ? "" : window.location.pathname);
  const backLabel = managementPath === "/applications" ? "Back to applications" : `Manage ${name}`;
  return (
    <div className="ss-app">
      <Notifications />
      <SuccessNotice message={notice} />
      <header className="ss-app-header">
        <div className="ss-app-header-inner">
          <div className="ss-brand">
            <ScholarServerLogo className="ss-brand-mark" />
            <div className="ss-brand-copy">
              <p className="ss-brand-title">ScholarServer</p>
              <p className="ss-brand-context">{name}</p>
            </div>
          </div>
          <a className="ss-button ss-button-secondary ss-dashboard-link" href={managementPath} aria-label={backLabel}>
            <span className="ss-dashboard-label-full" aria-hidden="true">
              ← {backLabel}
            </span>
            <span className="ss-dashboard-label-short" aria-hidden="true">
              ← Manage
            </span>
          </a>
        </div>
      </header>
      <main className="ss-main">
        <div className="ss-page-heading">
          <div>
            <h1>{name}</h1>
            <p>{description}</p>
          </div>
          {status}
        </div>
        <nav className="ss-tabs" aria-label={`${name} sections`}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="ss-tab"
              aria-current={currentTab === tab.id ? "page" : undefined}
              aria-selected={currentTab === tab.id}
              onClick={() => onNavigate(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        {error ? (
          <div className="ss-alert ss-alert-error" role="alert">
            {error}
          </div>
        ) : null}
        {feedback ?? <SectionFeedback pending={loading && !error} hasData={false} label={name} />}
        <MotionSurface change={currentTab}>{children}</MotionSurface>
      </main>
    </div>
  );
}
