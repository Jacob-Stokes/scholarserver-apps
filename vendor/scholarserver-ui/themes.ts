export const colourThemes = [
  { id: "original", name: "Original", primary: "#194c32", paper: "#fcfaf6", accent: "#5b9d87" },
  { id: "euler", name: "Euler", primary: "#234e90", paper: "#cddfff", accent: "#b48b42" },
  { id: "darwin", name: "Darwin", primary: "#526020", paper: "#e4ebc3", accent: "#896446" },
  { id: "du-bois", name: "Du Bois", primary: "#84213f", paper: "#f4cadb", accent: "#d4a72c" },
  { id: "leonardo", name: "Da Vinci", primary: "#74471e", paper: "#e4d1ae", accent: "#b46b50" },
  { id: "newton", name: "Newton", primary: "#623790", paper: "#e2cdfb", accent: "#8262ad" },
  { id: "humboldt", name: "Humboldt", primary: "#005c70", paper: "#bceff3", accent: "#45833c" },
  { id: "merian", name: "Merian", primary: "#9a4910", paper: "#ffe2c4", accent: "#4b663c" },
  { id: "goethe", name: "Goethe", primary: "#786000", paper: "#f5e9a9", accent: "#69518a" },
  { id: "cajal", name: "Cajal", primary: "#48423f", paper: "#e4e3e3", accent: "#b77881" },
  { id: "lovelace", name: "Lovelace", primary: "#853875", paper: "#f2bcec", accent: "#b65564" },
  { id: "copernicus", name: "Copernicus", primary: "#943b31", paper: "#f7d1bf", accent: "#484540" },
  { id: "du-chatelet", name: "Du Châtelet", primary: "#4c537a", paper: "#ccd1df", accent: "#ac8c4d" }
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
  const primary = dark ? mix(theme.primary, "#ffffff", 0.54) : theme.primary;
  // Keep the palette visible across large surfaces, with quieter cards for reading.
  const page = dark ? mix(theme.primary, "#101413", 0.6) : theme.paper;
  let card = "#ffffff";
  if (dark) {
    card = mix(theme.primary, "#1b211f", 0.65);
  } else if (theme.id !== "original") {
    card = mix(theme.paper, "#ffffff", 0.75);
  }
  const text = dark ? "#eef2ef" : "#18211d";
  const muted = dark ? "#b7c0ba" : "#4b554f";
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
    sidebar: dark ? page : mix(page, "#ffffff", 0.2),
    "sidebar-accent": tint,
    "sidebar-accent-foreground": primary,
    "theme-ornament": theme.accent
  };
}
