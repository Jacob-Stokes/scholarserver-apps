import { createElement } from "react";

// Exact approved vector from resources/branding/scholarserver-logo.svg.
// Embed it so app-owned screens need no Manager asset URL or additional host route.
const source =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="438.252" height="335.615" viewBox="0 0 438.252 335.615">\n  <title>ScholarServer logo</title>\n  <defs>\n    <linearGradient id="scholarserver-green" gradientUnits="userSpaceOnUse" x1="1415.43095" y1="304.371184" x2="1759.67875" y2="472.104064">\n      <stop offset="0" stop-color="#477865"/>\n      <stop offset="1" stop-color="#244a3c"/>\n    </linearGradient>\n  </defs>\n  <g transform="translate(-1321.427 -300.497)">\n    <path fill="url(#scholarserver-green)" d="m 1540.553,300.497 219.126,115.041 h -113.126 l -106,55.65 -106,-55.65 h -113.126 z m -106,137.003 106,55.65 106,-55.65 v 70 l -106,55.65 -106,-55.65 z m -54,63.612 160,84 160,-84 v 51 l -160,84 -160,-84 z M 1687.2000,415.5380 L 1700.8000,415.5380 L 1700.8000,436.3307 L 1714.4000,451.6307 L 1706.7500,461.8307 L 1712.7000,487.3307 L 1675.3000,487.3307 L 1681.2500,461.8307 L 1673.6000,451.6307 L 1687.2000,436.3307 Z"/>\n  </g>\n</svg>'
  );

export function ScholarServerLogo({ className }: { className?: string }) {
  return createElement("img", { src: source, className, width: 44, height: 34, alt: "", "aria-hidden": true });
}
