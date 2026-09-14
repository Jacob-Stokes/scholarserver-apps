export type IconStyle = "editorial" | "original";

const storageKey = "scholarserver.icon-style.v1";
const changeEvent = "scholarserver:icon-style";
let selectedStyle: IconStyle = "editorial";

export function parseIconStyle(value: string | null): IconStyle {
  return value === "original" ? "original" : "editorial";
}

export function readIconStyle(): IconStyle {
  return selectedStyle;
}

export function saveIconStyle(value: IconStyle): boolean {
  selectedStyle = parseIconStyle(value);
  let saved = true;
  try {
    window.localStorage.setItem(storageKey, selectedStyle);
  } catch {
    saved = false;
  }
  window.dispatchEvent(new Event(changeEvent));
  return saved;
}

export function subscribeIconStyle(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  return () => window.removeEventListener(changeEvent, listener);
}

// This affects presentation only, including same-origin app setup frames.
// It is not part of the server-wide sign-in theme or application configuration.
if (typeof window !== "undefined") {
  try {
    selectedStyle = parseIconStyle(window.localStorage.getItem(storageKey));
  } catch {
    // Retain the default when browser storage is unavailable.
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    selectedStyle = parseIconStyle(event.newValue);
    window.dispatchEvent(new Event(changeEvent));
  });
}
