# Contributor guide

## Scope

This repository contains first-party ScholarServer application packages. Keep each
application independently buildable and avoid application-specific behavior in the
ScholarServer core.

## Durable integration lessons

Before adding an app or changing its packaging, read
`docs/application-integration-lessons.md` and the app's `DEVELOPMENT_NOTES.md`,
when present. Record consequential difficulties, decisions and unresolved questions
as work proceeds. Keep reusable lessons in the shared document and version-specific
findings beside the app. Include evidence or a regression test where possible;
do not turn assumptions into verified claims. Update superseded guidance rather
than accumulating contradictory instructions. Never record secrets or user data.

## Readability over brevity

Apply this to controllers, interfaces, MCP tools, tests, scripts and manifests.
Use explicit branches and meaningful intermediate names for multi-step decisions;
avoid nested ternaries and hidden side effects inside transformations. Separate
network/file operations from state decisions when this clarifies their ownership.
Extract helpers for real responsibilities, not just to shorten files. Keep
security checks, error handling and persistence ordering explicit, even when
longer. Comments should explain why. Tests must cover state transitions and
failure paths. Verify runtime entry points before removing obsolete code, and
keep new runtime files in the image recipe. Do not invent a generic app framework
or YAML inheritance to eliminate small, understandable differences between apps.

## Application screen conventions

- All application main screens use `@scholarserver/ui/application-screen` for the
  shared header, heading, section navigation, loading and feedback. Setup forms
  use `setup-pipeline`; endpoint choices use `endpoint-access`; colours use shared
  tokens. Improve shared presentation once rather than copying it into each app.
- Keep app-specific rules, requests, routes and credentials in the app. Shared
  visual components receive data and callbacks; they do not own application state.
- Keep one owner for an editable form. Polling observes health and must not replace
  unsaved choices. Extract named setup decisions and focused panels, not a generic
  workflow engine that hides each app's requirements.
- Shared primitives originate in ScholarServer's `packages/ui`; the vendor folder
  is the build snapshot. Update both deliberately and verify existing consumers.
- Test shared navigation and feedback across all current screens, then test each
  changed workflow's save failure, draft preservation and resume behaviour.

## Web-first and future device setup

The web interface must remain complete; a desktop companion is optional future
work. Keep local setup instructions with each app: distinguish server installation
from software on the researcher's computer, document supported upstream download
and setup links, prerequisites, consent and a manual fallback. Never confuse a
server data path with a local folder. Do not silently edit existing libraries or
install plugins. Do not add executable catalog scripts or speculative manifest
fields for a companion that does not exist. Browser effects stay at presentation
edges; app rules and secrets do not move into shared UI or Manager.

## Required checks

- Run `npm test` before committing.
- After each substantial change pass, commit verified work and push the current
  branch. A source push is not a package publication or deployment.
- Build only for the native host architecture locally.
- Never add QEMU, Rosetta, or another emulation path to release workflows.
- Never commit credentials, enrollment requests, generated service tokens, or vault data.
- Use existing development resources for ordinary work. Create paid disposable
  servers only for necessary full production-like end-to-end tests, record their
  exact IDs, then delete them and verify deletion after testing. Never retain a
  paid test server for a UI preview. Adventure is excluded from cleanup; never
  reinstall Freelove or Resolution for tests.
- Images referenced by released package manifests must use immutable SHA-256 digests.

## Package contract

- Compose templates may use only placeholders declared by the ScholarServer schema.
- Persistent paths must be declared in the package manifest.
- One-time credentials must use declared onboarding actions and must never appear in
  Compose environment variables or command-line output.
- Every long-running service must provide a non-shell health check.
