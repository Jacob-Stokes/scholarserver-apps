export const fontOptions = [
  {
    id: "system",
    name: "System default",
    family: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  {
    id: "computer-modern",
    name: "Computer Modern Sans Serif",
    family: '"Computer Modern Sans", ui-sans-serif, system-ui, sans-serif'
  },
  { id: "nebula", name: "Nebula Sans", family: '"Nebula Sans", ui-sans-serif, system-ui, sans-serif' }
] as const;
export type FontChoice = (typeof fontOptions)[number]["id"];
const storageKey = "scholarserver.font.v1";
const changeEvent = "scholarserver:font";
let selectedFont: FontChoice = "system";

export function parseFont(value: string | null): FontChoice {
  return fontOptions.find((font) => font.id === value)?.id ?? "system";
}

export function readFont(): FontChoice {
  return selectedFont;
}

function applyFont() {
  const font = fontOptions.find((candidate) => candidate.id === selectedFont)!;
  document.documentElement.style.setProperty("--ss-font-sans", font.family);
  document.documentElement.dataset.font = selectedFont;
}

export function saveFont(value: FontChoice): boolean {
  selectedFont = parseFont(value);
  let saved = true;
  try {
    window.localStorage.setItem(storageKey, selectedFont);
  } catch {
    saved = false;
  }
  applyFont();
  window.dispatchEvent(new Event(changeEvent));
  return saved;
}

export function subscribeFont(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  return () => window.removeEventListener(changeEvent, listener);
}

// A browser preference, independent of the server-wide sign-in colour theme.
if (typeof window !== "undefined") {
  try {
    selectedFont = parseFont(window.localStorage.getItem(storageKey));
  } catch {
    // The default still works when browser storage is unavailable.
  }
  applyFont();
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    selectedFont = parseFont(event.newValue);
    applyFont();
    window.dispatchEvent(new Event(changeEvent));
  });
}
