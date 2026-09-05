import { type Appearance, defaultAppearance, parseAppearance, themeTokens } from "./themes.ts";

const storageKey = "scholarserver.appearance.v1";
const changeEvent = "scholarserver:appearance";
let appliedAppearance = { ...defaultAppearance };

export function readAppearance(): Appearance {
  try {
    return parseAppearance(window.localStorage.getItem(storageKey));
  } catch {
    return { ...defaultAppearance };
  }
}

export function applyAppearance(appearance: Appearance) {
  appliedAppearance = appearance;
  const dark =
    appearance.mode === "dark" ||
    (appearance.mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  const tokens = themeTokens(appearance.theme, dark);
  for (const [name, value] of Object.entries(tokens)) {
    // Preserve the original light palette exactly as defined in shared CSS.
    if (appearance.theme === "original" && !dark) root.style.removeProperty(`--${name}`);
    else root.style.setProperty(`--${name}`, value);
  }
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.colourTheme = appearance.theme;
  root.dataset.mode = dark ? "dark" : "light";
}

export function saveAppearance(appearance: Appearance) {
  let saved = true;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(appearance));
  } catch {
    saved = false;
  }
  applyAppearance(appearance);
  window.dispatchEvent(new CustomEvent(changeEvent, { detail: appearance }));
  return saved;
}

export function subscribeAppearance(listener: (value: Appearance) => void) {
  const changed = (event: Event) => listener((event as CustomEvent<Appearance>).detail);
  const stored = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) listener(readAppearance());
  };
  window.addEventListener(changeEvent, changed);
  window.addEventListener("storage", stored);
  return () => {
    window.removeEventListener(changeEvent, changed);
    window.removeEventListener("storage", stored);
  };
}

// Shared entry point for Manager and app-owned configuration pages on its origin.
if (typeof window !== "undefined") {
  applyAppearance(readAppearance());
  subscribeAppearance(applyAppearance);
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => applyAppearance(appliedAppearance));
}
