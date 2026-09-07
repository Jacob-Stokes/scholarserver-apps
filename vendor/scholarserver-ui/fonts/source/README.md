# Source typography

Default pairing: Source Serif 4 headings and Source Sans 3 body text.
Unmodified WOFF2 assets from `@fontsource-variable/source-sans-3@5.3.0`
and `@fontsource-variable/source-serif-4@5.3.0`, the same pinned packages
used in the approved local comparison. Serif uses the standard variable
font with optical sizing. Both families include normal and italic styles,
weights 200–900 and all subsets supplied by these packages. Unicode ranges
in `../../source.css` let browsers load only the subsets they need.

SIL OFL 1.1 and Adobe copyright notices are retained in `../../source.css`
as a preserved comment so every built stylesheet carries attribution.
No runtime font CDN or third-party request is used. Other scripts fall back
to the device's fonts. Existing explicit browser font choices are preserved;
new or unset preferences use Source.

Sources: https://github.com/adobe-fonts/source-sans and
https://github.com/adobe-fonts/source-serif.
