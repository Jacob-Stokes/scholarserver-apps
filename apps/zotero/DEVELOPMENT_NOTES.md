# Zotero development notes

## Guided candidate — 12 September 2026

The new controller and relay are now built and native-startup/restart qualified
on Resolution, with new immutable image references selected by AMD64-only package
`0.5.10-guided.20260912.1`. ARM64 is deliberately not advertised by this candidate.
The previous setup checkpoint's source-only publication gate is superseded for
AMD64 image publication, not for browser, account, sync or Gateway acceptance.
See [the candidate record](../../docs/guided-candidate-20260912.md) for exact
provenance and limits. Mac Docker and personal profiles remain untouched.

## Setup boundary checkpoint — 12 September 2026

Both install variants retain a Zotero MCP service. Normal tool requests go from
Gateway through MCP to either the protected Desktop API relay or Zotero's Web
API. The setup controller is not the normal MCP request path.

The relay now has its own minimal entry point instead of importing the entire
controller. The controller image explicitly ships the account-link coordinator
and separated library-action module; source fingerprint inputs cover these files.
Existing attachment/Docling action contracts, worker settings and schedules are
preserved. The plugin's legacy Docling importer has not yet been migrated to
HTTP uploads or n8n; see the focused readability review.

Website login now has a controller-owned persisted session and background
observer. Reloading the page observes the same request. Cancellation cannot
produce a connected message, interrupted starts are not silently replayed, and
public status omits login tokens and URLs. The protected session endpoint can
return the official login URL to resume a pending flow. Internal Zotero login
functions remain a pinned-version compatibility dependency, not a stable public
setup API. Online mode still uses a manually created Web API key; OAuth app
registration and client-credential ownership require a separate decision.

Local approval uses the shared setup panel, with a same-origin desktop view and
separate-tab fallback. No CORS or frame restrictions were weakened. Ongoing
access requires Zotero's remembered grant rather than a single-use Allow. A
failed Desktop/setup probe can no longer be hidden by a stored local key. Setup
completion copy distinguishes saved connection settings from initial sync,
attachment delivery and Gateway acceptance. Reauthorization after revocation
and interrupted authorization still need real-client testing.

Checks: full `npm test` passed (including its explicit platform skips), focused
Zotero/relay tests passed, and all nineteen image recipes validate. A single
isolated browser against source UI and synthetic APIs passed login resume,
cancellation, continuation, denied permission, retry, panel dismissal and
cross-origin fallback. Screenshots are in `.dev/zotero-setup-boundary`; run
`scripts/check-zotero-setup.mjs` with the existing browser-module path to repeat.
These are source and mocked-browser checks, not fresh installation or actual
account/attachment/Gateway acceptance.

Mac Docker stayed stopped. The full suite ran as one command with a 512 MiB
per-process JavaScript heap limit; it includes small TypeScript builds, not
Docker image builds. Swap remained unused in the before/after samples. No
personal native profile, retained server or paid resource was changed.

Publication gate: controller and relay images must be rebuilt, qualified on
native architectures, and selected in a new immutable package version with new
source-lock records. Existing image digests and candidate metadata were not
rewritten to imply that they contain this source. Freelove is unchanged.
The source-lock check was run for both changed recipes and rejected their old
records as stale, as expected. Those records were not regenerated without builds.
The project-vault note update is pending: this pass deliberately did not access
the personal Obsidian profile or vault. The repository guide
`docs/install-options.md` beside this app is authoritative for this checkpoint.

## Image refresh checkpoint — 12 September 2026

Candidate `0.5.10-beta.3` selects five refreshed immutable AMD64/ARM64 images.
The local API bridge now packages all modules imported by its controller. Both
native runs start a real disposable Zotero desktop profile, verify bridge token
permissions and missing/wrong-token rejection, load the UI and retain bridge
identity through restart. The unconnected profile is deliberate. Account/library
sync is not claimed; `research-items` remains withheld from package grants pending
real-library acceptance.

Image publication does not publish the official catalog package or upgrade
Freelove. Exact source revisions, nineteen native image records, test scope and
cleanup are in [the refresh report](../../docs/package-refresh-20260912.md).
Earlier dated entries below describe their own checkpoints.


## 12 September 2026 — bridge image dependency closure

The first rebuilt local API bridge exited before listening with
`ERR_MODULE_NOT_FOUND` for `@scholarserver/controller-runtime`. Its Dockerfile
still copied only `controller.mjs`, although that file now imports the shared
atomic-file helpers, status model and bounded research metadata reader. The
controller image already copied those dependencies; the bridge recipe did not.

The bridge now includes the same imported modules without changing its command,
user, API boundary or data mounts. A recipe regression covers both entry points.
New native image and startup results belong to the package-build audit; the
first failed image is not qualified or published as the package update.

## Read-only research metadata — 9 September 2026

The controller has a candidate `research-items` action for n8n reading notes and
digests. It uses the existing authenticated personal-library API, not a database
reader. It bounds the date window to eight days and scans at most 1,000 recent
top-level items; an incomplete result fails rather than silently truncating.
Only keys, titles, creators, dates, DOI and Zotero links are returned. Notes,
attachment content, paths and credentials are not exported by this action.

Source tests verify filtering, bounds and field selection. Native n8n tests use
synthetic responses; the actual local/Web API action still needs acceptance.
Its package declaration is intentionally withheld until a new compatible
controller image/version is published. See `apps/n8n/RESEARCH_WORKFLOWS.md`.
Live 0.4.2 remains connected in linked-folder mode and was not upgraded. The old
automation worker, settings, schedules and history are unchanged.

## Catalog tags — 11 September 2026

The package manifest now declares the app-owned `References`, `Notes`,
`Documents` and `Files` tags under `presentation.details.tags`. The metadata-only
source candidate is `0.5.10-beta.2`; existing images, requirements and
runtime/security settings are unchanged. No package was published or deployed.
The Obsidian project-vault note was updated through Jacob Gateway on 11
September 2026; this repository's catalog-tags document remains authoritative
for the exact vocabulary.
