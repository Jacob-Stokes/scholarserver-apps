# Editorial package icons — source candidates

14 September 2026. Not published, signed, installed or deployed by this pass.
The new source identities below are deliberately marked `editorial`; they are
not replacements for immutable old package archives or installed manifests.

## Artwork and safe asset contract

Each app owns `artwork/editorial.svg`, an editable 128-unit path drawing without
fonts, scripts, external references or embedded bitmaps. Only the generated
256×256 transparent PNG under `package/assets/icons/<app>-editorial.png` is
declared in `presentation.editorialIcon`. That optional declaration has exactly
the same path, media type and attribution shape as `presentation.icon`.
The original WebP bytes and their selfh.st/Files attributions are unchanged.

| App | Editorial mark | Colour |
| --- | --- | --- |
| Zotero | Italic serif Z | `#bb3843` |
| Obsidian | Solid diamond | `#7550a7` |
| Docling | Outline diamond containing a solid diamond | `#a06a2f` |
| n8n | Compact typographic n8n | `#c26463` |
| Logseq | Three equal outliner lines | `#4d7e88` |
| Files | Overlapping document sheets | `#477b55` |
| FreshRSS | Feed dot and broadcast arcs | `#a06a2f` |

The first five follow core's `docs/design-studies/scholarserver-directions.html`;
Files and Feed extend the same plain geometric vocabulary. These are
ScholarServer editorial marks, not upstream logos. The original artwork is
provided under CC BY 4.0, attributed to ScholarServer editorial marks with the
repository and licence URLs in every declaration. No font software is copied.
`editorial-icons.lock.json` locks both source and raster SHA-256 values separately
from the original `icons.lock.json`. n8n's served `ICON-NOTICES.txt` covers both sets.

## Reproduction and checks

From the apps repository:

```sh
npm run icons:editorial:render
npm run icons:editorial:check
node --test tests/package-contract.test.mjs apps/n8n/ui/test/*.test.mjs
node scripts/check-shared-ui.mjs --core-ui /path/to/academic-system/packages/ui
```

The rasterizer defaults to `/opt/homebrew/bin/magick`; use `EDITORIAL_MAGICK`
for another explicit executable. The reviewed output uses ImageMagick 7.1.2-3
with one thread, bounded memory, transparent RGBA and stripped timestamps.
`--write` regenerates only the seven selected rasters and prints proposed hashes;
review the images and update the lock deliberately. It never advances package
versions or accepts new hashes automatically. Start from a new unpublished
package identity before changing artwork. `--check` renders in a disposable
temporary directory, compares bytes and removes only that temporary directory.
A different rasterizer version may produce different PNG bytes: review those
differences instead of silently accepting a new lock.

The package tests check regular files, containment, 512 KiB size bounds, PNG
signature/dimensions/transparency, hashes, independent attribution, original
asset preservation and n8n image-source inputs. They need no ImageMagick.
The standalone raster check additionally verifies the PNGs against current SVGs.
Initial visual QA caught inherited SVG strokes disappearing in this ImageMagick
renderer; Files/Feed now use filled outlines and the complete set was rechecked.

## New source identities and release gate

One final prerelease number is incremented per package, followed by an explicit
editorial checkpoint suffix. Upstream software versions, image references,
Compose, capabilities, grants, data and setup declarations are unchanged.

| App | Prior source identity | Editorial source identity |
| --- | --- | --- |
| Docling | `0.3.5-beta.3` | `0.3.5-beta.4.editorial.20260914.1` |
| Files | `0.1.0-beta.4` | `0.1.0-beta.5.editorial.20260914.1` |
| FreshRSS | `0.1.0-beta.6` | `0.1.0-beta.7.editorial.20260914.1` |
| Logseq | `0.1.0-beta.3` | `0.1.0-beta.4.editorial.20260914.1` |
| n8n | `0.1.0-guided.20260912.1` | `0.1.0-guided.20260912.2.editorial.20260914.1` |
| Obsidian | `0.5.0-beta.3` | `0.5.0-beta.4.editorial.20260914.1` |
| Zotero | `0.5.10-guided.20260913.1` | `0.5.10-guided.20260913.2.editorial.20260914.1` |

These remain source inputs outside the published catalog. Every app has an
explicit `RELEASE_BLOCKED.md`, recognised by `scripts/build-release.sh`;
existing n8n/Obsidian gates are preserved. No `catalog/dist` archive/index or
accepted `catalog/image-source-lock.json` record is updated. Locally available
source history was used for identities, not a claim of fresh registry inventory.

Before publication, main must select a released core minimum that actually
supports `presentation.editorialIcon`; the inherited `>=0.1.0` is **not**
evidence that old cores accept this new field. Qualify the exact new package,
its assets/attribution and authenticated browser delivery. Rebuild and qualify
native images for changed UI source/shared snapshot inputs, then select new
immutable image pins and source-lock records. Retain unchanged image pins where
no runtime input changed, such as the Files worker. The current old image pins
are intentionally not evidence that this pass is in a runtime image. The n8n
source-lock check rejects its previous record as stale, as expected.

For a separately authorised retained-host UI-only override, leave installed
package records and catalog archives untouched. Manager can use original icons
when those packages have no editorial declaration. Do not copy editorial assets
into an old version to make it appear upgraded. Package-defined Manager editorial
visibility needs a separate qualified package update. The n8n UI can show its
bundled fallbacks independently, but that does not qualify a catalog update.

## n8n browser presentation and shared snapshot

`AppRoles` reads/subscribes through `@scholarserver/ui/icon-preference`, using
`useSyncExternalStore`. Core owns the browser-local default (`editorial`), storage
key and cross-document events; this app neither writes server settings nor adds
another preference store. Mode changes do not own or reset forms/workflows.

The browser makes one bounded, abortable GET of `/api/v1/catalog` for presentation
metadata, including in embedded setup. It never uses the engine's service identity
or changes setup readiness. Only same-origin versioned catalog icon routes are
accepted. Editorial selection tries catalog editorial, packaged editorial,
catalog original, packaged original; Original tries only originals. Image errors
advance through that list and finally leave the existing named placeholder.
Known role fallbacks remain app-owned in `app-icons.ts`, generated from the three
packages' real asset files with `?no-inline`, not Manager glyph/name hardcoding.
Unknown/older packages use catalog originals or names. All roles retain visible
names and decorative empty-alt images. SVG is never served as an image fallback.
Only an actually selected catalog or bundled editorial URL receives the shared
`ss-editorial-icon` dark-mode contrast class; Original mode and original-image
fallbacks retain unfiltered upstream colours.

The integration Dockerfile already copies these three icon directories. Its source
inventory now explicitly fingerprints the three editorial PNGs as well. Existing
setup, research discovery, grants, workflow payloads and scheduling remain unchanged.
The separate setup-time overview lookup is retained; only icon discovery stopped
using the broader overview response.

After main's explicit readiness notification, vendor was deliberately synchronised
from the dirty canonical core tree: styles, themes, typography, icon preference,
its package export and the formatting-equivalent endpoint-access file. All 65
canonical runtime/font files match byte-for-byte. Vendor-only folder picker,
export/peer requirements, README and source provenance metadata remain. Core-only
tests, node_modules and development tsconfig are not copied. The shared checker
compares runtime bytes and canonical package exports/dependencies while allowing
those vendor-only additions; it does not claim a published shared package checksum.

Verification passed: 26 asset/package/n8n tests, 25 source-inventory/notification/
pipeline tests, 20 native-pipeline/local-development/candidate unit tests (not
native-image execution), all six app UI typechecks, n8n UI production build (separate
original and editorial raster files), seven current-core package-loader checks,
raster/source byte comparison and shared vendor consistency. The dark-mode
follow-up was included in the final n8n typecheck and focused test run; actual
browser contrast/interaction remains a main-owned check, not a source-test claim.
The seven existing project-vault notes and app index were updated through Jacob
Gateway with these source-only boundaries. No vault content is stored in this repo.
Main owns the final full `npm test`, cross-repository sync, commit and release gate.
