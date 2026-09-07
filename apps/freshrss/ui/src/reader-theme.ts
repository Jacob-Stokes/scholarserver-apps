import { readAppearance, subscribeAppearance } from "@scholarserver/ui/appearance";
import { type Appearance, themeTokens } from "@scholarserver/ui/themes";
import "../../../../vendor/scholarserver-ui/source.css";
import "../../../../vendor/scholarserver-ui/typography.css";
import "../../../../vendor/scholarserver-ui/nebula.css";
import "./reader-theme.css";

function update(appearance: Appearance) {
  const dark =
    appearance.mode === "dark" ||
    (appearance.mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  // Read the shared palette directly; never maintain a second list of colours.
  const tokens = themeTokens(appearance.theme, dark);
  for (const [name, value] of Object.entries(tokens)) {
    document.documentElement.style.setProperty(`--ss-reader-${name}`, value);
  }
  document.documentElement.classList.add("ss-reader");
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", tokens.page);
  }
}

update(readAppearance());
subscribeAppearance(update);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => update(readAppearance()));

function brandHeader() {
  const link = document.querySelector(".header .title a");
  if (!link) return;
  // Only decorate FreshRSS's header; leave its persisted logo and article HTML alone.
  const brand = document.createElement("span");
  brand.className = "ss-reader-brand";
  const mark = document.createElement("span");
  mark.className = "ss-reader-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "S";
  const name = document.createElement("span");
  name.textContent = "ScholarServer";
  const attribution = document.createElement("small");
  attribution.textContent = "FreshRSS";
  name.append(attribution);
  brand.append(mark, name);
  link.replaceChildren(brand);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", brandHeader, { once: true });
else brandHeader();
