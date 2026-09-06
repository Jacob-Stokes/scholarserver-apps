const storageKey = "scholarserver.animations-off.v1";
const changeEvent = "scholarserver:motion";
let animationsOff = false;

export function parseAnimationsOff(value: string | null): boolean {
  return value === "true";
}

export function shouldReduceMotion(disabled: boolean, deviceReduced: boolean): boolean {
  return disabled || deviceReduced;
}

export function readAnimationsOff(): boolean {
  return animationsOff;
}

export function motionIsReduced(): boolean {
  if (typeof window === "undefined") return true;
  return shouldReduceMotion(animationsOff, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function applyMotionPreference() {
  document.documentElement.dataset.motion = motionIsReduced() ? "off" : "on";
}

export function saveAnimationsOff(disabled: boolean): boolean {
  animationsOff = disabled;
  let saved = true;
  try {
    window.localStorage.setItem(storageKey, String(disabled));
  } catch {
    saved = false;
  }
  applyMotionPreference();
  window.dispatchEvent(new Event(changeEvent));
  return saved;
}

export function subscribeMotion(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  return () => window.removeEventListener(changeEvent, listener);
}

if (typeof window !== "undefined") {
  try {
    animationsOff = parseAnimationsOff(window.localStorage.getItem(storageKey));
  } catch {
    // Keep an in-memory preference when browser storage is unavailable.
  }
  applyMotionPreference();
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => {
    applyMotionPreference();
    window.dispatchEvent(new Event(changeEvent));
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    animationsOff = parseAnimationsOff(event.newValue);
    applyMotionPreference();
    window.dispatchEvent(new Event(changeEvent));
  });
}
