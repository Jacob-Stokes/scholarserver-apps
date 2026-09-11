import React from "react";
import { ScholarServerLogo } from "./logo.tsx";
import { MotionSurface } from "./motion.tsx";
import { Notifications, SuccessNotice } from "./notifications.tsx";

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
  children
}: ApplicationScreenProps<T>) {
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
          <a className="ss-button ss-button-secondary ss-dashboard-link" href="/" aria-label="Back to ScholarServer">
            <span className="ss-dashboard-label-full" aria-hidden="true">
              Back to ScholarServer
            </span>
            <span className="ss-dashboard-label-short" aria-hidden="true">
              Dashboard
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
        {loading ? (
          <div className="ss-card ss-loading" role="status">
            <span className="ss-spinner" /> Loading {name}…
          </div>
        ) : null}
        <MotionSurface change={currentTab}>{children}</MotionSurface>
      </main>
    </div>
  );
}
