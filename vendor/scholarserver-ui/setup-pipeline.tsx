import type { ReactNode } from "react";

export interface SetupPipelineStage {
  id: string;
  label: string;
}

export function SetupProgress({ stages, current }: { stages: SetupPipelineStage[]; current: string }) {
  const activeIndex = Math.max(0, stages.findIndex((stage) => stage.id === current));
  return <ol className="ss-setup-progress" aria-label="Setup progress">
    {stages.map((stage, index) => {
      const complete = index < activeIndex;
      const active = index === activeIndex;
      return <li key={stage.id} className={active ? "ss-setup-stage ss-setup-stage-active" : complete ? "ss-setup-stage ss-setup-stage-complete" : "ss-setup-stage"} aria-current={active ? "step" : undefined}>
        <span className="ss-setup-stage-number" aria-hidden="true">{complete ? "✓" : index + 1}</span>
        <span>{stage.label}</span>
      </li>;
    })}
  </ol>;
}

export function SetupPanel({ stage, total, title, description, children, back, next, nextLabel = "Continue", nextDisabled = false, busy = false, aside }: {
  stage: number;
  total: number;
  title: string;
  description: string;
  children: ReactNode;
  back?: () => void;
  next?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
  aside?: ReactNode;
}) {
  return <section className="ss-card ss-setup-panel">
    <header className="ss-setup-panel-header">
      <span className="ss-badge">Step {stage} of {total}</span>
      <h2>{title}</h2>
      <p className="ss-card-description">{description}</p>
    </header>
    <div className="ss-setup-panel-body">{children}</div>
    {(back || next || aside) ? <footer className="ss-setup-panel-footer">
      <div>{back ? <button type="button" className="ss-button ss-button-ghost" disabled={busy} onClick={back}>Back</button> : null}</div>
      <div className="ss-setup-panel-actions">{aside}{next ? <button type="button" className="ss-button" disabled={busy || nextDisabled} onClick={next}>{busy ? <span className="ss-spinner" /> : null}{nextLabel}</button> : null}</div>
    </footer> : null}
  </section>;
}
