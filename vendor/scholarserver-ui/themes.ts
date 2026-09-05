export const colourThemes = [
  { id: "original", name: "ScholarServer — Original", primary: "#176c54", paper: "#f7f8f5", accent: "#5b9d87" },
  { id: "euler", name: "Euler", primary: "#234e70", paper: "#f8f5ec", accent: "#b48b42" },
  { id: "darwin", name: "Darwin", primary: "#45603b", paper: "#f5f1e6", accent: "#896446" },
  { id: "du-bois", name: "Du Bois", primary: "#822d42", paper: "#faf5e9", accent: "#d4a72c" },
  { id: "leonardo", name: "Leonardo", primary: "#76543b", paper: "#f6efe2", accent: "#b46b50" },
  { id: "newton", name: "Newton", primary: "#273b67", paper: "#f8f8f5", accent: "#8262ad" },
  { id: "humboldt", name: "Humboldt", primary: "#32614b", paper: "#f5f4eb", accent: "#427e9c" },
  { id: "merian", name: "Maria Sibylla Merian", primary: "#4b663c", paper: "#faf5e8", accent: "#c87738" },
  { id: "goethe", name: "Goethe", primary: "#866114", paper: "#faf7ef", accent: "#69518a" },
  { id: "cajal", name: "Cajal", primary: "#59473b", paper: "#f7f4eb", accent: "#b77881" },
  { id: "lovelace", name: "Ada Lovelace", primary: "#235e67", paper: "#f7f7f3", accent: "#b65564" },
  { id: "copernicus", name: "Copernicus", primary: "#944738", paper: "#faf5e9", accent: "#484540" },
  { id: "du-chatelet", name: "Émilie du Châtelet", primary: "#49627f", paper: "#f7f5f1", accent: "#ac8c4d" }
] as const;

export type ColourTheme = (typeof colourThemes)[number]["id"];
export type Appearance = { theme: ColourTheme; mode: "light" | "dark" | "system" };
export const defaultAppearance: Appearance = { theme: "original", mode: "light" };

export function parseAppearance(value: string | null): Appearance {
  try {
    const parsed = JSON.parse(value ?? "null");
    return {
      theme: colourThemes.some((theme) => theme.id === parsed?.theme) ? parsed.theme : defaultAppearance.theme,
      mode: ["light", "dark", "system"].includes(parsed?.mode) ? parsed.mode : defaultAppearance.mode
    };
  } catch {
    return { ...defaultAppearance };
  }
}

function mix(first: string, second: string, weight: number) {
  const channels = [1, 3, 5].map((offset) => {
    const a = Number.parseInt(first.slice(offset, offset + 2), 16);
    const b = Number.parseInt(second.slice(offset, offset + 2), 16);
    return Math.round(a * (1 - weight) + b * weight)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

export function themeTokens(id: ColourTheme, dark: boolean): Record<string, string> {
  const theme = colourThemes.find((candidate) => candidate.id === id) ?? colourThemes[0];
  const primary = dark ? mix(theme.primary, "#ffffff", 0.6) : theme.primary;
  const page = dark ? mix(theme.primary, "#101413", 0.9) : theme.paper;
  const card = dark ? mix(theme.primary, "#1b211f", 0.9) : "#ffffff";
  const text = dark ? "#eef2ef" : "#18211d";
  const muted = dark ? "#b7c0ba" : "#5f6963";
  const tint = mix(card, primary, dark ? 0.12 : 0.08);
  const border = mix(card, primary, dark ? 0.28 : 0.2);
  return {
    background: card,
    foreground: text,
    card,
    "card-foreground": text,
    primary,
    "primary-foreground": dark ? "#111a15" : "#ffffff",
    secondary: tint,
    "secondary-foreground": text,
    muted: mix(card, primary, 0.05),
    "muted-foreground": muted,
    accent: mix(card, theme.accent, dark ? 0.15 : 0.12),
    "accent-foreground": text,
    destructive: dark ? "#ff9999" : "#b83b3b",
    border,
    input: border,
    ring: primary,
    page,
    sidebar: dark ? page : mix(page, "#ffffff", 0.5),
    "sidebar-accent": tint,
    "sidebar-accent-foreground": primary,
    "theme-ornament": theme.accent
  };
}
