import { type ReactNode, useEffect, useRef } from "react";

export const EMBEDDED_SETUP_MESSAGE = "scholarserver:setup-size";
export const MEASURE_SETUP_MESSAGE = "scholarserver:measure-setup";
export const EMBEDDED_SETUP_MESSAGE_VERSION = 1;

export function setupSizeMessage(height: number) {
  return { type: EMBEDDED_SETUP_MESSAGE, version: EMBEDDED_SETUP_MESSAGE_VERSION, height: Math.ceil(height) };
}

export function isMeasureSetupMessage(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === MEASURE_SETUP_MESSAGE &&
    (value as { version?: unknown }).version === EMBEDDED_SETUP_MESSAGE_VERSION
  );
}

export function EmbeddedSetupSurface({ children }: { children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const embedded = window.parent !== window;
    if (!embedded) return;

    let frame: number | null = null;
    let lastHeight: number | null = null;

    const report = () => {
      frame = null;
      const height = Math.ceil(content.getBoundingClientRect().height);
      if (height === lastHeight) return;
      lastHeight = height;
      window.parent.postMessage(setupSizeMessage(height), window.location.origin);
    };
    const scheduleReport = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(report);
    };
    const observer = new ResizeObserver(scheduleReport);
    observer.observe(content);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return;
      if (isMeasureSetupMessage(event.data)) {
        lastHeight = null;
        scheduleReport();
      }
    };
    window.addEventListener("message", onMessage);
    scheduleReport();

    return () => {
      observer.disconnect();
      window.removeEventListener("message", onMessage);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={contentRef} className="ss-embedded-setup-surface">
      {children}
    </div>
  );
}
